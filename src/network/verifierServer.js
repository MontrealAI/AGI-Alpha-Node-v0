import http from 'node:http';
import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { getNodeEnsName, getNodePayoutAddresses, buildEnsRecordTemplate } from '../ens/ens_config.js';
import { createAlphaWorkUnitValidator } from '../validation/alpha_wu_validator.js';

function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload, (_, value) => (typeof value === 'bigint' ? value.toString() : value));
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req
      .on('data', (chunk) => chunks.push(chunk))
      .on('end', () => {
        if (!chunks.length) {
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (error) {
          reject(error);
        }
      })
      .on('error', (error) => reject(error));
  });
}

function deriveSupportedRoles(config) {
  const role = (config?.NODE_ROLE ?? 'mixed').toLowerCase();
  if (role === 'validator') {
    return ['validator'];
  }
  if (role === 'orchestrator') {
    return ['orchestrator'];
  }
  if (role === 'executor') {
    return ['executor'];
  }
  return ['orchestrator', 'validator', 'executor'];
}

export function startVerifierServer({
  config,
  port = null,
  logger = pino({ level: 'info', name: 'verifier-server' })
}) {
  if (!config) {
    throw new Error('config is required to start verifier server');
  }

  const listenPort = Number.isInteger(port) ? port : config.VERIFIER_PORT ?? 8787;
  const nodeEnsName = getNodeEnsName({ config });
  const payoutAddresses = getNodePayoutAddresses({ config });
  const supportedRoles = deriveSupportedRoles(config);

  const validator = createAlphaWorkUnitValidator({
    privateKey: config.VALIDATOR_PRIVATE_KEY ?? config.OPERATOR_PRIVATE_KEY ?? null,
    expectedAttestor: config.OPERATOR_ADDRESS ?? null,
    maxFutureDriftMs: 10 * 60 * 1000,
    logger: typeof logger.child === 'function' ? logger.child({ subsystem: 'validator' }) : logger,
    nodeEnsName
  });

  const serverMetrics = {
    startedAt: Date.now(),
    requests: 0,
    validations: 0,
    failures: 0,
    lastError: null,
    lastValidationAt: null
  };

  const server = http.createServer(async (req, res) => {
    serverMetrics.requests += 1;

    const { method, url } = req;
    if (!method || !url) {
      jsonResponse(res, 400, { error: 'Invalid request' });
      return;
    }

    if (method === 'GET' && url.startsWith('/verifier/info')) {
      const metadata = buildEnsRecordTemplate({ config });
      jsonResponse(res, 200, {
        request_id: randomUUID(),
        node_ens_name: nodeEnsName,
        supported_roles: supportedRoles,
        payout_addresses: payoutAddresses,
        ens_records: metadata,
        metrics: {
          uptime_sec: Math.round((Date.now() - serverMetrics.startedAt) / 1000),
          total_requests: serverMetrics.requests,
          total_validations: serverMetrics.validations,
          total_failures: serverMetrics.failures
        }
      });
      return;
    }

    if (method === 'GET' && url.startsWith('/verifier/health')) {
      jsonResponse(res, 200, {
        status: 'ok',
        uptime_sec: Math.round((Date.now() - serverMetrics.startedAt) / 1000),
        total_requests: serverMetrics.requests,
        total_validations: serverMetrics.validations,
        total_failures: serverMetrics.failures,
        last_error: serverMetrics.lastError,
        last_validation_at: serverMetrics.lastValidationAt
      });
      return;
    }

    if (method === 'POST' && url.startsWith('/verifier/validate')) {
      let payload;
      try {
        payload = await parseJsonBody(req);
      } catch (error) {
        serverMetrics.failures += 1;
        serverMetrics.lastError = error.message ?? 'Invalid JSON payload';
        jsonResponse(res, 400, { error: 'Invalid JSON payload' });
        return;
      }

      try {
        const result = await validator.validate(payload);
        serverMetrics.validations += 1;
        serverMetrics.lastValidationAt = new Date().toISOString();
        jsonResponse(res, 200, result);
      } catch (error) {
        serverMetrics.failures += 1;
        serverMetrics.lastError = error.message ?? 'Validation failed';
        logger.error(error, 'Verifier failed to process α-WU');
        jsonResponse(res, 422, {
          error: 'Validation failed',
          details: error.message ?? 'Unknown error'
        });
      }
      return;
    }

    jsonResponse(res, 404, { error: 'Not found' });
  });

  const listenPromise = new Promise((resolve, reject) => {
    server.once('error', (error) => {
      logger.error(error, 'Verifier server failed to start');
      reject(error);
    });
    server.listen(listenPort, () => {
      const address = server.address();
      logger.info({ port: address?.port, nodeEnsName }, 'Verifier server listening');
      resolve(address);
    });
  });

  async function stop() {
    await new Promise((resolve) => server.close(() => resolve()));
  }

  return {
    server,
    validator,
    metrics: serverMetrics,
    listenPromise,
    stop
  };
}
