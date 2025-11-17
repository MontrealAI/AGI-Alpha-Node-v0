import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PEER_TOPIC_PARAMS,
  buildPeerScoreConfig,
  createPeerScoreRegistry
} from '../src/services/peerScoring.js';

describe('peer scoring configuration', () => {
  it('merges per-topic overrides with defaults', () => {
    const config = buildPeerScoreConfig({
      topicParams: { 'agi.jobs': { topicWeight: 2.5, invalidMessagePenalty: -2 } },
      thresholds: { graylist: -8 }
    });

    expect(config.version).toBe('1.1');
    expect(config.topics['agi.jobs'].topicWeight).toBe(2.5);
    expect(config.topics['agi.jobs'].invalidMessagePenalty).toBe(-2);
    expect(config.topics['agi.metrics']).toEqual(DEFAULT_PEER_TOPIC_PARAMS['agi.metrics']);
    expect(config.thresholds.graylist).toBe(-8);
    expect(config.opportunisticGraftTicks).toBeGreaterThan(0);
  });
});

describe('peer scoring registry', () => {
  it('summarizes snapshots with positive and negative peers', () => {
    const registry = createPeerScoreRegistry({ retentionMinutes: 1, inspectIntervalMs: 1_000 });

    registry.record({
      timestamp: new Date('2024-01-01T00:00:00Z'),
      peers: [
        { id: 'peer-1', score: 6.5 },
        { id: 'peer-2', score: -7.5, topics: { 'agi.jobs': { score: -5 } } },
        { id: 'peer-3', score: 1.2 }
      ]
    });

    const summary = registry.summarize({ limit: 2 });
    expect(summary.totalPeers).toBe(3);
    expect(summary.topPositive.map((peer) => peer.id)).toEqual(['peer-1', 'peer-3']);
    expect(summary.topNegative[0].id).toBe('peer-2');
    expect(summary.buckets.graylist).toBeGreaterThanOrEqual(1);
  });
});
