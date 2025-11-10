import http from 'node:http';
import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { getAddress } from 'ethers';
import { evaluateJobRequest } from '../intelligence/agentRuntime.js';
import {
  buildSystemPauseTx,
  buildMinimumStakeTx,
  buildRoleShareTx,
  buildGlobalSharesTx
} from '../services/governance.js';
import { buildStakeAndActivateTx } from '../services/staking.js';

function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload, (_, value) => (typeof value === 'bigint' ? value.toString() : value));
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req
      .on('data', (chunk) => chunks.push(chunk))
      .on('end', () => {
        if (chunks.length === 0) {
          resolve(null);
          return;
        }
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve(parsed);
        } catch (error) {
          reject(error);
        }
      })
      .on('error', (error) => reject(error));
  });
}

function cloneValue(value) {
  if (value === null) {
    return null;
  }
  const valueType = typeof value;
  if (valueType === 'bigint' || valueType === 'number' || valueType === 'boolean' || valueType === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => cloneValue(entry));
  }
  if (valueType === 'object') {
    const clone = {};
    for (const [key, nested] of Object.entries(value)) {
      clone[key] = cloneValue(nested);
    }
    return clone;
  }
  return value;
}

function sanitizeActions(actions) {
  if (actions === undefined) {
    return null;
  }
  if (!Array.isArray(actions)) {
    throw new Error('actions must be an array');
  }
  return actions.map((action, index) => {
    if (!action || typeof action !== 'object' || Array.isArray(action)) {
      throw new Error(`actions[${index}] must be an object`);
    }
    if (typeof action.type !== 'string' || action.type.trim().length === 0) {
      throw new Error(`actions[${index}].type must be a non-empty string`);
    }
    const sanitized = {};
    for (const [key, value] of Object.entries(action)) {
      if (key === 'type') {
        sanitized.type = action.type.trim();
      } else if (key === 'level') {
        sanitized.level = typeof value === 'string' ? value.trim() : String(value);
      } else if (key === 'reason') {
        sanitized.reason = typeof value === 'string' ? value : String(value);
      } else {
        sanitized[key] = cloneValue(value);
      }
    }
    if (!sanitized.type) {
      sanitized.type = action.type.trim();
    }
    return sanitized;
  });
}

function sanitizeNotices(notices) {
  if (notices === undefined) {
    return null;
  }
  if (!Array.isArray(notices)) {
    throw new Error('notices must be an array');
  }
  return notices.map((notice, index) => {
    if (notice === undefined || notice === null) {
      return '';
    }
    if (typeof notice === 'string') {
      return notice;
    }
    if (typeof notice === 'number' || typeof notice === 'boolean' || typeof notice === 'bigint') {
      return String(notice);
    }
    throw new Error(`notices[${index}] must be a string, number, boolean, or bigint`);
  });
}

function sanitizeContext(context) {
  if (context === undefined) {
    return null;
  }
  if (context === null) {
    return null;
  }
  if (typeof context !== 'object' || Array.isArray(context)) {
    throw new Error('context must be an object');
  }
  return cloneValue(context);
}

export function startAgentApi({
  port = 8080,
  offlineMode = false,
  jobLifecycle = null,
  logger = pino({ level: 'info', name: 'agent-api' })
} = {}) {
  const jobs = new Map();
  const lifecycleJobs = new Map();
  const metrics = {
    submitted: 0,
    completed: 0,
    failed: 0,
    tokensEarned: 0n,
    lastJobProvider: offlineMode ? 'offline' : 'local',
    lastProjectedReward: 0n,
    chain: {
      applications: 0,
      submissions: 0,
      finalizations: 0
    },
    governance: {
      directivesUpdates: 0,
      payloads: 0
    }
  };

  let lifecycleSubscription = null;
  let lifecycleActionSubscription = null;
  let ownerDirectives = {
    priority: 'nominal',
    actions: [],
    notices: [],
    context: {}
  };

  function exportOwnerDirectives() {
    return {
      priority: ownerDirectives.priority,
      actions: Array.isArray(ownerDirectives.actions)
        ? ownerDirectives.actions.map((action) => cloneValue(action))
        : [],
      notices: Array.isArray(ownerDirectives.notices)
        ? ownerDirectives.notices.map((notice) => (typeof notice === 'string' ? notice : String(notice)))
        : [],
      context:
        ownerDirectives.context && typeof ownerDirectives.context === 'object'
          ? cloneValue(ownerDirectives.context)
          : {}
    };
  }

  if (jobLifecycle) {
    try {
      jobLifecycle.listJobs().forEach((job) => {
        if (job?.jobId) {
          lifecycleJobs.set(job.jobId, job);
        }
      });
    } catch (error) {
      logger.warn(error, 'Failed to seed lifecycle jobs from initial snapshot');
    }
    lifecycleSubscription = jobLifecycle.on('job:update', (job) => {
      if (job?.jobId) {
        lifecycleJobs.set(job.jobId, job);
      }
    });
    lifecycleActionSubscription = jobLifecycle.on('action', (action) => {
      metrics.lastJobProvider = 'agi-jobs';
      if (!action?.type) return;
      if (action.type === 'apply') {
        metrics.chain.applications += 1;
      } else if (action.type === 'submit') {
        metrics.chain.submissions += 1;
      } else if (action.type === 'finalize') {
        metrics.chain.finalizations += 1;
      }
    });
  }

  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url) {
        jsonResponse(res, 404, { error: 'Not found' });
        return;
      }

      if (req.method === 'GET' && req.url === '/healthz') {
        jsonResponse(res, 200, {
          status: 'ok',
          offlineMode,
          submitted: metrics.submitted,
          completed: metrics.completed,
          failed: metrics.failed,
          lastJobProvider: metrics.lastJobProvider
        });
        return;
      }

      if (req.method === 'GET' && req.url === '/jobs') {
        jsonResponse(res, 200, {
          jobs: Array.from(jobs.values()),
          lifecycle: Array.from(lifecycleJobs.values())
        });
        return;
      }

      if (req.method === 'GET' && req.url.startsWith('/jobs/')) {
        const id = req.url.split('/')[2];
        if (!id) {
          jsonResponse(res, 404, { error: 'Job not found' });
          return;
        }
        if (jobs.has(id)) {
          jsonResponse(res, 200, jobs.get(id));
          return;
        }
        if (lifecycleJobs.has(id)) {
          jsonResponse(res, 200, lifecycleJobs.get(id));
          return;
        }
        jsonResponse(res, 404, { error: 'Job not found' });
        return;
      }

      if (req.method === 'GET' && req.url === '/jobs/open') {
        jsonResponse(res, 200, { jobs: Array.from(lifecycleJobs.values()) });
        return;
      }

      if (req.method === 'POST' && req.url === '/jobs') {
        const body = await parseRequestBody(req);
        const jobId = randomUUID();
        const jobRecord = {
          id: jobId,
          status: 'processing',
          submittedAt: new Date().toISOString(),
          payload: body
        };
        jobs.set(jobId, jobRecord);
        metrics.submitted += 1;

        try {
          const evaluation = await evaluateJobRequest(body ?? {}, { offlineMode, logger });
          metrics.completed += 1;
          const projectedReward = evaluation.metrics.projectedReward ?? 0n;
          metrics.tokensEarned += projectedReward;
          metrics.lastProjectedReward = projectedReward;
          metrics.lastJobProvider = evaluation.metrics.provider ?? 'local';
          const result = {
            ...jobRecord,
            status: 'completed',
            completedAt: new Date().toISOString(),
            result: {
              providerStatus: evaluation.providerStatus,
              plan: evaluation.plan,
              swarm: evaluation.swarm,
              curriculum: evaluation.curriculum,
              antifragility: evaluation.antifragility,
              comparison: evaluation.comparison,
              metrics: evaluation.metrics
            }
          };
          jobs.set(jobId, result);
          jsonResponse(res, 202, result);
        } catch (error) {
          metrics.failed += 1;
          const failure = {
            ...jobRecord,
            status: 'failed',
            completedAt: new Date().toISOString(),
            error: error.message
          };
          jobs.set(jobId, failure);
          logger.error(error, 'Job evaluation failed');
          jsonResponse(res, 500, { error: error.message, job: failure });
        }
        return;
      }

      if (req.method === 'GET' && req.url === '/governance/directives') {
        jsonResponse(res, 200, { directives: exportOwnerDirectives() });
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/directives') {
        try {
          const body = await parseRequestBody(req);
          if (!body || typeof body !== 'object' || Array.isArray(body)) {
            jsonResponse(res, 400, { error: 'Directive payload must be an object' });
            return;
          }
          if (body.priority !== undefined && typeof body.priority !== 'string') {
            jsonResponse(res, 400, { error: 'priority must be a string' });
            return;
          }
          const sanitizedActions = sanitizeActions(body.actions);
          const sanitizedNotices = sanitizeNotices(body.notices);
          const sanitizedContext = sanitizeContext(body.context);
          ownerDirectives = {
            priority:
              typeof body.priority === 'string' && body.priority.trim().length > 0
                ? body.priority
                : ownerDirectives.priority,
            actions: sanitizedActions ?? ownerDirectives.actions,
            notices: sanitizedNotices ?? ownerDirectives.notices,
            context: sanitizedContext ?? ownerDirectives.context
          };
          metrics.governance.directivesUpdates += 1;
          jsonResponse(res, 200, { directives: exportOwnerDirectives() });
        } catch (error) {
          logger.error(error, 'Failed to update owner directives via API');
          jsonResponse(res, 400, { error: error.message });
        }
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/pause') {
        try {
          const body = await parseRequestBody(req);
          if (!body?.systemPauseAddress) {
            jsonResponse(res, 400, { error: 'systemPauseAddress is required' });
            return;
          }
          const tx = buildSystemPauseTx({
            systemPauseAddress: body.systemPauseAddress,
            action: body.action
          });
          metrics.governance.payloads += 1;
          jsonResponse(res, 200, { tx });
        } catch (error) {
          logger.error(error, 'Failed to build system pause payload');
          jsonResponse(res, 400, { error: error.message });
        }
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/minimum-stake') {
        try {
          const body = await parseRequestBody(req);
          if (!body?.stakeManagerAddress) {
            jsonResponse(res, 400, { error: 'stakeManagerAddress is required' });
            return;
          }
          if (body.amount === undefined || body.amount === null) {
            jsonResponse(res, 400, { error: 'amount is required' });
            return;
          }
          const decimals = body.decimals === undefined ? undefined : Number.parseInt(body.decimals, 10);
          if (decimals !== undefined && (!Number.isFinite(decimals) || decimals < 0)) {
            jsonResponse(res, 400, { error: 'decimals must be a non-negative integer' });
            return;
          }
          const stakeArgs = {
            stakeManagerAddress: body.stakeManagerAddress,
            amount: body.amount
          };
          if (decimals !== undefined) {
            stakeArgs.decimals = decimals;
          }
          const tx = buildMinimumStakeTx(stakeArgs);
          metrics.governance.payloads += 1;
          jsonResponse(res, 200, { tx });
        } catch (error) {
          logger.error(error, 'Failed to build minimum stake payload');
          jsonResponse(res, 400, { error: error.message });
        }
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/role-share') {
        try {
          const body = await parseRequestBody(req);
          if (!body?.rewardEngineAddress) {
            jsonResponse(res, 400, { error: 'rewardEngineAddress is required' });
            return;
          }
          if (!body?.role) {
            jsonResponse(res, 400, { error: 'role is required' });
            return;
          }
          if (body.shareBps === undefined || body.shareBps === null) {
            jsonResponse(res, 400, { error: 'shareBps is required' });
            return;
          }
          const tx = buildRoleShareTx({
            rewardEngineAddress: body.rewardEngineAddress,
            role: body.role,
            shareBps: Number(body.shareBps)
          });
          metrics.governance.payloads += 1;
          jsonResponse(res, 200, { tx });
        } catch (error) {
          logger.error(error, 'Failed to build role share payload');
          jsonResponse(res, 400, { error: error.message });
        }
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/global-shares') {
        try {
          const body = await parseRequestBody(req);
          if (!body?.rewardEngineAddress) {
            jsonResponse(res, 400, { error: 'rewardEngineAddress is required' });
            return;
          }
          const operator = Number(body?.operatorShareBps ?? body?.operatorBps);
          const validator = Number(body?.validatorShareBps ?? body?.validatorBps);
          const treasury = Number(body?.treasuryShareBps ?? body?.treasuryBps);
          if (!Number.isFinite(operator) || !Number.isFinite(validator) || !Number.isFinite(treasury)) {
            jsonResponse(res, 400, { error: 'operatorShareBps, validatorShareBps, and treasuryShareBps are required' });
            return;
          }
          const tx = buildGlobalSharesTx({
            rewardEngineAddress: body.rewardEngineAddress,
            operatorShareBps: operator,
            validatorShareBps: validator,
            treasuryShareBps: treasury
          });
          metrics.governance.payloads += 1;
          jsonResponse(res, 200, { tx });
        } catch (error) {
          logger.error(error, 'Failed to build global shares payload');
          jsonResponse(res, 400, { error: error.message });
        }
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/stake-top-up') {
        try {
          const body = await parseRequestBody(req);
          if (!body?.incentivesAddress) {
            jsonResponse(res, 400, { error: 'incentivesAddress is required' });
            return;
          }
          if (body.amount === undefined || body.amount === null) {
            jsonResponse(res, 400, { error: 'amount is required' });
            return;
          }
          const decimals = body.decimals === undefined ? undefined : Number.parseInt(body.decimals, 10);
          if (decimals !== undefined && (!Number.isFinite(decimals) || decimals < 0)) {
            jsonResponse(res, 400, { error: 'decimals must be a non-negative integer' });
            return;
          }
          const stakeArgs = {
            amount: String(body.amount),
            incentivesAddress: getAddress(body.incentivesAddress)
          };
          if (decimals !== undefined) {
            stakeArgs.decimals = decimals;
          }
          const tx = buildStakeAndActivateTx(stakeArgs);
          metrics.governance.payloads += 1;
          jsonResponse(res, 200, { tx });
        } catch (error) {
          logger.error(error, 'Failed to build stake top-up payload');
          jsonResponse(res, 400, { error: error.message });
        }
        return;
      }

      if (req.method === 'POST' && /^\/jobs\/[^/]+\/apply$/.test(req.url)) {
        if (!jobLifecycle) {
          jsonResponse(res, 503, { error: 'Job lifecycle integration not configured' });
          return;
        }
        const [, , jobId] = req.url.split('/');
        const body = await parseRequestBody(req);
        try {
          const result = await jobLifecycle.apply(jobId, {
            subdomain: body?.subdomain,
            proof: body?.proof
          });
          jsonResponse(res, 202, {
            jobId: result.jobId,
            transactionHash: result.transactionHash,
            method: result.method
          });
        } catch (error) {
          logger.error(error, 'Failed to apply for job');
          jsonResponse(res, 500, { error: error.message });
        }
        return;
      }

      if (req.method === 'POST' && /^\/jobs\/[^/]+\/submit$/.test(req.url)) {
        if (!jobLifecycle) {
          jsonResponse(res, 503, { error: 'Job lifecycle integration not configured' });
          return;
        }
        const [, , jobId] = req.url.split('/');
        const body = await parseRequestBody(req);
        if (body?.result === undefined && body?.resultUri === undefined) {
          jsonResponse(res, 400, { error: 'result or resultUri required for submission' });
          return;
        }
        try {
          const result = await jobLifecycle.submit(jobId, {
            result: body?.result ?? body?.resultUri ?? '',
            resultUri: body?.resultUri,
            metadata: body?.metadata,
            subdomain: body?.subdomain,
            proof: body?.proof,
            timestamp: body?.timestamp
          });
          jsonResponse(res, 202, {
            jobId: result.jobId,
            transactionHash: result.transactionHash,
            method: result.method,
            commitment: result.commitment,
            resultHash: result.resultHash
          });
        } catch (error) {
          logger.error(error, 'Failed to submit job result');
          jsonResponse(res, 500, { error: error.message });
        }
        return;
      }

      if (req.method === 'POST' && /^\/jobs\/[^/]+\/finalize$/.test(req.url)) {
        if (!jobLifecycle) {
          jsonResponse(res, 503, { error: 'Job lifecycle integration not configured' });
          return;
        }
        const [, , jobId] = req.url.split('/');
        try {
          const result = await jobLifecycle.finalize(jobId);
          jsonResponse(res, 202, {
            jobId: result.jobId,
            transactionHash: result.transactionHash,
            method: result.method
          });
        } catch (error) {
          logger.error(error, 'Failed to finalize job');
          jsonResponse(res, 500, { error: error.message });
        }
        return;
      }

      jsonResponse(res, 404, { error: 'Not found' });
    } catch (error) {
      logger.error(error, 'API request handling failed');
      jsonResponse(res, 500, { error: 'Internal server error' });
    }
  });

  server.listen(port, () => {
    logger.info({ port, offlineMode }, 'Agent API server listening');
  });

  return {
    server,
    port,
    offlineMode,
    stop: () =>
      new Promise((resolve) => {
        server.close(() => {
          lifecycleSubscription?.();
          lifecycleActionSubscription?.();
          resolve();
        });
      }),
    getMetrics: () => ({
      ...metrics,
      tokensEarned: metrics.tokensEarned,
      throughput: metrics.completed,
      successRate: metrics.submitted === 0 ? 1 : metrics.completed / metrics.submitted
    }),
    listJobs: () => Array.from(jobs.values()),
    setOwnerDirectives: (directives) => {
      if (!directives || typeof directives !== 'object') {
        return;
      }
      try {
        const sanitizedActions = sanitizeActions(directives.actions);
        const sanitizedNotices = sanitizeNotices(directives.notices);
        const sanitizedContext = sanitizeContext(directives.context);
        ownerDirectives = {
          priority:
            typeof directives.priority === 'string' && directives.priority.trim().length > 0
              ? directives.priority
              : ownerDirectives.priority,
          actions: sanitizedActions ?? ownerDirectives.actions,
          notices: sanitizedNotices ?? ownerDirectives.notices,
          context: sanitizedContext ?? ownerDirectives.context
        };
        metrics.governance.directivesUpdates += 1;
      } catch (error) {
        logger.error(error, 'Failed to set owner directives');
      }
    },
    getOwnerDirectives: () => exportOwnerDirectives()
  };
}
