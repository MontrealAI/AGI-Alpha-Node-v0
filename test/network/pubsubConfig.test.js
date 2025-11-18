import { describe, expect, it, vi } from 'vitest';
import { buildGossipsubRoutingConfig } from '../../src/network/pubsubConfig.js';
import { buildPeerScoreConfig } from '../../src/services/peerScoring.js';

const silentLogger = { info: vi.fn(), child: () => silentLogger };

describe('GossipSub routing config', () => {
  it('synthesizes defaults with scoring + inspector wiring', () => {
    const inspector = { handler: vi.fn() };
    const { mesh, gossip, options, scoringConfig, scoringParams, inspector: inspectorFn } = buildGossipsubRoutingConfig({
      config: {},
      peerScoreInspector: inspector,
      logger: silentLogger
    });

    expect(mesh).toEqual({ D: 8, Dlo: 6, Dhi: 12, Dout: 32, Dlazy: 12 });
    expect(gossip.gossipFactor).toBeCloseTo(0.25);
    expect(gossip.gossipRetransmission).toBe(3);
    expect(gossip.fanoutTTLSeconds).toBe(60);
    expect(options.fanoutTTL).toBe(60_000);
    expect(options.gossipsubVersion).toBe('1.1');
    expect(options.peerScoreInspect).toBe(inspector.handler);
    expect(inspectorFn).toBe(inspector.handler);
    expect(scoringConfig.thresholds.disconnect).toBe(-9);
    expect(scoringParams.scoreThresholds.disconnect).toBe(-9);
  });

  it('honors overrides and provided score config', () => {
    const customScoreConfig = buildPeerScoreConfig({
      thresholds: { gossip: -1, publish: -2, graylist: -3, disconnect: -4 },
      topicParams: { 'agi.jobs': { topicWeight: 2.5 } },
      decayIntervalMs: 500,
      retainScoreMs: 1000
    });

    const { mesh, gossip, options, scoringConfig } = buildGossipsubRoutingConfig({
      config: {
        PUBSUB_D: 10,
        PUBSUB_D_LOW: 7,
        PUBSUB_D_HIGH: 14,
        PUBSUB_D_OUT: 40,
        PUBSUB_D_LAZY: 16,
        PUBSUB_GOSSIP_FACTOR: 0.35,
        PUBSUB_GOSSIP_RETRANSMISSION: 4,
        PUBSUB_FANOUT_TTL_SECONDS: 90,
        PUBSUB_OPPORTUNISTIC_GRAFT_THRESHOLD: 7,
        PUBSUB_OPPORTUNISTIC_GRAFT_PEERS: 5,
        PUBSUB_FLOOD_PUBLISH: false,
        PUBSUB_PEER_EXCHANGE: false,
        PUBSUB_ALLOW_PUBLISH_TO_ZERO_PEERS: true
      },
      peerScoreConfig: customScoreConfig,
      logger: silentLogger
    });

    expect(mesh).toEqual({ D: 10, Dlo: 7, Dhi: 14, Dout: 40, Dlazy: 16 });
    expect(gossip).toMatchObject({
      gossipFactor: 0.35,
      gossipRetransmission: 4,
      fanoutTTLSeconds: 90,
      fanoutTTL: 90_000,
      opportunisticGraftPeers: 5,
      opportunisticGraftThreshold: 7
    });
    expect(options.floodPublish).toBe(false);
    expect(options.doPX).toBe(false);
    expect(options.allowPublishToZeroPeers).toBe(true);
    expect(options.scoreThresholds.disconnect).toBe(-4);
    expect(scoringConfig).toBe(customScoreConfig);
  });

  it('applies network size presets for mesh and gossip knobs', () => {
    const { mesh, gossip } = buildGossipsubRoutingConfig({
      config: {
        NETWORK_SIZE_PRESET: 'large'
      },
      logger: silentLogger
    });

    expect(mesh).toEqual({ D: 12, Dlo: 10, Dhi: 18, Dout: 48, Dlazy: 16 });
    expect(gossip.gossipFactor).toBeCloseTo(0.32);
    expect(gossip.gossipRetransmission).toBe(4);
  });
});
