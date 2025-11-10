import http from 'node:http';
import { collectDefaultMetrics, Gauge, Registry } from 'prom-client';

export function startMonitoringServer({ port = 9464, logger }) {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: 'agi_alpha_node_' });

  const stakeGauge = new Gauge({
    name: 'agi_alpha_node_stake_balance',
    help: 'Current $AGIALPHA stake recorded for this operator',
    registers: [registry]
  });

  const heartbeatGauge = new Gauge({
    name: 'agi_alpha_node_last_heartbeat',
    help: 'Last heartbeat timestamp observed for the operator',
    registers: [registry]
  });

  const server = http.createServer(async (req, res) => {
    if (req.url === '/metrics') {
      const metrics = await registry.metrics();
      res.writeHead(200, { 'Content-Type': registry.contentType });
      res.end(metrics);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(port, () => {
    logger?.info?.({ port }, 'Telemetry server listening');
  });

  return {
    registry,
    server,
    stakeGauge,
    heartbeatGauge
  };
}
