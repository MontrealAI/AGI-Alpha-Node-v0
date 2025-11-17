import pino from 'pino';

const logger = pino({ level: 'info', name: 'transport-config' });

function coerceBoolean(value, fallback = true) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  }
  return Boolean(value);
}

function coercePositiveInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const coerced = Math.trunc(numeric);
  return coerced > 0 ? coerced : fallback;
}

export function buildTransportConfig(config) {
  const enableQuic = coerceBoolean(config.TRANSPORT_ENABLE_QUIC, true);
  const enableTcp = coerceBoolean(config.TRANSPORT_ENABLE_TCP, true);

  if (!enableQuic && !enableTcp) {
    throw new Error('At least one transport (QUIC or TCP) must be enabled.');
  }

  const enableHolePunching = coerceBoolean(config.ENABLE_HOLE_PUNCHING, true);
  const autonatEnabled = coerceBoolean(config.AUTONAT_ENABLED, true);
  const autonatThrottleSeconds = coercePositiveInteger(
    config.AUTONAT_THROTTLE_SECONDS,
    60
  );
  const relayClient = coerceBoolean(config.RELAY_ENABLE_CLIENT, true);
  const relayServer = coerceBoolean(config.RELAY_ENABLE_SERVER, false);
  const relayMaxReservations = coercePositiveInteger(config.RELAY_MAX_RESERVATIONS, 32);
  const relayMaxCircuitsPerPeer = coercePositiveInteger(
    config.RELAY_MAX_CIRCUITS_PER_PEER,
    8
  );
  const relayMaxBandwidthBpsRaw = config.RELAY_MAX_BANDWIDTH_BPS;
  const relayMaxBandwidthBps = relayMaxBandwidthBpsRaw
    ? coercePositiveInteger(relayMaxBandwidthBpsRaw, undefined)
    : undefined;

  return {
    transports: {
      quic: enableQuic,
      tcp: enableTcp,
      preference: enableQuic && enableTcp ? 'prefer-quic' : enableQuic ? 'quic-only' : 'tcp-only'
    },
    holePunching: enableHolePunching,
    autonat: {
      enabled: autonatEnabled,
      throttleSeconds: autonatThrottleSeconds
    },
    relay: {
      client: relayClient,
      server: relayServer,
      maxReservations: relayMaxReservations,
      maxCircuitsPerPeer: relayMaxCircuitsPerPeer,
      maxBandwidthBps: relayMaxBandwidthBps
    }
  };
}

export function logTransportPlan(plan) {
  if (!plan) return;
  logger.info(
    {
      transports: plan.transports,
      holePunching: plan.holePunching,
      autonat: plan.autonat,
      relay: plan.relay,
      dialPreference: describeDialPreference(plan)
    },
    'Transport and NAT traversal plan loaded'
  );
}

export function describeDialPreference(plan) {
  if (!plan?.transports) return 'unknown';
  if (plan.transports.preference === 'prefer-quic') {
    return 'QUIC-first with TCP fallback';
  }
  if (plan.transports.preference === 'quic-only') {
    return 'QUIC-only';
  }
  if (plan.transports.preference === 'tcp-only') {
    return 'TCP-only';
  }
  return 'unknown';
}

function sanitizeMultiaddrs(addresses) {
  if (!addresses) return [];
  return Array.from(
    new Set(
      addresses
        .map((address) => (address ? String(address).trim() : ''))
        .filter((address) => address.length > 0)
    )
  );
}

function scoreTransportPreference(address, preference) {
  const lower = address.toLowerCase();
  const isQuic = lower.includes('/quic') || lower.includes('/udp/');
  const isTcp = lower.includes('/tcp/');

  if (preference === 'quic-only') return isQuic ? 0 : 1;
  if (preference === 'tcp-only') return isTcp ? 0 : 1;

  // prefer-quic
  if (isQuic && !isTcp) return 0;
  if (isTcp && !isQuic) return 1;
  if (isQuic && isTcp) return 0.5; // dual stack: keep deterministic ordering
  return 2; // unclassified transports sink to the bottom
}

export function rankDialableMultiaddrs(addresses, plan) {
  const sanitized = sanitizeMultiaddrs(addresses);
  if (!sanitized.length) return [];

  const preference = plan?.transports?.preference ?? 'prefer-quic';
  return sanitized
    .map((address) => ({ address, score: scoreTransportPreference(address, preference) }))
    .sort((a, b) => a.score - b.score || a.address.localeCompare(b.address))
    .map((entry) => entry.address);
}

export function selectAnnounceableAddrs({
  reachability = 'unknown',
  publicMultiaddrs = [],
  relayMultiaddrs = [],
  lanMultiaddrs = []
} = {}) {
  const sanitizedPublic = sanitizeMultiaddrs(publicMultiaddrs);
  const sanitizedRelay = sanitizeMultiaddrs(relayMultiaddrs);
  const sanitizedLan = sanitizeMultiaddrs(lanMultiaddrs);

  if (reachability === 'public') {
    return sanitizeMultiaddrs([...sanitizedPublic, ...sanitizedRelay]);
  }

  if (reachability === 'private') {
    return sanitizeMultiaddrs([...sanitizedRelay, ...sanitizedLan]);
  }

  return sanitizeMultiaddrs([...sanitizedLan, ...sanitizedRelay, ...sanitizedPublic]);
}

export function summarizeReachabilityState(state) {
  if (!state) return 'unknown';
  const normalized = String(state).toLowerCase();
  if (normalized === 'public') return 'public';
  if (normalized === 'private') return 'private';
  return 'unknown';
}
