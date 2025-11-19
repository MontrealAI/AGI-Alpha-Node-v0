import { context as otelContext, trace as otelTrace } from '@opentelemetry/api';
import pino from 'pino';
import {
  buildTransportConfig,
  classifyTransport,
  createReachabilityState,
  describeDialPreference,
  logTransportPlan,
  rankDialableMultiaddrs,
  selectAnnounceableAddrs,
  summarizeReachabilityState
} from './transportConfig.js';
import {
  recordConnectionClose,
  recordConnectionLatency,
  recordConnectionOpen
} from '../telemetry/networkMetrics.js';
import { getTelemetryTracer } from '../telemetry/monitoring.js';

const logger = pino({ level: 'info', name: 'libp2p-host-config' });

function resolveLogger(baseLogger = logger) {
  return typeof baseLogger?.info === 'function' ? baseLogger : logger;
}

function sanitizeMultiaddrs(addresses = []) {
  return Array.from(
    new Set(
      (addresses ?? [])
        .map((address) => (address ? String(address).trim() : ''))
        .filter((address) => address.length > 0)
    )
  );
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

function extractPeerId(detail = {}) {
  return detail.peerId ?? detail.remotePeer ?? detail.peer ?? null;
}

function extractAddress(detail = {}) {
  return detail.multiaddr ?? detail.address ?? detail.addr ?? detail.remoteAddr ?? detail.multiaddrString ?? null;
}

function nowMs() {
  return Date.now();
}

export function createTransportTracer({ plan, logger: baseLogger, metrics = null, tracer: tracerOverride = null } = {}) {
  const log = resolveLogger(baseLogger);
  const preference = plan?.transports?.preference ?? 'prefer-quic';
  const { tracer } = tracerOverride
    ? { tracer: tracerOverride }
    : getTelemetryTracer({ logger: baseLogger });
  const inflightDials = new Map();

  const startDialSpan = ({ peerId, address, transport, startedAt }) => {
    if (!tracer) return null;

    const parentSpan = otelTrace.getSpan(otelContext.active());
    const attributes = {
      'peer.id': peerId ?? 'unknown',
      'net.transport': transport ?? 'unknown',
      'net.peer.addr': address ?? 'unknown'
    };

    const span = tracer.startSpan(
      'net.dial',
      {
        attributes,
        links: parentSpan ? [{ context: parentSpan.spanContext() }] : undefined
      },
      otelContext.active()
    );

    if (startedAt !== undefined) {
      span.setAttribute('net.dial.latency_ms', 0);
    }

    return span;
  };

  const traceTransport = function traceTransport({
    peerId = null,
    address,
    direction = 'out',
    success = undefined,
    startedAt,
    skipAttempt = false,
    event,
    transportOverride = null,
    span = null
  } = {}) {
    const transport = transportOverride ?? classifyTransport(address);
    const latencyMs = startedAt ? Math.max(0, nowMs() - startedAt) : undefined;

    if (direction === 'out' && !skipAttempt) {
      metrics?.dialAttempts?.inc?.({ transport, direction: 'out' });
    }

    if (direction === 'out') {
      if (success === true) {
        metrics?.dialSuccesses?.inc?.({ transport });
      } else if (success === false) {
        metrics?.dialFailures?.inc?.({ transport });
      }
    }

    if (direction === 'in') {
      metrics?.inboundConnections?.inc?.({ transport });
      recordConnectionOpen(metrics, { direction });
    }

    if (!(direction === 'out' && success === undefined)) {
      recordConnectionLatency(metrics, { transport, direction, latencyMs });
    }

    if (direction === 'out' && success === true) {
      recordConnectionOpen(metrics, { direction });
    }

    const eventName = event ?? (success === undefined ? 'conn_open' : success ? 'conn_success' : 'conn_failure');

    log.info(
      {
        peerId,
        address,
        transport,
        direction,
        preference,
        success,
        latency_ms: latencyMs
      },
      eventName
    );

    if (span) {
      span.setAttribute('net.transport', transport);
      span.setAttribute('net.peer.addr', address ?? 'unknown');
      if (success !== undefined) {
        span.setAttribute('net.dial.success', Boolean(success));
      }
      if (latencyMs !== undefined) {
        span.setAttribute('net.dial.latency_ms', latencyMs);
      }
      span.end();
    }

    return transport;
  };

  traceTransport.bindTo = (libp2p) => {
    const disposers = [];

    const recordStart = (detail) => {
      const peerId = extractPeerId(detail);
      const address = extractAddress(detail);
      const startedAt = nowMs();
      const transport = classifyTransport(address);
      const span = startDialSpan({ peerId, address, transport, startedAt });
      if (peerId || address) {
        inflightDials.set(`${peerId ?? address}`, { startedAt, span, transport });
      }
      traceTransport({
        peerId,
        address,
        direction: 'out',
        success: undefined,
        startedAt,
        event: 'conn_open',
        transportOverride: transport
      });
    };

    const recordResult = (detail, success) => {
      const peerId = extractPeerId(detail);
      const address = extractAddress(detail);
      const key = peerId ?? address;
      const inflight = inflightDials.get(key ?? '') ?? {};
      const startedAt = inflight.startedAt ?? detail?.startedAt;
      const span = inflight.span ?? startDialSpan({
        peerId,
        address,
        transport: inflight.transport ?? classifyTransport(address),
        startedAt
      });
      const transport = inflight.transport ?? classifyTransport(address);
      const seenStart = inflightDials.has(key ?? '');
      if (key) {
        inflightDials.delete(key);
      }
      traceTransport({
        peerId,
        address,
        direction: 'out',
        success,
        startedAt,
        skipAttempt: seenStart,
        event: success ? 'conn_success' : 'conn_failure',
        transportOverride: transport,
        span
      });
    };

    const recordInbound = (detail) => {
      const peerId = extractPeerId(detail);
      const address = extractAddress(detail);
      traceTransport({
        peerId,
        address,
        direction: 'in',
        success: true,
        startedAt: detail?.startedAt,
        event: 'conn_success'
      });
    };

    const recordClose = (detail) => {
      const peerId = extractPeerId(detail);
      const address = extractAddress(detail);
      const reason = detail?.reason ?? detail?.error ?? detail?.code ?? detail?.status;
      const direction =
        detail?.direction ?? detail?.dir ?? detail?.stat?.direction ?? detail?.connection?.stat?.direction ?? 'out';
      recordConnectionClose(metrics, { direction, reason, detail });
      log.info(
        {
          peerId,
          address,
          direction,
          reason
        },
        'conn_close'
      );
    };

    disposers.push(attachListener(libp2p, 'dial:start', ({ detail }) => recordStart(detail)));
    disposers.push(attachListener(libp2p, 'dial:success', ({ detail }) => recordResult(detail, true)));
    disposers.push(attachListener(libp2p, 'dial:failure', ({ detail }) => recordResult(detail, false)));
    disposers.push(attachListener(libp2p, 'connection:open', ({ detail }) => recordInbound(detail)));
    disposers.push(attachListener(libp2p, 'connection:close', ({ detail }) => recordClose(detail)));

    return () => disposers.forEach((dispose) => dispose());
  };

  return traceTransport;
}

export function buildLibp2pHostConfig({
  config = {},
  dialerPolicy = null,
  listenMultiaddrs = [],
  publicMultiaddrs = [],
  relayMultiaddrs = [],
  lanMultiaddrs = [],
  reachabilityHint,
  networkMetrics = null,
  reachabilityState = null
} = {}) {
  const plan = buildTransportConfig(config);
  const reachabilityTracker =
    reachabilityState ??
    createReachabilityState({ initial: reachabilityHint, override: config.AUTONAT_REACHABILITY });
  const reachability = reachabilityTracker.getState();

  const listen = sanitizeMultiaddrs(listenMultiaddrs);
  const announceCandidates = selectAnnounceableAddrs({
    reachability,
    publicMultiaddrs,
    relayMultiaddrs,
    lanMultiaddrs
  });
  const announce = rankDialableMultiaddrs(announceCandidates, plan);

  const transports = [
    ...(plan.transports.tcp ? ['tcp'] : []),
    ...(plan.transports.quic ? ['quic'] : [])
  ];

  const transportTracer = createTransportTracer({ plan, logger, metrics: networkMetrics });

  return {
    plan,
    reachability,
    addresses: {
      listen,
      announce
    },
    transports: {
      register: transports,
      preference: plan.transports.preference
    },
    dialer: {
      rank: (addresses) => rankDialableMultiaddrs(addresses, plan),
      preference: describeDialPreference(plan),
      trace: transportTracer,
      policy: dialerPolicy
    },
    nat: {
      holePunching: plan.holePunching,
      autonat: plan.autonat
    },
    relay: {
      client: plan.relay.client,
      server: plan.relay.server,
      maxReservations: plan.relay.maxReservations,
      maxCircuitsPerPeer: plan.relay.maxCircuitsPerPeer,
      maxBandwidthBps: plan.relay.maxBandwidthBps
    },
    tracer: transportTracer,
    reachabilityState: reachabilityTracker
  };
}

export function logLibp2pHostConfig(hostConfig, baseLogger = logger) {
  if (!hostConfig) return;
  const log = resolveLogger(baseLogger);
  logTransportPlan(hostConfig.plan);
  log.info(
    {
      transports: hostConfig.transports,
      reachability: hostConfig.reachability,
      addresses: hostConfig.addresses,
      nat: hostConfig.nat,
      relay: hostConfig.relay,
      dialPreference: hostConfig.dialer?.preference,
      dialerPolicy: hostConfig.dialer?.policy
    },
    'libp2p host configuration synthesized'
  );
}
