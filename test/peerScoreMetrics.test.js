import { describe, expect, it } from 'vitest';
import { Registry } from 'prom-client';
import { applyPeerScoreSnapshot, createPeerScoreMetrics } from '../src/telemetry/peerScoreMetrics.js';

async function findGaugeValue(registry, metricName, labels = {}) {
  const metric = registry.getSingleMetric(metricName);
  const snapshot = metric ? await metric.get() : null;
  const values = snapshot?.values ?? [];
  return values.find((entry) =>
    Object.entries(labels).every(([key, value]) => entry.labels?.[key] === value)
  )?.value;
}

describe('peer score metrics surfaces', () => {
  it('records buckets and topic contributions from snapshots', async () => {
    const registry = new Registry();
    const metrics = createPeerScoreMetrics({ registry });

    applyPeerScoreSnapshot({
      metrics,
      thresholds: { gossip: -2, publish: -4, graylist: -6, disconnect: -9 },
      snapshot: {
        timestamp: new Date('2024-01-01T00:00:00Z'),
        peers: [
          { id: 'peer-positive', score: 3.2, topics: { 'agi.jobs': { score: 1.5 } } },
          { id: 'peer-gray', score: -5.5, topics: { 'agi.metrics': { score: -1.1 } }, behaviourPenalty: -0.5 }
        ]
      }
    });

    expect(await findGaugeValue(registry, 'peer_score_bucket_total', { bucket: 'positive' })).toBe(1);
    expect(await findGaugeValue(registry, 'peer_score_bucket_total', { bucket: 'publish_block' })).toBe(1);

    expect(
      await findGaugeValue(registry, 'peer_score_topic_contribution', { topic: 'agi.jobs', component: 'total' })
    ).toBeCloseTo(1.5);
    expect(
      await findGaugeValue(registry, 'peer_score_topic_contribution', { topic: 'agi.metrics', component: 'total' })
    ).toBeCloseTo(-1.1);
    expect(
      await findGaugeValue(registry, 'peer_score_topic_contribution', { topic: 'behaviour_penalty', component: 'total' })
    ).toBeCloseTo(-0.5);

    const timestampValue = await findGaugeValue(registry, 'peer_score_snapshot_seconds');
    expect(timestampValue).toBe(Math.floor(new Date('2024-01-01T00:00:00Z').getTime() / 1000));
  });

  it('resets gauges when snapshots are empty', async () => {
    const registry = new Registry();
    const metrics = createPeerScoreMetrics({ registry });

    applyPeerScoreSnapshot({
      metrics,
      snapshot: { timestamp: new Date('2024-02-02T00:00:00Z'), peers: [] }
    });

    expect(await findGaugeValue(registry, 'peer_score_bucket_total')).toBeUndefined();
    expect(await findGaugeValue(registry, 'peer_score_topic_contribution')).toBeUndefined();
    const snapshotValue = await findGaugeValue(registry, 'peer_score_snapshot_seconds');
    expect(snapshotValue).toBe(Math.floor(new Date('2024-02-02T00:00:00Z').getTime() / 1000));
  });
});
