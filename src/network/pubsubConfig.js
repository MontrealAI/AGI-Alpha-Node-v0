import pino from 'pino';
import { buildPeerScoreConfig, buildGossipsubScoreParams } from '../services/peerScoring.js';

function toFinite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function resolveLogger(baseLogger = pino({ level: 'info', name: 'pubsub-config' })) {
  return typeof baseLogger?.info === 'function' ? baseLogger : pino({ level: 'info', name: 'pubsub-config' });
}

function resolveMeshConfig(config = {}) {
  return {
    D: toFinite(config.PUBSUB_D, 8),
    Dlo: toFinite(config.PUBSUB_D_LOW, 6),
    Dhi: toFinite(config.PUBSUB_D_HIGH, 12),
    Dout: toFinite(config.PUBSUB_D_OUT, 32),
    Dlazy: toFinite(config.PUBSUB_D_LAZY, 12)
  };
}

function resolveGossipConfig(config = {}) {
  return {
    fanoutTTL: toFinite(config.PUBSUB_FANOUT_TTL_SECONDS, 60),
    gossipFactor: toFinite(config.PUBSUB_GOSSIP_FACTOR, 0.25),
    gossipRetransmission: toFinite(config.PUBSUB_GOSSIP_RETRANSMISSION, 3),
    opportunisticGraftPeers: toFinite(config.PUBSUB_OPPORTUNISTIC_GRAFT_PEERS, toFinite(config.PUBSUB_D, 8)),
    opportunisticGraftThreshold: toFinite(config.PUBSUB_OPPORTUNISTIC_GRAFT_THRESHOLD, 5)
  };
}

export function buildGossipsubRoutingConfig({ config = {}, peerScoreConfig = null, peerScoreInspector = null, logger } = {}) {
  const log = resolveLogger(logger);
  const mesh = resolveMeshConfig(config);
  const gossip = resolveGossipConfig(config);
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
      mesh,
      gossip,
      thresholds: options.scoreThresholds,
      inspectorAttached: Boolean(inspector)
    },
    'GossipSub routing configuration synthesized'
  );

  return { mesh, gossip, scoringConfig, scoringParams, inspector, options };
}
