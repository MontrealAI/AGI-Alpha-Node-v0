import { Gauge } from 'prom-client';
import { bucketPeer, DEFAULT_PEER_SCORE_THRESHOLDS } from '../services/peerScoring.js';

function toFinite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function coerceTimestampSeconds(timestamp) {
  if (timestamp instanceof Date) {
    return Math.floor(timestamp.getTime() / 1000);
  }
  const numeric = Number(timestamp ?? 0);
  if (Number.isFinite(numeric) && numeric > 1e12) {
    return Math.floor(numeric / 1000);
  }
  return Math.floor(toFinite(timestamp, Date.now()) / 1000);
}

export function createPeerScoreMetrics({ registry }) {
  const peerScoreBucketGauge = new Gauge({
    name: 'peer_score_bucket_total',
    help: 'Count of peers by scoring bucket',
    labelNames: ['bucket'],
    registers: [registry]
  });

  const peerScoreTopicContributionGauge = new Gauge({
    name: 'peer_score_topic_contribution',
    help: 'Aggregated peer score contribution per topic/component',
    labelNames: ['topic', 'component'],
    registers: [registry]
  });

  const peerScoreSnapshotGauge = new Gauge({
    name: 'peer_score_snapshot_seconds',
    help: 'Unix timestamp of the latest peer score snapshot applied',
    registers: [registry]
  });

  return { peerScoreBucketGauge, peerScoreTopicContributionGauge, peerScoreSnapshotGauge };
}

export function applyPeerScoreSnapshot({ metrics, snapshot, thresholds = DEFAULT_PEER_SCORE_THRESHOLDS }) {
  if (!metrics || !snapshot) return;
  const buckets = {};
  const topicTotals = new Map();
  const topicCounts = new Map();

  const peers = snapshot?.peers ?? [];
  peers.forEach((peer) => {
    const score = toFinite(peer?.score, 0);
    const bucket = bucketPeer(score, thresholds);
    buckets[bucket] = (buckets[bucket] ?? 0) + 1;

    const topics = peer?.topics ?? {};
    for (const [topic, contribution] of Object.entries(topics)) {
      if (!topic) continue;
      const topicScore = toFinite(contribution?.score ?? contribution, 0);
      const topicKey = String(topic);
      topicTotals.set(topicKey, (topicTotals.get(topicKey) ?? 0) + topicScore);
      topicCounts.set(topicKey, (topicCounts.get(topicKey) ?? 0) + 1);
    }

    const behaviourPenalty = toFinite(peer?.behaviourPenalty, 0);
    const appSpecific = toFinite(peer?.appSpecific, 0);
    if (behaviourPenalty !== 0) {
      const key = 'behaviour_penalty';
      topicTotals.set(key, (topicTotals.get(key) ?? 0) + behaviourPenalty);
      topicCounts.set(key, (topicCounts.get(key) ?? 0) + 1);
    }
    if (appSpecific !== 0) {
      const key = 'app_specific';
      topicTotals.set(key, (topicTotals.get(key) ?? 0) + appSpecific);
      topicCounts.set(key, (topicCounts.get(key) ?? 0) + 1);
    }
  });

  metrics.peerScoreBucketGauge.reset();
  for (const [bucket, count] of Object.entries(buckets)) {
    metrics.peerScoreBucketGauge.set({ bucket }, toFinite(count, 0));
  }

  metrics.peerScoreTopicContributionGauge.reset();
  for (const [topic, total] of topicTotals.entries()) {
    const count = toFinite(topicCounts.get(topic), 0) || 1;
    metrics.peerScoreTopicContributionGauge.set({ topic, component: 'total' }, toFinite(total, 0));
    metrics.peerScoreTopicContributionGauge.set({ topic, component: 'avg' }, toFinite(total, 0) / count);
  }

  metrics.peerScoreSnapshotGauge.set(coerceTimestampSeconds(snapshot.timestamp));
}
