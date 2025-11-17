import pino from 'pino';

const DEFAULT_TOPIC_PARAMS = Object.freeze({
  'agi.jobs': {
    topicWeight: 0.9,
    expectedMessagePerSecond: 0.4,
    invalidMessagePenalty: -0.75,
    timeInMeshQuantum: 1,
    timeInMeshCap: 600,
    timeInMeshWeight: 0.02,
    timeInMeshDecay: 0.5,
    firstMessageDeliveriesWeight: 1.2,
    firstMessageDeliveriesDecay: 0.5,
    meshMessageDeliveriesWeight: 1.5,
    meshMessageDeliveriesDecay: 0.5,
    meshMessageDeliveriesCap: 32,
    meshMessageDeliveriesThreshold: 4,
    meshMessageDeliveriesWindow: 10,
    meshFailurePenaltyWeight: -0.6,
    meshFailurePenaltyDecay: 0.5
  },
  'agi.metrics': {
    topicWeight: 0.35,
    expectedMessagePerSecond: 0.1,
    invalidMessagePenalty: -0.25,
    timeInMeshQuantum: 1,
    timeInMeshCap: 300,
    timeInMeshWeight: 0.015,
    timeInMeshDecay: 0.5,
    firstMessageDeliveriesWeight: 0.6,
    firstMessageDeliveriesDecay: 0.5,
    meshMessageDeliveriesWeight: 0.7,
    meshMessageDeliveriesDecay: 0.5,
    meshMessageDeliveriesCap: 24,
    meshMessageDeliveriesThreshold: 2,
    meshMessageDeliveriesWindow: 10,
    meshFailurePenaltyWeight: -0.35,
    meshFailurePenaltyDecay: 0.5
  },
  'agi.control': {
    topicWeight: 1.25,
    expectedMessagePerSecond: 0.25,
    invalidMessagePenalty: -1.5,
    timeInMeshQuantum: 1,
    timeInMeshCap: 900,
    timeInMeshWeight: 0.03,
    timeInMeshDecay: 0.5,
    firstMessageDeliveriesWeight: 1.6,
    firstMessageDeliveriesDecay: 0.5,
    meshMessageDeliveriesWeight: 1.8,
    meshMessageDeliveriesDecay: 0.5,
    meshMessageDeliveriesCap: 48,
    meshMessageDeliveriesThreshold: 6,
    meshMessageDeliveriesWindow: 10,
    meshFailurePenaltyWeight: -1.2,
    meshFailurePenaltyDecay: 0.5
  },
  'agi.coordination': {
    topicWeight: 0.5,
    expectedMessagePerSecond: 0.15,
    invalidMessagePenalty: -0.6,
    timeInMeshQuantum: 1,
    timeInMeshCap: 480,
    timeInMeshWeight: 0.02,
    timeInMeshDecay: 0.5,
    firstMessageDeliveriesWeight: 0.8,
    firstMessageDeliveriesDecay: 0.5,
    meshMessageDeliveriesWeight: 1.0,
    meshMessageDeliveriesDecay: 0.5,
    meshMessageDeliveriesCap: 28,
    meshMessageDeliveriesThreshold: 3,
    meshMessageDeliveriesWindow: 10,
    meshFailurePenaltyWeight: -0.5,
    meshFailurePenaltyDecay: 0.5
  },
  'agi.settlement': {
    topicWeight: 0.8,
    expectedMessagePerSecond: 0.2,
    invalidMessagePenalty: -0.9,
    timeInMeshQuantum: 1,
    timeInMeshCap: 720,
    timeInMeshWeight: 0.028,
    timeInMeshDecay: 0.5,
    firstMessageDeliveriesWeight: 1.1,
    firstMessageDeliveriesDecay: 0.5,
    meshMessageDeliveriesWeight: 1.3,
    meshMessageDeliveriesDecay: 0.5,
    meshMessageDeliveriesCap: 36,
    meshMessageDeliveriesThreshold: 4,
    meshMessageDeliveriesWindow: 10,
    meshFailurePenaltyWeight: -0.8,
    meshFailurePenaltyDecay: 0.5
  },
  'agi.*': {
    topicWeight: 0.4,
    expectedMessagePerSecond: 0.15,
    invalidMessagePenalty: -0.65,
    timeInMeshQuantum: 1,
    timeInMeshCap: 450,
    timeInMeshWeight: 0.02,
    timeInMeshDecay: 0.5,
    firstMessageDeliveriesWeight: 0.9,
    firstMessageDeliveriesDecay: 0.5,
    meshMessageDeliveriesWeight: 1.1,
    meshMessageDeliveriesDecay: 0.5,
    meshMessageDeliveriesCap: 30,
    meshMessageDeliveriesThreshold: 3,
    meshMessageDeliveriesWindow: 10,
    meshFailurePenaltyWeight: -0.55,
    meshFailurePenaltyDecay: 0.5
  }
});

const DEFAULT_THRESHOLDS = Object.freeze({
  gossip: -2,
  publish: -4,
  graylist: -6,
  disconnect: -9
});

function toFinite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function isPatternTopic(topic) {
  return typeof topic === 'string' && /[*?]/.test(topic);
}

function normalizeTopicScoreParams(topicParams = {}) {
  const normalized = {};
  const patterns = {};
  for (const [topic, params] of Object.entries(topicParams)) {
    if (!topic || typeof params !== 'object' || params === null) {
      continue;
    }
    const sanitized = { ...DEFAULT_TOPIC_PARAMS[topic] };
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) {
        continue;
      }
      sanitized[key] = toFinite(value, sanitized[key] ?? 0);
    }
    if (isPatternTopic(topic)) {
      patterns[topic] = sanitized;
    } else {
      normalized[topic] = sanitized;
    }
  }
  return { normalized, patterns };
}

export function buildPeerScoreConfig({
  decayIntervalMs = 1000,
  decayToZero = 0.01,
  retainScoreMs = 10 * 60 * 1000,
  opportunisticGraftTicks = 60,
  directConnectTicks = 360,
  topicParams = {},
  thresholds = {},
  version = '1.1'
} = {}) {
  const { normalized, patterns } = normalizeTopicScoreParams(topicParams);
  const mergedTopics = {};
  const mergedPatterns = { ...patterns };
  for (const [topic, params] of Object.entries(DEFAULT_TOPIC_PARAMS)) {
    if (isPatternTopic(topic)) {
      mergedPatterns[topic] = params;
    } else {
      mergedTopics[topic] = params;
    }
  }
  Object.assign(mergedTopics, normalized);
  const mergedThresholds = { ...DEFAULT_THRESHOLDS };
  for (const [key, value] of Object.entries(thresholds ?? {})) {
    mergedThresholds[key] = toFinite(value, DEFAULT_THRESHOLDS[key]);
  }

  return {
    version,
    decayIntervalMs: toFinite(decayIntervalMs, 1000),
    decayToZero: toFinite(decayToZero, 0.01),
    retainScoreMs: toFinite(retainScoreMs, 10 * 60 * 1000),
    opportunisticGraftTicks: toFinite(opportunisticGraftTicks, 60),
    directConnectTicks: toFinite(directConnectTicks, 360),
    thresholds: mergedThresholds,
    topics: mergedTopics,
    topicPatterns: mergedPatterns
  };
}

export function bucketPeer(score, thresholds) {
  if (score <= thresholds.disconnect) return 'disconnect';
  if (score <= thresholds.graylist) return 'graylist';
  if (score <= thresholds.publish) return 'publish_block';
  if (score <= thresholds.gossip) return 'gossip_suppressed';
  if (score >= 0.5) return 'positive';
  return 'neutral';
}

function normalizePeerScoreSnapshot(snapshot) {
  const timestamp = snapshot?.timestamp instanceof Date ? snapshot.timestamp : new Date();
  const peers = [];

  if (Array.isArray(snapshot?.peers)) {
    for (const entry of snapshot.peers) {
      if (!entry || !entry.id) continue;
      peers.push({
        id: entry.id,
        score: toFinite(entry.score, 0),
        topics: entry.topics ?? {},
        appSpecific: toFinite(entry.appSpecific, 0),
        behaviourPenalty: toFinite(entry.behaviourPenalty, 0),
        ipColocationFactor: toFinite(entry.ipColocationFactor, 0)
      });
    }
    return { timestamp, peers };
  }

  if (snapshot?.peers && typeof snapshot.peers === 'object') {
    for (const [peerId, value] of Object.entries(snapshot.peers)) {
      peers.push({
        id: peerId,
        score: toFinite(value?.score, 0),
        topics: value?.topics ?? {},
        appSpecific: toFinite(value?.appSpecificScore, 0),
        behaviourPenalty: toFinite(value?.behaviourPenalty, 0),
        ipColocationFactor: toFinite(value?.ipColocationFactor, 0)
      });
    }
  }

  if (snapshot?.peerScores && typeof snapshot.peerScores === 'object') {
    for (const [peerId, value] of Object.entries(snapshot.peerScores)) {
      peers.push({
        id: peerId,
        score: toFinite(value?.score, 0),
        topics: value?.topics ?? {},
        appSpecific: toFinite(value?.appSpecificScore, 0),
        behaviourPenalty: toFinite(value?.behaviourPenalty, 0),
        ipColocationFactor: toFinite(value?.ipColocationFactor, 0)
      });
    }
  }

  return { timestamp, peers };
}

function wildcardToRegExp(pattern) {
  if (!pattern || typeof pattern !== 'string') return null;
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regex = `^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`;
  return new RegExp(regex);
}

export function resolveTopicScoreParams(topicName, { topics = {}, topicPatterns = {} } = {}) {
  const baseFallback = topicPatterns['agi.*'] ?? DEFAULT_TOPIC_PARAMS['agi.*'] ?? {};
  const matches = [];
  for (const [pattern, params] of Object.entries(topicPatterns ?? {})) {
    const regex = wildcardToRegExp(pattern);
    if (regex?.test(topicName)) {
      matches.push({ pattern, params });
    }
  }
  const winner = matches.length ? matches.sort((a, b) => b.pattern.length - a.pattern.length)[0] : null;
  const explicit = topics[topicName] ?? null;
  const merged = { ...baseFallback };
  if (winner?.params) {
    Object.assign(merged, winner.params);
  }
  if (explicit) {
    Object.assign(merged, explicit);
  }
  return Object.keys(merged).length ? merged : null;
}

export function buildGossipsubScoreParams(config) {
  if (!config) return null;
  const params = { ...config };
  const topics = {};
  for (const [topic, topicConfig] of Object.entries(config.topics ?? {})) {
    topics[topic] = {
      topicWeight: topicConfig.topicWeight,
      timeInMeshWeight: topicConfig.timeInMeshWeight,
      timeInMeshQuantum: topicConfig.timeInMeshQuantum,
      timeInMeshCap: topicConfig.timeInMeshCap,
      timeInMeshDecay: topicConfig.timeInMeshDecay,
      firstMessageDeliveriesWeight: topicConfig.firstMessageDeliveriesWeight,
      firstMessageDeliveriesDecay: topicConfig.firstMessageDeliveriesDecay,
      meshMessageDeliveriesWeight: topicConfig.meshMessageDeliveriesWeight,
      meshMessageDeliveriesDecay: topicConfig.meshMessageDeliveriesDecay,
      meshMessageDeliveriesCap: topicConfig.meshMessageDeliveriesCap,
      meshMessageDeliveriesThreshold: topicConfig.meshMessageDeliveriesThreshold,
      meshMessageDeliveriesWindow: topicConfig.meshMessageDeliveriesWindow,
      meshFailurePenaltyWeight: topicConfig.meshFailurePenaltyWeight,
      meshFailurePenaltyDecay: topicConfig.meshFailurePenaltyDecay,
      invalidMessageDeliveriesWeight: topicConfig.invalidMessagePenalty,
      invalidMessageDeliveriesDecay: 0.5,
      expectedMessagePerSecond: topicConfig.expectedMessagePerSecond
    };
  }

  return {
    version: params.version ?? '1.1',
    decayInterval: params.decayIntervalMs,
    decayToZero: params.decayToZero,
    retainScore: params.retainScoreMs,
    opportunisticGraftTicks: params.opportunisticGraftTicks,
    directConnectTicks: params.directConnectTicks,
    scoreParams: {
      topics,
      appSpecificScore: () => 0,
      appSpecificWeight: 0,
      topicScoreCap: 32,
      behaviourPenaltyWeight: -1,
      behaviourPenaltyDecay: 0.9,
      ipColocationFactorWeight: -0.5,
      ipColocationFactorThreshold: 2,
      decayInterval: params.decayIntervalMs,
      decayToZero: params.decayToZero,
      retainScore: params.retainScoreMs
    },
    scoreThresholds: params.thresholds
  };
}

export function createPeerScoreRegistry({
  inspectIntervalMs = 30_000,
  retentionMinutes = 120,
  logger = pino({ level: 'info', name: 'peer-score-registry' })
} = {}) {
  let latest = null;
  const history = [];
  const retentionMs = Math.max(1, toFinite(retentionMinutes, 120)) * 60 * 1000;
  const log = typeof logger?.child === 'function' ? logger.child({ subsystem: 'peer-score' }) : logger;
  const subscribers = new Set();

  function record(snapshot) {
    const normalized = normalizePeerScoreSnapshot(snapshot);
    latest = normalized;
    history.push(normalized);
    const cutoff = Date.now() - retentionMs;
    while (history.length && history[0].timestamp.getTime() < cutoff) {
      history.shift();
    }
    log?.debug?.({ peers: normalized.peers.length }, 'peer score snapshot recorded');
    subscribers.forEach((listener) => {
      try {
        listener?.(normalized);
      } catch (error) {
        log?.warn?.(error, 'peer score subscriber threw during record');
      }
    });
    return normalized;
  }

  function getLatest() {
    return latest;
  }

  function getBuckets({ thresholds = DEFAULT_THRESHOLDS } = {}) {
    if (!latest) return { total: 0, buckets: {} };
    const buckets = {};
    latest.peers.forEach((peer) => {
      const bucket = bucketPeer(peer.score, thresholds);
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    });
    return { total: latest.peers.length, buckets, updatedAt: latest.timestamp };
  }

  function summarize({ limit = 20, direction = 'desc', thresholds = DEFAULT_THRESHOLDS } = {}) {
    if (!latest) {
      return {
        updatedAt: null,
        totalPeers: 0,
        topPositive: [],
        topNegative: [],
        buckets: {}
      };
    }

    const sorted = [...latest.peers].sort((a, b) => (direction === 'asc' ? a.score - b.score : b.score - a.score));
    const topPositive = sorted.filter((entry) => entry.score >= 0).slice(0, limit);
    const topNegative = [...sorted].reverse().slice(0, limit);
    return {
      updatedAt: latest.timestamp.toISOString(),
      totalPeers: latest.peers.length,
      buckets: getBuckets({ thresholds }).buckets,
      topPositive,
      topNegative
    };
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    subscribers.add(listener);
    return () => subscribers.delete(listener);
  }

  return {
    inspectIntervalMs: toFinite(inspectIntervalMs, 30_000),
    record,
    getLatest,
    getBuckets,
    summarize,
    subscribe
  };
}

export function createPeerScoreInspector({ registry, logger, thresholds } = {}) {
  const log = typeof logger?.child === 'function' ? logger.child({ subsystem: 'peer-score-inspect' }) : logger;
  const activeRegistry = registry ?? createPeerScoreRegistry({ logger: log });

  function handler(snapshot) {
    const recorded = activeRegistry.record(snapshot);
    if (recorded.peers.length > 0) {
      const lowest = [...recorded.peers].sort((a, b) => a.score - b.score)[0];
      const highest = [...recorded.peers].sort((a, b) => b.score - a.score)[0];
      log?.info?.(
        {
          peers: recorded.peers.length,
          lowest: lowest ? { id: lowest.id, score: lowest.score } : null,
          highest: highest ? { id: highest.id, score: highest.score } : null
        },
        'peer score snapshot ingested'
      );
    }
  }

  return {
    handler,
    registry: activeRegistry,
    thresholds: thresholds ?? DEFAULT_THRESHOLDS
  };
}

export {
  DEFAULT_TOPIC_PARAMS as DEFAULT_PEER_TOPIC_PARAMS,
  DEFAULT_THRESHOLDS as DEFAULT_PEER_SCORE_THRESHOLDS
};
