import http from 'node:http';

import { config as loadEnv } from 'dotenv';
import { loadConfig } from './config/env.js';

function coercePort(value) {
  const numeric = typeof value === 'number' ? value : Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isInteger(numeric)) {
    return null;
  }
  if (numeric < 1 || numeric > 65535) {
    return null;
  }
  return numeric;
}

loadEnv();

const metricsPortEnv = Object.prototype.hasOwnProperty.call(process.env, 'METRICS_PORT')
  ? process.env.METRICS_PORT
  : undefined;

const config = loadConfig();

const port =
  coercePort(metricsPortEnv) ??
  coercePort(process.env.PORT) ??
  coercePort(config.API_PORT) ??
  coercePort(config.METRICS_PORT) ??
  9464;

const timeoutMs = Number.isInteger(config.HEALTHCHECK_TIMEOUT) && config.HEALTHCHECK_TIMEOUT > 0
  ? config.HEALTHCHECK_TIMEOUT
  : 5000;

const request = http.request(
  {
    host: '127.0.0.1',
    port,
    path: '/metrics',
    method: 'GET',
    timeout: timeoutMs
  },
  (res) => {
    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
      res.resume();
      process.exit(0);
      return;
    }
    res.resume();
    process.exit(1);
  }
);

request.on('timeout', () => {
  request.destroy();
  process.exit(1);
});

request.on('error', () => {
  process.exit(1);
});

request.end();
