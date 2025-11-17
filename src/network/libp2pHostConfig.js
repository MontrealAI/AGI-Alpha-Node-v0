import pino from 'pino';
import {
  buildTransportConfig,
  classifyTransport,
  describeDialPreference,
  logTransportPlan,
  rankDialableMultiaddrs,
  selectAnnounceableAddrs,
  summarizeReachabilityState
} from './transportConfig.js';

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

export function createTransportTracer({ plan, logger: baseLogger } = {}) {
  const log = resolveLogger(baseLogger);
  const preference = plan?.transports?.preference ?? 'prefer-quic';

  return function traceTransport({ peerId = null, address, direction = 'dial', success = true } = {}) {
    const transport = classifyTransport(address);

    log.info(
      {
        peerId,
        address,
        transport,
        direction,
        preference,
        success
      },
      'libp2p transport selection observed'
    );

    return transport;
  };
}

export function buildLibp2pHostConfig({
  config = {},
  listenMultiaddrs = [],
  publicMultiaddrs = [],
  relayMultiaddrs = [],
  lanMultiaddrs = [],
  reachabilityHint
} = {}) {
  const plan = buildTransportConfig(config);
  const reachability = summarizeReachabilityState(reachabilityHint ?? config.AUTONAT_REACHABILITY);

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
      trace: createTransportTracer({ plan, logger })
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
    }
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
      dialPreference: hostConfig.dialer?.preference
    },
    'libp2p host configuration synthesized'
  );
}
