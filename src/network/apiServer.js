import http from 'node:http';
import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { evaluateJobRequest } from '../intelligence/agentRuntime.js';

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

export function startAgentApi({
  port = 8080,
  offlineMode = false,
  logger = pino({ level: 'info', name: 'agent-api' })
} = {}) {
  const jobs = new Map();
  const metrics = {
    submitted: 0,
    completed: 0,
    failed: 0,
    tokensEarned: 0n,
    lastJobProvider: 'local',
    lastProjectedReward: 0n
  };

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
        jsonResponse(res, 200, { jobs: Array.from(jobs.values()) });
        return;
      }

      if (req.method === 'GET' && req.url.startsWith('/jobs/')) {
        const id = req.url.split('/')[2];
        if (!id || !jobs.has(id)) {
          jsonResponse(res, 404, { error: 'Job not found' });
          return;
        }
        jsonResponse(res, 200, jobs.get(id));
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
        server.close(() => resolve());
      }),
    getMetrics: () => ({
      ...metrics,
      tokensEarned: metrics.tokensEarned,
      throughput: metrics.completed,
      successRate: metrics.submitted === 0 ? 1 : metrics.completed / metrics.submitted
    }),
    listJobs: () => Array.from(jobs.values())
  };
}
