import fs from 'node:fs';
import path from 'node:path';
import pino from 'pino';
import { DialerPolicy } from './dialerPolicy.js';

const logger = pino({ level: 'info', name: 'resource-manager-config' });

function coerceFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function parseJsonMaybe(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function parseYamlLite(input) {
  if (!input || typeof input !== 'string') return undefined;
  const lines = input
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
  if (!lines.length) return undefined;
  const result = {};
  for (const line of lines) {
    const [key, ...rest] = line.split(':');
    if (!key || rest.length === 0) continue;
    const value = rest.join(':').trim();
    const numeric = Number(value);
    result[key.trim()] = Number.isFinite(numeric) ? numeric : value;
  }
  return Object.keys(result).length ? result : undefined;
}

function loadAdvancedOverrides({ inlineOverrides, overridesPath }) {
  const inlineParsed = parseJsonMaybe(inlineOverrides) ?? parseYamlLite(inlineOverrides);
  if (inlineParsed) {
    return inlineParsed;
  }

  if (!overridesPath) {
    return undefined;
  }
  const resolved = path.resolve(process.cwd(), overridesPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`NRM limits file not found at ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, 'utf8');
  return parseJsonMaybe(raw) ?? parseYamlLite(raw);
}

function scaleLimit(value, scaleFactor) {
  if (!Number.isFinite(value)) return undefined;
  const scaled = Math.floor(value * scaleFactor);
  return scaled > 0 ? scaled : value;
}

function buildLimitSet({ scaleFactor }) {
  const base = {
    maxConnections: 1_024,
    maxStreams: 8_192,
    maxMemoryBytes: 512 * 1024 * 1024,
    maxFds: 2_048,
    maxBandwidthBps: 64 * 1024 * 1024
  };

  return Object.fromEntries(
    Object.entries(base).map(([key, value]) => [key, scaleLimit(value, scaleFactor)])
  );
}

function validateWatermarks({ lowWater, highWater }) {
  if (highWater <= lowWater) {
    throw new Error('Connection manager high_water must be greater than low_water');
  }
}

export function buildResourceManagerConfig({ config = {}, logger: baseLogger } = {}) {
  const log = typeof baseLogger?.info === 'function' ? baseLogger : logger;
  const scaleFactor = coerceFiniteNumber(config.NRM_SCALE_FACTOR, 1) || 1;
  const advancedOverrides = loadAdvancedOverrides({
    inlineOverrides: config.NRM_LIMITS_JSON,
    overridesPath: config.NRM_LIMITS_PATH
  });

  const limitSet = buildLimitSet({ scaleFactor });
  const mergedGlobal = { ...limitSet, ...(advancedOverrides?.global ?? {}) };
  const perProtocol = advancedOverrides?.perProtocol ?? {};
  const perPeer = advancedOverrides?.perPeer ?? {};

  const connectionManager = {
    lowWater: coerceFiniteNumber(config.CONN_LOW_WATER, 512),
    highWater: coerceFiniteNumber(config.CONN_HIGH_WATER, 1_024),
    gracePeriodSeconds: coerceFiniteNumber(config.CONN_GRACE_PERIOD_SEC, 120)
  };

  validateWatermarks(connectionManager);

  const ipLimiter = {
    maxConnsPerIp: coerceFiniteNumber(config.MAX_CONNS_PER_IP, 64),
    maxConnsPerAsn: coerceFiniteNumber(config.MAX_CONNS_PER_ASN, 256),
    bannedPeers: new Set(config.NRM_BANNED_PEERS ?? []),
    bannedIps: new Set(config.NRM_BANNED_IPS ?? []),
    bannedAsns: new Set(config.NRM_BANNED_ASNS ?? [])
  };

  const summary = {
    scaleFactor,
    global: mergedGlobal,
    perProtocol,
    perPeer,
    connectionManager,
    ipLimiter
  };

  log.info(
    {
      ...summary,
      ipLimiter: {
        ...ipLimiter,
        bannedIps: Array.from(ipLimiter.bannedIps),
        bannedPeers: Array.from(ipLimiter.bannedPeers),
        bannedAsns: Array.from(ipLimiter.bannedAsns)
      }
    },
    'Resource manager configuration synthesized'
  );

  return summary;
}

export class ResourceManager {
  constructor({ limits, logger: baseLogger }) {
    this.log = typeof baseLogger?.info === 'function' ? baseLogger : logger;
    this.limits = limits ?? {};
    this.connections = new Map();
    this.streamProtocols = new Map();
    this.peerStreams = new Map();
    this.denials = { connections: 0, streams: 0, reasons: {} };
    this.ipConns = new Map();
    this.asnConns = new Map();
    this.lastPressureLog = { connections: 0, streams: 0, ip: 0, asn: 0 };
    this.directionCounts = { inbound: 0, outbound: 0 };
    this.dialerPolicy = null;
  }

  attachDialerPolicy(policyConfig) {
    this.dialerPolicy = policyConfig ?? null;
  }

  isBannedIp(ip) {
    return Boolean(this.limits?.ipLimiter?.bannedIps?.has?.(ip));
  }

  isBannedPeer(peerId) {
    return Boolean(this.limits?.ipLimiter?.bannedPeers?.has?.(peerId));
  }

  isBannedAsn(asn) {
    return Boolean(this.limits?.ipLimiter?.bannedAsns?.has?.(asn));
  }

  banIp(ip) {
    this.limits?.ipLimiter?.bannedIps?.add?.(ip);
  }

  banPeer(peerId) {
    this.limits?.ipLimiter?.bannedPeers?.add?.(peerId);
  }

  banAsn(asn) {
    this.limits?.ipLimiter?.bannedAsns?.add?.(asn);
  }

  unbanIp(ip) {
    this.limits?.ipLimiter?.bannedIps?.delete?.(ip);
  }

  unbanPeer(peerId) {
    this.limits?.ipLimiter?.bannedPeers?.delete?.(peerId);
  }

  unbanAsn(asn) {
    this.limits?.ipLimiter?.bannedAsns?.delete?.(asn);
  }

  currentConnections() {
    return Array.from(this.connections.values()).reduce((total, value) => total + value, 0);
  }

  currentStreams() {
    return Array.from(this.streamProtocols.values()).reduce((total, value) => total + value, 0);
  }

  incrementMap(map, key) {
    const next = (map.get(key) ?? 0) + 1;
    map.set(key, next);
    return next;
  }

  decrementMap(map, key) {
    const next = (map.get(key) ?? 0) - 1;
    if (next <= 0) {
      map.delete(key);
    } else {
      map.set(key, next);
    }
  }

  deny(reason, type = 'connections') {
    this.denials[type] += 1;
    this.denials.reasons[reason] = (this.denials.reasons[reason] ?? 0) + 1;
    this.log.warn({ reason, type }, 'Resource manager denial');
    return { accepted: false, reason };
  }

  logPressure({ metric, used, limit }) {
    if (!limit || limit <= 0) return;
    const utilization = used / limit;
    const now = Date.now();
    if (utilization >= 0.8 && now - (this.lastPressureLog[metric] ?? 0) > 15_000) {
      this.lastPressureLog[metric] = now;
      this.log.warn({ metric, used, limit, utilization }, 'Resource pressure approaching limit');
    }
  }

  requestConnection({ peerId, ip, protocol, asn, direction = 'inbound' } = {}) {
    if (this.isBannedIp(ip)) {
      return this.deny('banned-ip', 'connections');
    }
    if (this.isBannedPeer(peerId)) {
      return this.deny('banned-peer', 'connections');
    }
    if (this.isBannedAsn(asn)) {
      return this.deny('banned-asn', 'connections');
    }
    const maxGlobal = this.limits?.global?.maxConnections;
    if (maxGlobal && this.currentConnections() >= maxGlobal) {
      this.logPressure({ metric: 'connections', used: this.currentConnections(), limit: maxGlobal });
      return this.deny('global-connection-cap', 'connections');
    }

    const maxPerIp = this.limits?.ipLimiter?.maxConnsPerIp;
    if (maxPerIp && ip) {
      const ipCount = this.incrementMap(this.ipConns, ip);
      if (ipCount > maxPerIp) {
        this.decrementMap(this.ipConns, ip);
        return this.deny('per-ip-cap', 'connections');
      }
    }

    const maxPerAsn = this.limits?.ipLimiter?.maxConnsPerAsn;
    if (maxPerAsn && asn) {
      const asnCount = this.incrementMap(this.asnConns, asn);
      if (asnCount > maxPerAsn) {
        this.decrementMap(this.asnConns, asn);
        if (maxPerIp && ip) {
          this.decrementMap(this.ipConns, ip);
        }
        return this.deny('per-asn-cap', 'connections');
      }
    }

    const perProtocol = protocol ? this.limits?.perProtocol?.[protocol]?.maxConnections : null;
    const protocolKey = protocol ?? 'unknown-protocol';
    const protocolCount = this.connections.get(protocolKey) ?? 0;
    if (perProtocol && protocolCount >= perProtocol) {
      if (maxPerIp && ip) {
        this.decrementMap(this.ipConns, ip);
      }
      if (maxPerAsn && asn) {
        this.decrementMap(this.asnConns, asn);
      }
      return this.deny('per-protocol-cap', 'connections');
    }

    this.connections.set(protocolKey, protocolCount + 1);
    const normalizedDirection = direction === 'outbound' ? 'outbound' : 'inbound';
    this.directionCounts[normalizedDirection] = (this.directionCounts[normalizedDirection] ?? 0) + 1;
    return { accepted: true };
  }

  closeConnection({ protocol, ip, asn, direction = 'inbound' }) {
    if (protocol) {
      this.decrementMap(this.connections, protocol);
    }
    if (ip) {
      this.decrementMap(this.ipConns, ip);
    }
    if (asn) {
      this.decrementMap(this.asnConns, asn);
    }
    const normalizedDirection = direction === 'outbound' ? 'outbound' : 'inbound';
    const existing = this.directionCounts[normalizedDirection] ?? 0;
    this.directionCounts[normalizedDirection] = existing > 0 ? existing - 1 : 0;
  }

  requestStream({ peerId, protocol, ip, asn } = {}) {
    if (this.isBannedIp(ip)) {
      return this.deny('banned-ip', 'streams');
    }
    if (this.isBannedPeer(peerId)) {
      return this.deny('banned', 'streams');
    }
    if (this.isBannedAsn(asn)) {
      return this.deny('banned-asn', 'streams');
    }
    const maxGlobal = this.limits?.global?.maxStreams;
    if (maxGlobal && this.currentStreams() >= maxGlobal) {
      this.logPressure({ metric: 'streams', used: this.currentStreams(), limit: maxGlobal });
      return this.deny('global-stream-cap', 'streams');
    }

    const perProtocol = protocol ? this.limits?.perProtocol?.[protocol]?.maxStreams : null;
    const protocolKey = protocol ?? 'unknown-protocol';
    const protocolCount = this.streamProtocols.get(protocolKey) ?? 0;
    if (perProtocol && protocolCount >= perProtocol) {
      return this.deny('per-protocol-cap', 'streams');
    }

    const perPeer = peerId ? this.limits?.perPeer?.[peerId]?.maxStreams : null;
    if (perPeer) {
      const peerStreams = this.peerStreams.get(peerId) ?? 0;
      if (peerStreams >= perPeer) {
        return this.deny('per-peer-cap', 'streams');
      }
      this.peerStreams.set(peerId, peerStreams + 1);
    }

    this.streamProtocols.set(protocolKey, protocolCount + 1);
    return { accepted: true };
  }

  closeStream({ peerId, protocol }) {
    if (peerId) {
      this.decrementMap(this.peerStreams, peerId);
    }
    if (protocol) {
      this.decrementMap(this.streamProtocols, protocol);
    }
  }

  metrics() {
    const globalConnections = this.limits?.global?.maxConnections ?? null;
    const globalStreams = this.limits?.global?.maxStreams ?? null;
    this.logPressure({ metric: 'connections', used: this.currentConnections(), limit: globalConnections });
    this.logPressure({ metric: 'streams', used: this.currentStreams(), limit: globalStreams });

    const outbound = this.directionCounts.outbound ?? 0;
    const inbound = this.directionCounts.inbound ?? 0;
    const total = outbound + inbound;
    const policy = this.dialerPolicy;
    const planner = policy ? new DialerPolicy(policy) : null;
    const availableCapacity =
      Number.isFinite(globalConnections) && globalConnections !== null
        ? Math.max(globalConnections - this.currentConnections(), 0)
        : null;
    const dialPlan =
      planner && Number.isFinite(availableCapacity)
        ? planner.computeOutboundPlan({ outbound, inbound, dialable: availableCapacity })
        : null;

    const pressure = {
      connections: {
        used: this.currentConnections(),
        limit: globalConnections,
        utilization: globalConnections ? this.currentConnections() / globalConnections : null
      },
      streams: {
        used: this.currentStreams(),
        limit: globalStreams,
        utilization: globalStreams ? this.currentStreams() / globalStreams : null
      },
      ip: {
        used: Math.max(...[0, ...this.ipConns.values()]),
        limit: this.limits?.ipLimiter?.maxConnsPerIp ?? null,
        utilization:
          this.limits?.ipLimiter?.maxConnsPerIp
            ? Math.max(...[0, ...this.ipConns.values()]) / this.limits.ipLimiter.maxConnsPerIp
            : null
      },
      asn: {
        used: Math.max(...[0, ...this.asnConns.values()]),
        limit: this.limits?.ipLimiter?.maxConnsPerAsn ?? null,
        utilization:
          this.limits?.ipLimiter?.maxConnsPerAsn
            ? Math.max(...[0, ...this.asnConns.values()]) / this.limits.ipLimiter.maxConnsPerAsn
            : null
      }
    };

    return {
      connections: this.currentConnections(),
      streams: this.currentStreams(),
      ipConns: Object.fromEntries(this.ipConns),
      asnConns: Object.fromEntries(this.asnConns),
      streamProtocols: Object.fromEntries(this.streamProtocols),
      peerStreams: Object.fromEntries(this.peerStreams),
      denials: this.denials,
      limits: this.limits,
      pressure,
      direction: {
        inbound,
        outbound,
        ratio: total > 0 ? outbound / total : null,
        target: policy?.outbound?.targetRatio ?? null,
        tolerance: policy?.outbound?.tolerance ?? null,
        plan: dialPlan
      },
      capacity: {
        maxConnections: globalConnections,
        availableConnections: availableCapacity
      }
    };
  }
}

export class ConnectionManager {
  constructor({ lowWater, highWater, gracePeriodSeconds, logger: baseLogger }) {
    validateWatermarks({ lowWater, highWater });
    this.lowWater = lowWater;
    this.highWater = highWater;
    this.gracePeriodSeconds = gracePeriodSeconds;
    this.log = typeof baseLogger?.info === 'function' ? baseLogger : logger;
  }

  trim(peers = [], nowMs = Date.now()) {
    if (!Array.isArray(peers) || peers.length <= this.highWater) {
      return { kept: peers ?? [], trimmed: [] };
    }

    const graceCutoff = nowMs - this.gracePeriodSeconds * 1000;

    const sortable = [...peers].map((peer) => ({
      ...peer,
      score: Number.isFinite(peer.score) ? peer.score : -Infinity,
      connectedAt: peer.connectedAt ?? 0,
      pinned: peer.pinned ?? false,
      whitelisted: peer.whitelisted ?? false
    }));

    const pinned = sortable.filter((peer) => peer.pinned || peer.whitelisted);
    const graceProtected = sortable.filter((peer) => !peer.pinned && !peer.whitelisted && peer.connectedAt >= graceCutoff);
    const candidates = sortable.filter((peer) => !peer.pinned && !peer.whitelisted && peer.connectedAt < graceCutoff);

    candidates.sort((a, b) => a.score - b.score || a.connectedAt - b.connectedAt);

    const target = Math.max(this.lowWater - pinned.length - graceProtected.length, 0);
    const trimmed = candidates.slice(0, Math.max(candidates.length - target, 0));
    const kept = [
      ...pinned,
      ...graceProtected,
      ...candidates.slice(Math.max(candidates.length - target, 0))
    ];

    if (trimmed.length) {
      this.log.warn(
        {
          trimmed: trimmed.map((peer) => peer.peerId),
          kept: kept.map((peer) => peer.peerId),
          graceProtected: graceProtected.map((peer) => peer.peerId)
        },
        'Connection manager trimming applied'
      );
    }

    return { kept, trimmed };
  }
}

export function createBanList(initial = {}) {
  const bannedIps = new Set(initial.ips ?? []);
  const bannedPeers = new Set(initial.peers ?? []);
  const bannedAsns = new Set(initial.asns ?? []);
  return {
    bannedIps,
    bannedPeers,
    bannedAsns,
    addIp: (ip) => bannedIps.add(ip),
    addPeer: (peer) => bannedPeers.add(peer),
    addAsn: (asn) => bannedAsns.add(asn),
    removeIp: (ip) => bannedIps.delete(ip),
    removePeer: (peer) => bannedPeers.delete(peer),
    removeAsn: (asn) => bannedAsns.delete(asn),
    hasIp: (ip) => bannedIps.has(ip),
    hasPeer: (peer) => bannedPeers.has(peer),
    hasAsn: (asn) => bannedAsns.has(asn)
  };
}

export function buildAbuseHarness({ resourceManager }) {
  if (!resourceManager) {
    throw new Error('Resource manager is required for abuse harness');
  }

  return {
    connectionFlood({ total = 0, protocol = 'gossipsub', ip = '127.0.0.1', asn = 'asn-local' } = {}) {
      const results = { accepted: 0, denied: 0, reasons: {} };
      for (let i = 0; i < total; i += 1) {
        const outcome = resourceManager.requestConnection({ peerId: `peer-${i}`, ip, protocol, asn });
        if (outcome.accepted) {
          results.accepted += 1;
        } else {
          results.denied += 1;
          results.reasons[outcome.reason] = (results.reasons[outcome.reason] ?? 0) + 1;
        }
      }
      return results;
    },
    streamFlood({ total = 0, peerId = 'peer-1', protocol = 'gossipsub' } = {}) {
      const results = { accepted: 0, denied: 0, reasons: {} };
      for (let i = 0; i < total; i += 1) {
        const outcome = resourceManager.requestStream({ peerId, protocol });
        if (outcome.accepted) {
          results.accepted += 1;
        } else {
          results.denied += 1;
          results.reasons[outcome.reason] = (results.reasons[outcome.reason] ?? 0) + 1;
        }
      }
      return results;
    },
    malformedGossip({ penaltyThreshold = -6, invalidMessages = 0 } = {}) {
      const penalties = [];
      for (let i = 0; i < invalidMessages; i += 1) {
        penalties.push({ peer: `peer-${i}`, score: penaltyThreshold - 1 });
      }
      return { penalties, threshold: penaltyThreshold, flagged: penalties.length };
    },
    snapshot() {
      return resourceManager.metrics();
    }
  };
}
