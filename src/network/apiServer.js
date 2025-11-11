import http from 'node:http';
import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { getAddress, parseUnits } from 'ethers';
import { z } from 'zod';
import { evaluateJobRequest } from '../intelligence/agentRuntime.js';
import {
  buildSystemPauseTx,
  buildMinimumStakeTx,
  buildValidatorThresholdTx,
  buildStakeRegistryUpgradeTx,
  buildRoleShareTx,
  buildGlobalSharesTx,
  buildJobRegistryUpgradeTx,
  buildDisputeTriggerTx,
  buildIdentityDelegateTx,
  getOwnerFunctionCatalog
} from '../services/governance.js';
import { buildStakeAndActivateTx } from '../services/staking.js';
import { recordGovernanceAction } from '../services/governanceLedger.js';

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

const checksumAddressSchema = z
  .string()
  .min(1)
  .transform((value, ctx) => {
    try {
      return getAddress(value);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid address: ${error instanceof Error ? error.message : String(error)}`
      });
      return z.NEVER;
    }
  });

const decimalAmountSchema = z
  .union([z.string(), z.number(), z.bigint()])
  .transform((value, ctx) => {
    const asString = typeof value === 'string' ? value.trim() : value.toString();
    if (!/^\d+(\.\d{0,18})?$/.test(asString)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'amount must be numeric with up to 18 decimals'
      });
      return z.NEVER;
    }
    try {
      parseUnits(asString, 18);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : String(error)
      });
      return z.NEVER;
    }
    return asString;
  });

const basisPointsSchema = z.coerce.number().int().min(0).max(10_000);

const bigIntSchema = z
  .union([z.string(), z.number(), z.bigint()])
  .transform((value, ctx) => {
    const asString = typeof value === 'string' ? value.trim() : value.toString();
    if (!/^-?\d+$/.test(asString)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'value must be an integer'
      });
      return z.NEVER;
    }
    try {
      return BigInt(asString);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : String(error)
      });
      return z.NEVER;
    }
  });

const booleanFlagSchema = z
  .union([
    z.boolean(),
    z.string().transform((value) => {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
      if (['false', '0', 'no', 'off'].includes(normalized)) return false;
      throw new Error('value must be a boolean-like flag');
    })
  ])
  .transform((value) => Boolean(value));

const tagsSchema = z
  .union([
    z.array(z.string()),
    z.string()
  ])
  .optional()
  .transform((value) => {
    if (!value) {
      return [];
    }
    if (Array.isArray(value)) {
      return value.map((tag) => tag.trim()).filter((tag) => tag.length > 0);
    }
    return value
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  });

const governanceCommonSchema = z.object({
  dryRun: z.boolean().optional().default(true),
  confirm: z.boolean().optional().default(false),
  signature: z.string().optional(),
  operator: checksumAddressSchema.optional(),
  tags: tagsSchema.default([])
});

function extractAuthToken(req) {
  const header = req.headers['authorization'];
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  const alt = req.headers['x-owner-token'];
  if (typeof alt === 'string') {
    return alt.trim();
  }
  if (Array.isArray(alt) && alt.length > 0) {
    return String(alt[0]).trim();
  }
  return null;
}

function ensureOwnerAuthorization(req, ownerToken) {
  if (!ownerToken) {
    const error = new Error('Governance API token is not configured');
    error.statusCode = 500;
    throw error;
  }
  const provided = extractAuthToken(req);
  if (!provided || provided !== ownerToken) {
    const error = new Error('Owner authorization required');
    error.statusCode = 401;
    throw error;
  }
}

const systemPauseSchema = governanceCommonSchema
  .extend({
    systemPauseAddress: checksumAddressSchema.optional(),
    contract: checksumAddressSchema.optional(),
    action: z.string().optional()
  })
  .transform((value) => {
    const { contract, systemPauseAddress, ...rest } = value;
    const resolved = systemPauseAddress ?? contract;
    if (!resolved) {
      throw new Error('systemPauseAddress is required');
    }
    return { ...rest, systemPauseAddress: resolved };
  });

const minimumStakeSchema = governanceCommonSchema
  .extend({
    stakeManagerAddress: checksumAddressSchema,
    amount: decimalAmountSchema,
    currentAmount: decimalAmountSchema.optional(),
    current: decimalAmountSchema.optional()
  })
  .transform((value) => {
    const { currentAmount, current, ...rest } = value;
    return { ...rest, currentAmount: currentAmount ?? current ?? null };
  });

const validatorThresholdSchema = governanceCommonSchema
  .extend({
    stakeManagerAddress: checksumAddressSchema,
    threshold: bigIntSchema,
    currentThreshold: bigIntSchema.optional(),
    current: bigIntSchema.optional()
  })
  .transform((value) => {
    const { currentThreshold, current, ...rest } = value;
    return { ...rest, currentThreshold: currentThreshold ?? current ?? null };
  });

const registryUpgradeSchema = governanceCommonSchema.extend({
  stakeManagerAddress: checksumAddressSchema,
  registryType: z.string().min(2),
  newAddress: checksumAddressSchema,
  currentAddress: checksumAddressSchema.optional()
});

const roleShareSchema = governanceCommonSchema.extend({
  rewardEngineAddress: checksumAddressSchema,
  role: z.string().min(1),
  shareBps: basisPointsSchema,
  currentShareBps: basisPointsSchema.optional()
});

const globalSharesSchema = governanceCommonSchema
  .extend({
    rewardEngineAddress: checksumAddressSchema,
    operatorShareBps: basisPointsSchema,
    validatorShareBps: basisPointsSchema,
    treasuryShareBps: basisPointsSchema,
    operatorBps: basisPointsSchema.optional(),
    validatorBps: basisPointsSchema.optional(),
    treasuryBps: basisPointsSchema.optional(),
    currentOperatorShareBps: basisPointsSchema.optional(),
    currentValidatorShareBps: basisPointsSchema.optional(),
    currentTreasuryShareBps: basisPointsSchema.optional(),
    currentOperatorBps: basisPointsSchema.optional(),
    currentValidatorBps: basisPointsSchema.optional(),
    currentTreasuryBps: basisPointsSchema.optional()
  })
  .transform((value) => {
    const operatorShare = value.operatorShareBps ?? value.operatorBps;
    const validatorShare = value.validatorShareBps ?? value.validatorBps;
    const treasuryShare = value.treasuryShareBps ?? value.treasuryBps;
    if (
      operatorShare === undefined ||
      validatorShare === undefined ||
      treasuryShare === undefined
    ) {
      throw new Error('operatorShareBps, validatorShareBps, and treasuryShareBps are required');
    }
    const currentShares = {};
    let hasCurrent = false;
    const currentOperator = value.currentOperatorShareBps ?? value.currentOperatorBps;
    if (currentOperator !== undefined) {
      currentShares.operatorShare = currentOperator;
      hasCurrent = true;
    }
    const currentValidator = value.currentValidatorShareBps ?? value.currentValidatorBps;
    if (currentValidator !== undefined) {
      currentShares.validatorShare = currentValidator;
      hasCurrent = true;
    }
    const currentTreasury = value.currentTreasuryShareBps ?? value.currentTreasuryBps;
    if (currentTreasury !== undefined) {
      currentShares.treasuryShare = currentTreasury;
      hasCurrent = true;
    }
    return {
      ...value,
      operatorShareBps: operatorShare,
      validatorShareBps: validatorShare,
      treasuryShareBps: treasuryShare,
      currentShares: hasCurrent ? currentShares : null
    };
  });

const jobModuleSchema = governanceCommonSchema.extend({
  jobRegistryAddress: checksumAddressSchema,
  module: z.string().min(2),
  newAddress: checksumAddressSchema,
  currentAddress: checksumAddressSchema.optional()
});

const disputeSchema = governanceCommonSchema.extend({
  jobRegistryAddress: checksumAddressSchema,
  jobId: bigIntSchema,
  reason: z.string().optional()
});

const identityDelegateSchema = governanceCommonSchema.extend({
  identityRegistryAddress: checksumAddressSchema,
  operatorAddress: checksumAddressSchema,
  allowed: booleanFlagSchema,
  currentAllowed: booleanFlagSchema.optional()
});

export function startAgentApi({
  port = 8080,
  offlineMode = false,
  jobLifecycle = null,
  logger = pino({ level: 'info', name: 'agent-api' }),
  ownerToken = null,
  ledgerRoot = process.cwd()
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
      payloads: 0,
      ledgerEntries: 0
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

  async function handleGovernanceRequest(req, res, schema, builder) {
    try {
      ensureOwnerAuthorization(req, ownerToken);
    } catch (authError) {
      logger.warn(authError, 'Unauthorized governance request');
      jsonResponse(res, authError.statusCode ?? 401, { error: authError.message });
      return;
    }

    let parsed;
    try {
      const body = await parseRequestBody(req);
      parsed = schema.parse(body ?? {});
    } catch (error) {
      logger.error(error, 'Invalid governance payload');
      jsonResponse(res, 400, { error: error.message });
      return;
    }

    try {
      const built = builder(parsed);
      const { meta, to, data, ...details } = built;
      const dryRun = parsed.dryRun !== false;
      const response = {
        dryRun,
        tx: { to, data },
        meta,
        details
      };
      if (!dryRun) {
        if (!parsed.confirm) {
          throw new Error('Owner confirmation required to persist payload');
        }
        const ledgerResult = recordGovernanceAction({
          payload: { to, data },
          meta,
          signature: parsed.signature ?? null,
          operator: parsed.operator ?? null,
          tags: parsed.tags ?? [],
          rootDir: ledgerRoot
        });
        metrics.governance.ledgerEntries += 1;
        response.ledgerEntry = {
          id: ledgerResult.entry.id,
          recordedAt: ledgerResult.entry.recordedAt,
          path: ledgerResult.filePath
        };
      }
      metrics.governance.payloads += 1;
      jsonResponse(res, 200, response);
    } catch (error) {
      logger.error(error, 'Failed to construct governance payload');
      const status = error.statusCode ?? (error.message?.includes('confirmation') ? 409 : 400);
      jsonResponse(res, status, { error: error.message });
    }
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

      if (req.method === 'GET' && req.url === '/governance/catalog') {
        jsonResponse(res, 200, { catalog: getOwnerFunctionCatalog() });
        return;
      }

      if (req.method === 'GET' && req.url === '/governance/directives') {
        try {
          ensureOwnerAuthorization(req, ownerToken);
        } catch (authError) {
          logger.warn(authError, 'Unauthorized directives fetch attempt');
          jsonResponse(res, authError.statusCode ?? 401, { error: authError.message });
          return;
        }

        jsonResponse(res, 200, { directives: exportOwnerDirectives() });
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/directives') {
        try {
          ensureOwnerAuthorization(req, ownerToken);
        } catch (authError) {
          logger.warn(authError, 'Unauthorized directives update attempt');
          jsonResponse(res, authError.statusCode ?? 401, { error: authError.message });
          return;
        }

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
        await handleGovernanceRequest(req, res, systemPauseSchema, (input) =>
          buildSystemPauseTx({
            systemPauseAddress: input.systemPauseAddress,
            action: input.action
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/minimum-stake') {
        await handleGovernanceRequest(req, res, minimumStakeSchema, (input) =>
          buildMinimumStakeTx({
            stakeManagerAddress: input.stakeManagerAddress,
            amount: input.amount,
            currentMinimum: input.currentAmount ? parseUnits(input.currentAmount, 18) : null
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/validator-threshold') {
        await handleGovernanceRequest(req, res, validatorThresholdSchema, (input) =>
          buildValidatorThresholdTx({
            stakeManagerAddress: input.stakeManagerAddress,
            threshold: input.threshold,
            currentThreshold: input.currentThreshold ?? null
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/registry-upgrade') {
        await handleGovernanceRequest(req, res, registryUpgradeSchema, (input) =>
          buildStakeRegistryUpgradeTx({
            stakeManagerAddress: input.stakeManagerAddress,
            registryType: input.registryType,
            newAddress: input.newAddress,
            currentAddress: input.currentAddress ?? null
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/role-share') {
        await handleGovernanceRequest(req, res, roleShareSchema, (input) =>
          buildRoleShareTx({
            rewardEngineAddress: input.rewardEngineAddress,
            role: input.role,
            shareBps: input.shareBps,
            currentShareBps: input.currentShareBps ?? null
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/global-shares') {
        await handleGovernanceRequest(req, res, globalSharesSchema, (input) =>
          buildGlobalSharesTx({
            rewardEngineAddress: input.rewardEngineAddress,
            operatorShareBps: input.operatorShareBps,
            validatorShareBps: input.validatorShareBps,
            treasuryShareBps: input.treasuryShareBps,
            currentShares: input.currentShares
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/job-module') {
        await handleGovernanceRequest(req, res, jobModuleSchema, (input) =>
          buildJobRegistryUpgradeTx({
            jobRegistryAddress: input.jobRegistryAddress,
            module: input.module,
            newAddress: input.newAddress,
            currentAddress: input.currentAddress ?? null
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/dispute') {
        await handleGovernanceRequest(req, res, disputeSchema, (input) =>
          buildDisputeTriggerTx({
            jobRegistryAddress: input.jobRegistryAddress,
            jobId: input.jobId,
            reason: input.reason
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/identity-delegate') {
        await handleGovernanceRequest(req, res, identityDelegateSchema, (input) =>
          buildIdentityDelegateTx({
            identityRegistryAddress: input.identityRegistryAddress,
            operatorAddress: input.operatorAddress,
            allowed: input.allowed,
            current:
              input.currentAllowed === undefined
                ? null
                : { operator: input.operatorAddress, allowed: input.currentAllowed }
          })
        );
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
