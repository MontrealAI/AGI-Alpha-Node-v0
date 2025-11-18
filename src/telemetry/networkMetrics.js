import { Counter, Gauge, Histogram } from 'prom-client';

const REACHABILITY_CODES = {
  unknown: 0,
  private: 1,
  public: 2
};

const DEFAULT_DIRECTION = 'out';
const DEFAULT_REASON = 'normal';

function buildRegisters(registry) {
  return registry ? [registry] : undefined;
}

export function createNetworkMetrics({ registry } = {}) {
  const registers = buildRegisters(registry);

  const reachabilityState = new Gauge({
    name: 'net_reachability_state',
    help: 'Current reachability posture (0=unknown, 1=private, 2=public)',
    registers
  });

  const autonatProbesTotal = new Counter({
    name: 'net_autonat_probes_total',
    help: 'Total AutoNAT probes executed',
    registers
  });

  const autonatFailuresTotal = new Counter({
    name: 'net_autonat_failures_total',
    help: 'Total AutoNAT probes that failed',
    registers
  });

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

  const connectionsOpen = new Counter({
    name: 'net_connections_open_total',
    help: 'Connections opened grouped by direction',
    labelNames: ['direction'],
    registers
  });

  const connectionsClose = new Counter({
    name: 'net_connections_close_total',
    help: 'Connections closed grouped by direction and reason',
    labelNames: ['direction', 'reason'],
    registers
  });

  const connectionsLive = new Gauge({
    name: 'net_connections_live',
    help: 'Current live connections grouped by direction',
    labelNames: ['direction'],
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
    reachabilityState,
    autonatProbesTotal,
    autonatFailuresTotal,
    dialAttempts,
    dialSuccesses,
    dialFailures,
    inboundConnections,
    connectionsOpen,
    connectionsClose,
    connectionsLive,
    connectionLatency,
    liveConnections: { in: 0, out: 0 }
  };
}

export function recordConnectionLatency(metrics, { transport, direction = 'out', latencyMs }) {
  if (!metrics?.connectionLatency || latencyMs === undefined || latencyMs === null) {
    return;
  }
  const boundedLatency = latencyMs < 0 ? 0 : latencyMs;
  metrics.connectionLatency.observe({ transport, direction }, boundedLatency);
}

function normalizeDirection(direction) {
  if (direction?.stat?.direction) {
    return normalizeDirection(direction.stat.direction);
  }

  const normalized = String(direction ?? DEFAULT_DIRECTION).toLowerCase();
  if (normalized === 'in' || normalized === 'inbound') return 'in';
  if (normalized === 'out' || normalized === 'outbound') return 'out';
  return DEFAULT_DIRECTION;
}

function normalizeCloseReason(reason) {
  if (!reason) return DEFAULT_REASON;
  const normalized = String(reason).toLowerCase();
  if (normalized.includes('timeout')) return 'timeout';
  if (normalized.includes('ban')) return 'banned';
  if (normalized.includes('limit')) return 'nrm_limit';
  if (normalized.includes('reset')) return 'reset';
  if (normalized.includes('protocol')) return 'protocol';
  if (normalized.includes('error') || normalized.includes('fail')) return 'error';
  return normalized.length ? normalized : DEFAULT_REASON;
}

export function recordConnectionOpen(metrics, { direction = DEFAULT_DIRECTION } = {}) {
  if (!metrics?.connectionsOpen || !metrics?.connectionsLive) return;
  const normalizedDirection = normalizeDirection(direction);
  metrics.liveConnections[normalizedDirection] = Math.max(
    0,
    (metrics.liveConnections[normalizedDirection] ?? 0) + 1
  );
  metrics.connectionsOpen.inc({ direction: normalizedDirection });
  metrics.connectionsLive.set(
    { direction: normalizedDirection },
    metrics.liveConnections[normalizedDirection]
  );
}

export function recordConnectionClose(
  metrics,
  { direction = DEFAULT_DIRECTION, reason = DEFAULT_REASON } = {}
) {
  if (!metrics?.connectionsClose || !metrics?.connectionsLive) return;
  const normalizedDirection = normalizeDirection(direction);
  const normalizedReason = normalizeCloseReason(reason);
  metrics.connectionsClose.inc({ direction: normalizedDirection, reason: normalizedReason });
  metrics.liveConnections[normalizedDirection] = Math.max(
    0,
    (metrics.liveConnections[normalizedDirection] ?? 0) - 1
  );
  metrics.connectionsLive.set(
    { direction: normalizedDirection },
    metrics.liveConnections[normalizedDirection]
  );
}

export function updateReachabilityMetric(metrics, state = 'unknown') {
  if (!metrics?.reachabilityState) return;
  const normalizedState = String(state ?? 'unknown').toLowerCase();
  const code = REACHABILITY_CODES[normalizedState] ?? REACHABILITY_CODES.unknown;
  metrics.reachabilityState.set(code);
}

export function recordAutonatProbe(metrics, { success = true } = {}) {
  metrics?.autonatProbesTotal?.inc?.();
  if (!success) {
    metrics?.autonatFailuresTotal?.inc?.();
  }
}
