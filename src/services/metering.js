import { randomUUID } from 'node:crypto';
import { getConfig } from '../config/env.js';
import {
  calculateQualityMultiplier,
  computeAlphaWorkUnits,
  normalizeAlphaWorkUnitSegment
} from '../constants/workUnits.js';

const state = {
  activeSegments: new Map(),
  jobTotals: new Map(),
  epochBuckets: new Map()
};

function toMillis(value, fallback = Date.now()) {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Timestamp must be finite');
    }
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
      throw new Error(`Unable to parse timestamp string: ${value}`);
    }
    return parsed;
  }
  return fallback;
}

function ensureDeviceInfo(deviceInfo = {}) {
  const gpuCountRaw = deviceInfo.gpuCount ?? 1;
  const gpuCount = Number.isFinite(Number(gpuCountRaw)) && Number(gpuCountRaw) > 0 ? Number(gpuCountRaw) : 1;
  return {
    providerLabel: deviceInfo.providerLabel ?? null,
    deviceClass: deviceInfo.deviceClass ?? null,
    vramTier: deviceInfo.vramTier ?? null,
    gpuCount
  };
}

function getEpochDurationSeconds() {
  try {
    const config = getConfig();
    return Number(config?.WORK_UNITS?.epochDurationSeconds ?? 900);
  } catch {
    return 900;
  }
}

function computeEpochIndex(timestampMs) {
  const duration = getEpochDurationSeconds();
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }
  return Math.floor(timestampMs / (duration * 1000));
}

function ensureBucket(epochIndex, epochId, startedAtIso) {
  if (!state.epochBuckets.has(epochIndex)) {
    state.epochBuckets.set(epochIndex, {
      epochIndex,
      epochId,
      totalAlphaWU: 0,
      startedAt: startedAtIso,
      endedAt: null,
      byJob: new Map(),
      byDeviceClass: new Map(),
      bySlaProfile: new Map()
    });
  }
  return state.epochBuckets.get(epochIndex);
}

function toIso(ms) {
  return new Date(ms).toISOString();
}

function incrementMap(map, key, value) {
  const current = map.get(key) ?? 0;
  map.set(key, current + value);
}

export function startSegment({ jobId, deviceInfo = {}, modelClass = null, slaProfile = null, startedAt = Date.now() }) {
  if (!jobId) {
    throw new Error('jobId is required to start a metering segment');
  }
  const startMs = toMillis(startedAt, Date.now());
  const epochIndex = computeEpochIndex(startMs);
  const epochId = `epoch-${epochIndex}`;
  const segmentId = randomUUID();
  const normalizedDeviceInfo = ensureDeviceInfo(deviceInfo);

  state.activeSegments.set(segmentId, {
    segmentId,
    jobId,
    modelClass,
    slaProfile,
    deviceInfo: normalizedDeviceInfo,
    startMs,
    startedAt: toIso(startMs),
    epochIndex,
    epochId
  });

  return { segmentId, startedAt: toIso(startMs), epochId };
}

export function stopSegment(segmentId, { endedAt = Date.now() } = {}) {
  if (!segmentId) {
    throw new Error('segmentId is required to stop a metering segment');
  }
  const record = state.activeSegments.get(segmentId);
  if (!record) {
    throw new Error(`Unknown segment: ${segmentId}`);
  }
  const endMs = Math.max(toMillis(endedAt, Date.now()), record.startMs);
  const durationMs = Math.max(0, endMs - record.startMs);
  const gpuMinutes = (durationMs / 60000) * record.deviceInfo.gpuCount;
  const config = getConfig();
  const qualityMultiplier = calculateQualityMultiplier(
    {
      modelClass: record.modelClass,
      vramTier: record.deviceInfo.vramTier,
      slaProfile: record.slaProfile,
      deviceClass: record.deviceInfo.deviceClass
    },
    config?.WORK_UNITS ?? {}
  );
  const alphaWU = computeAlphaWorkUnits({ gpuMinutes, qualityMultiplier });
  const segment = {
    ...record,
    endMs,
    endedAt: toIso(endMs),
    gpuMinutes,
    qualityMultiplier,
    alphaWU
  };

  state.activeSegments.delete(segmentId);

  const existingJobTotal = state.jobTotals.get(segment.jobId) ?? 0;
  state.jobTotals.set(segment.jobId, existingJobTotal + alphaWU);

  const bucket = ensureBucket(segment.epochIndex, segment.epochId, segment.startedAt);
  bucket.totalAlphaWU += alphaWU;
  bucket.endedAt = segment.endedAt;
  if (!bucket.startedAt || bucket.startedAt > segment.startedAt) {
    bucket.startedAt = segment.startedAt;
  }
  incrementMap(bucket.byJob, segment.jobId, alphaWU);
  incrementMap(bucket.byDeviceClass, segment.deviceInfo.deviceClass ?? 'UNKNOWN', alphaWU);
  incrementMap(bucket.bySlaProfile, segment.slaProfile ?? 'UNKNOWN', alphaWU);

  return normalizeAlphaWorkUnitSegment({
    jobId: segment.jobId,
    providerLabel: segment.deviceInfo.providerLabel,
    deviceClass: segment.deviceInfo.deviceClass,
    vramTier: segment.deviceInfo.vramTier,
    modelClass: segment.modelClass,
    slaProfile: segment.slaProfile,
    startedAt: segment.startedAt,
    endedAt: segment.endedAt,
    gpuMinutes,
    qualityMultiplier
  });
}

export function getJobAlphaWU(jobId) {
  if (!jobId) {
    return 0;
  }
  return state.jobTotals.get(jobId) ?? 0;
}

function resolveEpochIndex(epochId) {
  if (epochId === null || epochId === undefined) {
    return null;
  }
  if (typeof epochId === 'number' && Number.isInteger(epochId)) {
    return epochId;
  }
  const stringValue = String(epochId).trim();
  if (!stringValue) {
    return null;
  }
  if (/^\d+$/.test(stringValue)) {
    return Number(stringValue);
  }
  const match = stringValue.match(/epoch[-_:]?([0-9]+)/i);
  if (match) {
    return Number(match[1]);
  }
  return null;
}

function mapToObject(map) {
  return Object.fromEntries(Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)));
}

export function getEpochAlphaWU(epochId) {
  const index = resolveEpochIndex(epochId);
  if (index === null) {
    return {
      epochId,
      totalAlphaWU: 0,
      alphaWU_by_job: {},
      alphaWU_by_deviceClass: {},
      alphaWU_by_slaProfile: {},
      startedAt: null,
      endedAt: null
    };
  }
  const bucket = state.epochBuckets.get(index);
  if (!bucket) {
    return {
      epochId: typeof epochId === 'string' ? epochId : `epoch-${index}`,
      totalAlphaWU: 0,
      alphaWU_by_job: {},
      alphaWU_by_deviceClass: {},
      alphaWU_by_slaProfile: {},
      startedAt: null,
      endedAt: null
    };
  }
  return {
    epochId: bucket.epochId,
    totalAlphaWU: bucket.totalAlphaWU,
    alphaWU_by_job: mapToObject(bucket.byJob),
    alphaWU_by_deviceClass: mapToObject(bucket.byDeviceClass),
    alphaWU_by_slaProfile: mapToObject(bucket.bySlaProfile),
    startedAt: bucket.startedAt,
    endedAt: bucket.endedAt
  };
}

export function getRecentEpochSummaries({ limit = 12 } = {}) {
  const sorted = Array.from(state.epochBuckets.values()).sort(
    (a, b) => b.epochIndex - a.epochIndex
  );
  return sorted
    .slice(0, limit)
    .map((bucket) => ({
      epochId: bucket.epochId,
      totalAlphaWU: bucket.totalAlphaWU,
      startedAt: bucket.startedAt,
      endedAt: bucket.endedAt,
      alphaWU_by_job: mapToObject(bucket.byJob),
      alphaWU_by_deviceClass: mapToObject(bucket.byDeviceClass),
      alphaWU_by_slaProfile: mapToObject(bucket.bySlaProfile)
    }));
}

export function resetMetering() {
  state.activeSegments.clear();
  state.jobTotals.clear();
  state.epochBuckets.clear();
}

export function __getInternalState() {
  return state;
}
