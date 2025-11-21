#!/usr/bin/env tsx
import http from 'node:http';
import { register } from 'prom-client';
import { startSyntheticDCUtRGenerator } from '../src/observability/dcutrHarness.js';
import { registerDCUtRMetrics } from '../observability/prometheus/metrics_dcutr.js';

const port = Number(process.env.METRICS_PORT ?? '9464');
const durationMs = Number(process.env.HARNESS_DURATION_MS ?? '60000');

registerDCUtRMetrics(register);
const harness = startSyntheticDCUtRGenerator({ registry: register, totalEvents: Math.ceil(durationMs / 250) });

const server = http.createServer(async (req, res) => {
  if (req.url === '/metrics') {
    const metrics = await register.metrics();
    res.writeHead(200, { 'Content-Type': register.contentType });
    res.end(metrics);
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`DCUtR harness metrics listening on :${port}`);
});

setTimeout(() => {
  harness.stop();
  server.close();
}, durationMs);
