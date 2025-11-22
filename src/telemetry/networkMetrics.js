import { Counter, Gauge, Histogram } from 'prom-client';
import { summarizeReachabilityState } from '../network/transportConfig.js';

const REACHABILITY_CODES = {
  unknown: 0,
  private: 1,
  public: 2
};

const DEFAULT_DIRECTION = 'out';
const DEFAULT_REASON = 'normal';
const AUTONAT_EVENTS = [
  'autonat:result',
  'autonat:reachability',
  'autonat:status',
  'autonat:probe',
  'reachability:change'
];

function buildRegisters(registry) {
  return registry ? [registry] : undefined;
}

export function createNetworkMetrics({
  registry,
  reachabilityState = null,
  autonat = null,
  logger = null
} = {}) {
  const registers = buildRegisters(registry);
  const liveConnections = { in: 0, out: 0 };
  const liveYamuxStreams = { in: 0, out: 0 };

  const reachabilityStateGauge = new Gauge({
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

  const netDialSuccessTotal = new Counter({
    name: 'net_dial_success_total',
    help: 'Total successful outbound dials grouped by transport',
    labelNames: ['transport'],
    registers
  });

  const netDialFailTotal = new Counter({
    name: 'net_dial_fail_total',
    help: 'Total failed outbound dials grouped by transport and reason',
    labelNames: ['transport', 'reason'],
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

  const nrmDenialsTotal = new Counter({
    name: 'nrm_denials_total',
    help: 'Resource manager denials grouped by limit type and protocol',
    labelNames: ['limit_type', 'protocol'],
    registers
  });

  const nrmUsage = new Gauge({
    name: 'nrm_usage',
    help: 'Resource manager usage by resource class',
    labelNames: ['resource'],
    registers
  });

  const nrmLimits = new Gauge({
    name: 'nrm_limits',
    help: 'Configured resource manager limits by resource class',
    labelNames: ['resource'],
    registers
  });

  const connmanagerTrimsTotal = new Counter({
    name: 'connmanager_trims_total',
    help: 'Connection manager peer trims grouped by reason',
    labelNames: ['reason'],
    registers
  });

  const banlistEntries = new Gauge({
    name: 'banlist_entries',
    help: 'Current banlist entries grouped by identifier type',
    labelNames: ['type'],
    registers
  });

  const banlistChangesTotal = new Counter({
    name: 'banlist_changes_total',
    help: 'Banlist changes grouped by identifier type and action',
    labelNames: ['type', 'action'],
    registers
  });

  connectionsLive.set({ direction: 'in' }, liveConnections.in);
  connectionsLive.set({ direction: 'out' }, liveConnections.out);
  ['ip', 'peer', 'asn'].forEach((type) => banlistEntries.set({ type }, 0));

  const connectionLatency = new Histogram({
    name: 'net_connection_latency_ms',
    help: 'Observed connection latency in milliseconds grouped by transport and direction',
    labelNames: ['transport', 'direction'],
    buckets: [5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000],
    registers
  });

  const quicHandshakeLatency = new Histogram({
    name: 'net_quic_handshake_latency_ms',
    help: 'QUIC handshake completion latency in milliseconds grouped by direction',
    labelNames: ['direction'],
    buckets: [5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000],
    registers
  });

  const protocolLatency = new Histogram({
    name: 'net_protocol_latency_ms',
    help: 'Observed protocol latency in milliseconds grouped by protocol and direction',
    labelNames: ['protocol', 'direction'],
    buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 20_000],
    registers
  });

  const protocolBytesTotal = new Counter({
    name: 'net_bytes_total',
    help: 'Total bytes exchanged grouped by direction and protocol',
    labelNames: ['direction', 'protocol'],
    registers
  });

  const protocolMsgsTotal = new Counter({
    name: 'net_msgs_total',
    help: 'Total messages exchanged grouped by direction and protocol',
    labelNames: ['direction', 'protocol'],
    registers
  });

  const yamuxStreamsActive = new Gauge({
    name: 'yamux_streams_active',
    help: 'Live Yamux streams grouped by direction',
    labelNames: ['direction'],
    registers
  });

  const yamuxStreamResetsTotal = new Counter({
    name: 'yamux_stream_resets_total',
    help: 'Yamux stream resets grouped by protocol',
    labelNames: ['protocol'],
    registers
  });

  ['in', 'out'].forEach((direction) =>
    yamuxStreamsActive.set({ direction }, liveYamuxStreams[direction] ?? 0)
  );

  updateReachabilityMetric({ reachabilityState: reachabilityStateGauge }, 'unknown');

  const bindings = [];
  if (reachabilityState) {
    const unsubscribe =
      typeof reachabilityState.subscribe === 'function'
        ? bindReachabilityGauge({
            reachabilityState,
            metrics: { reachabilityState: reachabilityStateGauge }
          })
        : () => {};
    bindings.push(unsubscribe);
    updateReachabilityMetric(
      { reachabilityState: reachabilityStateGauge },
      reachabilityState?.getState?.() ?? reachabilityState
    );
  }

  if (autonat && reachabilityState) {
    const unsubscribe = bindAutonatReachability({
      autonat,
      reachabilityState,
      metrics: {
        reachabilityState: reachabilityStateGauge,
        autonatProbesTotal,
        autonatFailuresTotal
      },
      logger
    });
    bindings.push(unsubscribe);
  }

  return {
    reachabilityState: reachabilityStateGauge,
    autonatProbesTotal,
    autonatFailuresTotal,
    dialAttempts,
    dialSuccesses,
    dialFailures,
    netDialSuccessTotal,
    netDialFailTotal,
    inboundConnections,
    connectionsOpen,
    connectionsClose,
    connectionsLive,
    connectionLatency,
    protocolLatency,
    protocolBytesTotal,
    protocolMsgsTotal,
    quicHandshakeLatency,
    yamuxStreamsActive,
    yamuxStreamResetsTotal,
    nrmDenialsTotal,
    nrmUsage,
    nrmLimits,
    connmanagerTrimsTotal,
    banlistEntries,
    banlistChangesTotal,
    liveConnections,
    liveYamuxStreams,
    stop: () => bindings.forEach((unbind) => unbind?.())
  };
}

export function recordConnectionLatency(metrics, { transport, direction = 'out', latencyMs }) {
  if (!metrics?.connectionLatency || latencyMs === undefined || latencyMs === null) {
    return;
  }
  const boundedLatency = latencyMs < 0 ? 0 : latencyMs;
  metrics.connectionLatency.observe({ transport, direction }, boundedLatency);
}

export function recordQuicHandshakeLatency(metrics, { direction = DEFAULT_DIRECTION, latencyMs }) {
  if (!metrics?.quicHandshakeLatency || latencyMs === undefined || latencyMs === null) {
    return;
  }
  const normalizedDirection = normalizeDirection(direction);
  const boundedLatency = latencyMs < 0 ? 0 : latencyMs;
  metrics.quicHandshakeLatency.observe({ direction: normalizedDirection }, boundedLatency);
}

export function recordProtocolLatency(metrics, { protocol, direction = DEFAULT_DIRECTION, latencyMs }) {
  if (!metrics?.protocolLatency || latencyMs === undefined || latencyMs === null) {
    return;
  }
  const normalizedProtocol = normalizeProtocol(protocol);
  const normalizedDirection = normalizeDirection(direction);
  const boundedLatency = latencyMs < 0 ? 0 : latencyMs;
  metrics.protocolLatency.observe({ protocol: normalizedProtocol, direction: normalizedDirection }, boundedLatency);
}

export function startProtocolTimer(metrics, { protocol, direction = DEFAULT_DIRECTION } = {}) {
  const startedAt = Date.now();
  const stop = () => {
    const latencyMs = Math.max(0, Date.now() - startedAt);
    recordProtocolLatency(metrics, { protocol, direction, latencyMs });
    return latencyMs;
  };
  return { stop };
}

export function recordProtocolTraffic(
  metrics,
  { protocol, direction = DEFAULT_DIRECTION, bytes = 0, messages = 1 } = {}
) {
  const normalizedProtocol = normalizeProtocol(protocol);
  const normalizedDirection = normalizeDirection(direction);
  if (metrics?.protocolBytesTotal && Number.isFinite(bytes)) {
    const boundedBytes = bytes < 0 ? 0 : bytes;
    metrics.protocolBytesTotal.inc({ direction: normalizedDirection, protocol: normalizedProtocol }, boundedBytes);
  }
  if (metrics?.protocolMsgsTotal && Number.isFinite(messages)) {
    const boundedMessages = messages < 0 ? 0 : messages;
    metrics.protocolMsgsTotal.inc({ direction: normalizedDirection, protocol: normalizedProtocol }, boundedMessages);
  }
}

export function recordYamuxStreamOpen(metrics, { direction = DEFAULT_DIRECTION } = {}) {
  if (!metrics?.yamuxStreamsActive || !metrics?.liveYamuxStreams) return;
  const normalizedDirection = normalizeDirection(direction);
  metrics.liveYamuxStreams[normalizedDirection] = Math.max(
    0,
    (metrics.liveYamuxStreams[normalizedDirection] ?? 0) + 1
  );
  metrics.yamuxStreamsActive.set({ direction: normalizedDirection }, metrics.liveYamuxStreams[normalizedDirection]);
}

export function recordYamuxStreamClose(metrics, { direction = DEFAULT_DIRECTION } = {}) {
  if (!metrics?.yamuxStreamsActive || !metrics?.liveYamuxStreams) return;
  const normalizedDirection = normalizeDirection(direction);
  metrics.liveYamuxStreams[normalizedDirection] = Math.max(
    0,
    (metrics.liveYamuxStreams[normalizedDirection] ?? 0) - 1
  );
  metrics.yamuxStreamsActive.set({ direction: normalizedDirection }, metrics.liveYamuxStreams[normalizedDirection]);
}

export function recordYamuxStreamReset(metrics, { protocol } = {}) {
  const normalizedProtocol = normalizeProtocol(protocol);
  metrics?.yamuxStreamResetsTotal?.inc?.({ protocol: normalizedProtocol });
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

function normalizeProtocol(protocol) {
  if (!protocol && protocol !== 0) return 'unknown';
  const normalized = String(protocol).trim().toLowerCase();
  return normalized.length ? normalized : 'unknown';
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
  { direction = DEFAULT_DIRECTION, reason = DEFAULT_REASON, detail = null } = {}
) {
  if (!metrics?.connectionsClose || !metrics?.connectionsLive) return;
  const normalizedDirection = normalizeDirection(resolveDirection(detail, direction));
  const normalizedReason = normalizeCloseReason(resolveCloseReason(detail, reason));
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

export function publishResourceManagerLimits(metrics, limits = {}) {
  if (!metrics?.nrmLimits) return;
  const entries = [
    ['connections', limits.global?.maxConnections],
    ['streams', limits.global?.maxStreams],
    ['memory_bytes', limits.global?.maxMemoryBytes],
    ['fds', limits.global?.maxFds],
    ['bandwidth_bps', limits.global?.maxBandwidthBps],
    ['per_ip', limits.ipLimiter?.maxConnsPerIp],
    ['per_asn', limits.ipLimiter?.maxConnsPerAsn]
  ];
  entries
    .filter(([, value]) => Number.isFinite(value))
    .forEach(([resource, value]) => metrics.nrmLimits.set({ resource }, value));
}

export function publishResourceManagerUsage(metrics, usage = {}) {
  if (!metrics?.nrmUsage) return;
  const safeSet = (resource, value) => metrics.nrmUsage.set({ resource }, Math.max(0, value ?? 0));
  safeSet('connections_total', usage.connections);
  safeSet('connections_inbound', usage.inbound);
  safeSet('connections_outbound', usage.outbound);
  safeSet('streams_total', usage.streams);
  safeSet('ip_buckets', usage.ipConns ?? 0);
  safeSet('asn_buckets', usage.asnConns ?? 0);
  if (Number.isFinite(usage.memoryBytes)) {
    safeSet('memory_bytes', usage.memoryBytes);
  }
}

export function recordAutonatProbe(metrics, { success = true } = {}) {
  metrics?.autonatProbesTotal?.inc?.();
  if (!success) {
    metrics?.autonatFailuresTotal?.inc?.();
  }
}

function attachListener(target, event, handler) {
  if (!target || !event || typeof handler !== 'function') return () => {};

  if (typeof target.addEventListener === 'function') {
    target.addEventListener(event, handler);
    return () => target.removeEventListener?.(event, handler);
  }

  if (typeof target.on === 'function') {
    target.on(event, handler);
    return () => (target.off ?? target.removeListener)?.(event, handler);
  }

  return () => {};
}

function deriveReachability(detail) {
  if (!detail) return 'unknown';
  const payload = detail?.detail ?? detail;
  const stateCandidate =
    payload?.reachability ?? payload?.status ?? payload?.nat ?? payload?.state ?? payload;
  return summarizeReachabilityState(stateCandidate);
}

function resolveDirection(detail, fallback = DEFAULT_DIRECTION) {
  if (!detail) return fallback;
  const candidate =
    detail?.direction ??
    detail?.dir ??
    detail?.stat?.direction ??
    detail?.connection?.stat?.direction ??
    detail?.connection?.direction;
  return candidate ?? fallback;
}

function resolveCloseReason(detail, fallback = DEFAULT_REASON) {
  if (!detail) return fallback;
  const reason = detail?.reason ?? detail?.error ?? detail?.code ?? detail?.status;
  if (!reason && detail?.error?.message) {
    return detail.error.message;
  }
  return reason ?? fallback;
}

export function bindReachabilityGauge({ reachabilityState, metrics } = {}) {
  if (!reachabilityState?.subscribe || !metrics) return () => {};
  const unsubscribe = reachabilityState.subscribe((snapshot) => {
    updateReachabilityMetric(metrics, snapshot?.state ?? 'unknown');
  });
  return () => unsubscribe?.();
}

export function bindAutonatReachability({ autonat, reachabilityState, metrics, logger } = {}) {
  if (!autonat || !reachabilityState) return () => {};

  const disposers = AUTONAT_EVENTS.map((event) =>
    attachListener(autonat, event, (detail) => {
      const reachability = deriveReachability(detail);
      const hasError = Boolean(detail?.error ?? detail?.err ?? detail?.detail?.error);
      const success = !hasError && reachability !== 'unknown';

      recordAutonatProbe(metrics, { success });
      reachabilityState.updateFromAutonat?.(reachability);
      updateReachabilityMetric(metrics, reachabilityState.getState?.() ?? reachability);

      logger?.info?.(
        {
          event,
          reachability: reachabilityState.getState?.() ?? reachability,
          success,
          source: 'autonat'
        },
        'AutoNAT reachability update received'
      );
    })
  );

  return () => disposers.forEach((dispose) => dispose());
}
