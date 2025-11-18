import pino from 'pino';
import { buildPeerScoreConfig, buildGossipsubScoreParams } from '../services/peerScoring.js';

const NETWORK_PRESETS = Object.freeze({
  small: {
    mesh: { D: 6, Dlo: 4, Dhi: 8, Dout: 16, Dlazy: 8 },
    gossip: { gossipFactor: 0.2, gossipRetransmission: 3 }
  },
  medium: {
    mesh: { D: 8, Dlo: 6, Dhi: 12, Dout: 32, Dlazy: 12 },
    gossip: { gossipFactor: 0.25, gossipRetransmission: 3 }
  },
  large: {
    mesh: { D: 12, Dlo: 10, Dhi: 18, Dout: 48, Dlazy: 16 },
    gossip: { gossipFactor: 0.32, gossipRetransmission: 4 }
  }
});

function resolveNetworkPreset(presetName = 'medium') {
  const normalized = typeof presetName === 'string' ? presetName.toLowerCase() : 'medium';
  return NETWORK_PRESETS[normalized] ?? NETWORK_PRESETS.medium;
}

function toFinite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function resolveLogger(baseLogger = pino({ level: 'info', name: 'pubsub-config' })) {
  return typeof baseLogger?.info === 'function' ? baseLogger : pino({ level: 'info', name: 'pubsub-config' });
}

function resolveMeshConfig(config = {}, preset = resolveNetworkPreset(config.NETWORK_SIZE_PRESET)) {
  return {
    D: toFinite(config.PUBSUB_D, preset.mesh.D),
    Dlo: toFinite(config.PUBSUB_D_LOW, preset.mesh.Dlo),
    Dhi: toFinite(config.PUBSUB_D_HIGH, preset.mesh.Dhi),
    Dout: toFinite(config.PUBSUB_D_OUT, preset.mesh.Dout),
    Dlazy: toFinite(config.PUBSUB_D_LAZY, preset.mesh.Dlazy)
  };
}

function resolveGossipConfig(config = {}, preset = resolveNetworkPreset(config.NETWORK_SIZE_PRESET)) {
  const fanoutTTLSeconds = toFinite(config.PUBSUB_FANOUT_TTL_SECONDS, 60);

  return {
    fanoutTTLSeconds,
    fanoutTTL: fanoutTTLSeconds * 1000,
    gossipFactor: toFinite(config.PUBSUB_GOSSIP_FACTOR, preset.gossip.gossipFactor),
    gossipRetransmission: toFinite(config.PUBSUB_GOSSIP_RETRANSMISSION, preset.gossip.gossipRetransmission),
    opportunisticGraftPeers: toFinite(
      config.PUBSUB_OPPORTUNISTIC_GRAFT_PEERS,
      toFinite(config.PUBSUB_D, preset.mesh.D)
    ),
    opportunisticGraftThreshold: toFinite(config.PUBSUB_OPPORTUNISTIC_GRAFT_THRESHOLD, 5)
  };
}

export function buildGossipsubRoutingConfig({ config = {}, peerScoreConfig = null, peerScoreInspector = null, logger } = {}) {
  const log = resolveLogger(logger);
  const preset = resolveNetworkPreset(config.NETWORK_SIZE_PRESET);
  const mesh = resolveMeshConfig(config, preset);
  const gossip = resolveGossipConfig(config, preset);
  const scoringConfig =
    peerScoreConfig ??
    buildPeerScoreConfig({
      retainScoreMs: config.PUBSUB_RETAIN_SCORE_MS,
      opportunisticGraftTicks: config.PUBSUB_OPPORTUNISTIC_GRAFT_TICKS,
      directConnectTicks: config.PUBSUB_DIRECT_CONNECT_TICKS,
      thresholds: {
        gossip: config.PUBSUB_GOSSIP_THRESHOLD,
        publish: config.PUBSUB_PUBLISH_THRESHOLD,
        graylist: config.PUBSUB_GRAYLIST_THRESHOLD,
        disconnect: config.PUBSUB_DISCONNECT_THRESHOLD
      },
      topicParams: config.PUBSUB_TOPIC_PARAMS
    });
  const scoringParams = buildGossipsubScoreParams(scoringConfig);
  const inspector = peerScoreInspector?.handler ?? null;

  const options = {
    D: mesh.D,
    Dlo: mesh.Dlo,
    Dhi: mesh.Dhi,
    Dout: mesh.Dout,
    Dlazy: mesh.Dlazy,
    fanoutTTL: gossip.fanoutTTL,
    gossipFactor: gossip.gossipFactor,
    gossipRetransmission: gossip.gossipRetransmission,
    opportunisticGraftPeers: gossip.opportunisticGraftPeers,
    opportunisticGraftThreshold: gossip.opportunisticGraftThreshold,
    opportunisticGraftTicks: scoringParams?.opportunisticGraftTicks,
    directConnectTicks: scoringParams?.directConnectTicks,
    floodPublish: config.PUBSUB_FLOOD_PUBLISH !== false,
    doPX: config.PUBSUB_PEER_EXCHANGE !== false,
    allowPublishToZeroPeers: config.PUBSUB_ALLOW_PUBLISH_TO_ZERO_PEERS === true,
    scoreParams: scoringParams?.scoreParams ?? {},
    scoreThresholds: scoringParams?.scoreThresholds ?? {},
    gossipsubVersion: scoringParams?.version ?? '1.1',
    peerScoreInspect: inspector ?? undefined
  };

  log.info(
    {
      preset: config.NETWORK_SIZE_PRESET ?? 'medium',
      mesh,
      gossip,
      thresholds: options.scoreThresholds,
      inspectorAttached: Boolean(inspector)
    },
    'GossipSub routing configuration synthesized'
  );

  return { mesh, gossip, scoringConfig, scoringParams, inspector, options };
}
