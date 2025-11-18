import { Counter, Histogram } from 'prom-client';

function buildRegisters(registry) {
  return registry ? [registry] : undefined;
}

export function createNetworkMetrics({ registry } = {}) {
  const registers = buildRegisters(registry);

  const dialAttempts = new Counter({
    name: 'agi_alpha_node_net_dial_attempt_total',
    help: 'Total outbound dial attempts grouped by transport and direction',
    labelNames: ['transport', 'direction'],
    registers
  });

  const dialSuccesses = new Counter({
    name: 'agi_alpha_node_net_dial_success_total',
    help: 'Total successful outbound dials grouped by transport',
    labelNames: ['transport'],
    registers
  });

  const dialFailures = new Counter({
    name: 'agi_alpha_node_net_dial_failure_total',
    help: 'Total failed outbound dials grouped by transport',
    labelNames: ['transport'],
    registers
  });

  const inboundConnections = new Counter({
    name: 'agi_alpha_node_net_inbound_connection_total',
    help: 'Inbound connections accepted grouped by transport',
    labelNames: ['transport'],
    registers
  });

  const connectionLatency = new Histogram({
    name: 'agi_alpha_node_net_connection_latency_ms',
    help: 'Observed connection latency in milliseconds grouped by transport and direction',
    labelNames: ['transport', 'direction'],
    buckets: [5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000],
    registers
  });

  return {
    dialAttempts,
    dialSuccesses,
    dialFailures,
    inboundConnections,
    connectionLatency
  };
}

export function recordConnectionLatency(metrics, { transport, direction = 'out', latencyMs }) {
  if (!metrics?.connectionLatency || latencyMs === undefined || latencyMs === null) {
    return;
  }
  const boundedLatency = latencyMs < 0 ? 0 : latencyMs;
  metrics.connectionLatency.observe({ transport, direction }, boundedLatency);
}
