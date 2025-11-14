import { randomUUID } from 'node:crypto';
import { getConfig } from '../config/env.js';
import { recordAlphaWorkUnitSegment } from '../telemetry/monitoring.js';
import {
  calculateQualityMultiplier,
  computeAlphaWorkUnits,
  normalizeAlphaWorkUnitSegment,
  roundTo
} from '../constants/workUnits.js';

const ALPHA_DECIMALS = 2;
const GPU_MINUTE_DECIMALS = 4;
const QUALITY_DECIMALS = 4;

const state = {
  activeSegments: new Map(),
  jobTotals: new Map(),
  jobSegments: new Map(),
  epochBuckets: new Map(),
  totalAlphaWU: 0
};

function roundAlpha(value) {
  return roundTo(value, ALPHA_DECIMALS);
}

function roundGpuMinutes(value) {
  return roundTo(value, GPU_MINUTE_DECIMALS);
}

function roundQuality(value) {
  return roundTo(value, QUALITY_DECIMALS);
}

function addRounded(base, delta, decimals = ALPHA_DECIMALS) {
  const baseNumeric = Number(base) || 0;
  const deltaNumeric = Number(delta) || 0;
  return roundTo(baseNumeric + deltaNumeric, decimals);
}

function cloneSegmentForExport(segment) {
  if (!segment) {
    return null;
  }
  return {
    segmentId: segment.segmentId,
    jobId: segment.jobId,
    modelClass: segment.modelClass ?? null,
    slaProfile: segment.slaProfile ?? null,
    providerLabel: segment.deviceInfo?.providerLabel ?? null,
    deviceClass: segment.deviceInfo?.deviceClass ?? null,
    vramTier: segment.deviceInfo?.vramTier ?? null,
    gpuCount: segment.deviceInfo?.gpuCount ?? null,
    startedAt: segment.startedAt,
    endedAt: segment.endedAt,
    gpuMinutes: roundGpuMinutes(segment.gpuMinutes),
    qualityMultiplier: roundQuality(segment.qualityMultiplier),
    alphaWU: roundAlpha(segment.alphaWU)
  };
}

function normaliseJobKey(jobId) {
  if (jobId === undefined || jobId === null) {
    return null;
  }
  if (typeof jobId === 'string') {
    const trimmed = jobId.trim();
    return trimmed ? trimmed.toLowerCase() : null;
  }
  if (typeof jobId === 'bigint') {
    return jobId.toString();
  }
  return String(jobId).toLowerCase();
}

function upsertJobSegment(segment) {
  const key = normaliseJobKey(segment.jobId);
  if (!key) {
    return;
  }
  if (!state.jobSegments.has(key)) {
    state.jobSegments.set(key, []);
  }
  state.jobSegments.get(key).push(
    cloneSegmentForExport(segment)
  );
}

function normaliseBreakdownMap(entries = {}) {
  return Object.fromEntries(
    Object.entries(entries)
      .map(([label, value]) => [label, Number(value ?? 0)])
      .sort(([a], [b]) => a.localeCompare(b))
  );
}

function buildBreakdown(segments, property) {
  const result = new Map();
  for (const segment of segments) {
    const label = segment?.[property] ?? 'UNKNOWN';
    const current = result.get(label) ?? 0;
    result.set(label, current + Number(segment?.alphaWU ?? 0));
  }
  return Object.fromEntries(
    Array.from(result.entries()).sort(([a], [b]) => a.localeCompare(b))
  );
}

function cloneSegments(segments = []) {
  return segments.map((segment) => ({
    ...segment,
    alphaWU: roundAlpha(segment.alphaWU ?? 0),
    gpuMinutes: roundGpuMinutes(segment.gpuMinutes ?? 0),
    qualityMultiplier: roundQuality(segment.qualityMultiplier ?? 0),
    gpuCount: segment.gpuCount ?? null
  }));
}

function buildJobAlphaSummary(jobId) {
  const key = normaliseJobKey(jobId);
  if (!key || !state.jobSegments.has(key)) {
    return {
      total: Number(getJobAlphaWU(jobId)),
      bySegment: [],
      modelClassBreakdown: {},
      slaBreakdown: {}
    };
  }
  const segments = state.jobSegments.get(key);
  const bySegment = cloneSegments(segments);
  return {
    total: Number(getJobAlphaWU(jobId)),
    bySegment,
    modelClassBreakdown: normaliseBreakdownMap(buildBreakdown(bySegment, 'modelClass')),
    slaBreakdown: normaliseBreakdownMap(buildBreakdown(bySegment, 'slaProfile'))
  };
}

function buildGlobalAlphaSummary() {
  const allSegments = Array.from(state.jobSegments.values()).flat();
  if (allSegments.length === 0) {
    return {
      total: 0,
      bySegment: [],
      modelClassBreakdown: {},
      slaBreakdown: {}
    };
  }
  const cloned = cloneSegments(allSegments);
  const total = cloned.reduce((acc, segment) => acc + Number(segment.alphaWU ?? 0), 0);
  return {
    total,
    bySegment: cloned,
    modelClassBreakdown: buildBreakdown(cloned, 'modelClass'),
    slaBreakdown: buildBreakdown(cloned, 'slaProfile')
  };
}

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
  map.set(key, addRounded(current, value));
}

export function startSegment({ jobId, deviceInfo = {}, modelClass = null, slaProfile = null, startedAt = Date.now() }) {
  if (!jobId) {
    throw new Error('jobId is required to start a metering segment');
  }
  const normalizedJobId = normaliseJobKey(jobId);
  if (!normalizedJobId) {
    throw new Error('jobId must be a non-empty value');
  }
  const startMs = toMillis(startedAt, Date.now());
  const epochIndex = computeEpochIndex(startMs);
  const epochId = `epoch-${epochIndex}`;
  const segmentId = randomUUID();
  const normalizedDeviceInfo = ensureDeviceInfo(deviceInfo);

  state.activeSegments.set(segmentId, {
    segmentId,
    jobId: normalizedJobId,
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
  const rawGpuMinutes = (durationMs / 60000) * record.deviceInfo.gpuCount;
  const gpuMinutes = roundGpuMinutes(rawGpuMinutes);
  const config = getConfig();
  const qualityMultiplier = roundQuality(
    calculateQualityMultiplier(
      {
        modelClass: record.modelClass,
        vramTier: record.deviceInfo.vramTier,
        slaProfile: record.slaProfile,
        deviceClass: record.deviceInfo.deviceClass
      },
      config?.WORK_UNITS ?? {}
    )
  );
  const alphaWU = roundAlpha(
    computeAlphaWorkUnits({ gpuMinutes, qualityMultiplier })
  );
  const segment = {
    ...record,
    endMs,
    endedAt: toIso(endMs),
    gpuMinutes,
    qualityMultiplier,
    alphaWU
  };

  state.activeSegments.delete(segmentId);

  const jobKey = normaliseJobKey(segment.jobId);
  let jobTotalAlphaWU = alphaWU;
  if (jobKey) {
    const existingJobTotal = state.jobTotals.get(jobKey) ?? 0;
    jobTotalAlphaWU = addRounded(existingJobTotal, alphaWU);
    state.jobTotals.set(jobKey, jobTotalAlphaWU);
  }
  state.totalAlphaWU = addRounded(state.totalAlphaWU, alphaWU);
  const nodeLabel = config?.NODE_LABEL ?? null;
  recordAlphaWorkUnitSegment({
    nodeLabel,
    deviceClass: segment.deviceInfo?.deviceClass ?? 'UNKNOWN',
    slaProfile: segment.slaProfile ?? 'UNKNOWN',
    jobId: segment.jobId,
    epochId: segment.epochId,
    alphaWU,
    jobTotalAlphaWU
  });
  upsertJobSegment(segment);

  const epochDurationSeconds = getEpochDurationSeconds();
  const epochDurationMs = Number.isFinite(epochDurationSeconds) && epochDurationSeconds > 0
    ? epochDurationSeconds * 1000
    : null;
  const totalDurationMs = Math.max(0, segment.endMs - segment.startMs);

  if (!epochDurationMs || totalDurationMs === 0) {
    const bucket = ensureBucket(segment.epochIndex, segment.epochId, segment.startedAt);
    bucket.totalAlphaWU = addRounded(bucket.totalAlphaWU, alphaWU);
    if (!bucket.startedAt || bucket.startedAt > segment.startedAt) {
      bucket.startedAt = segment.startedAt;
    }
    if (!bucket.endedAt || bucket.endedAt < segment.endedAt) {
      bucket.endedAt = segment.endedAt;
    }
    incrementMap(bucket.byJob, segment.jobId, alphaWU);
    incrementMap(bucket.byDeviceClass, segment.deviceInfo.deviceClass ?? 'UNKNOWN', alphaWU);
    incrementMap(bucket.bySlaProfile, segment.slaProfile ?? 'UNKNOWN', alphaWU);
  } else {
    let sliceStartMs = segment.startMs;
    let accumulatedAlpha = 0;
    let accumulatedGpuMinutes = 0;

    while (sliceStartMs < segment.endMs) {
      const epochIndex = computeEpochIndex(sliceStartMs);
      const epochId = `epoch-${epochIndex}`;
      const epochStartMs = epochIndex * epochDurationMs;
      const epochEndMs = epochStartMs + epochDurationMs;
      const sliceEndMs = Math.min(epochEndMs, segment.endMs);
      const sliceDurationMs = Math.max(0, sliceEndMs - sliceStartMs);

      if (sliceDurationMs === 0) {
        sliceStartMs = sliceEndMs === sliceStartMs ? sliceStartMs + 1 : sliceEndMs;
        continue;
      }

      const fraction = sliceDurationMs / totalDurationMs;

      let sliceGpuMinutes = roundGpuMinutes(gpuMinutes * fraction);
      let sliceAlphaWU = roundAlpha(alphaWU * fraction);

      if (sliceEndMs === segment.endMs) {
        sliceGpuMinutes = roundGpuMinutes(Math.max(0, gpuMinutes - accumulatedGpuMinutes));
        sliceAlphaWU = roundAlpha(Math.max(0, alphaWU - accumulatedAlpha));
      }

      const sliceStartedAtIso = toIso(sliceStartMs);
      const sliceEndedAtIso = toIso(sliceEndMs);
      const bucket = ensureBucket(epochIndex, epochId, sliceStartedAtIso);

      bucket.totalAlphaWU = addRounded(bucket.totalAlphaWU, sliceAlphaWU);
      if (!bucket.startedAt || bucket.startedAt > sliceStartedAtIso) {
        bucket.startedAt = sliceStartedAtIso;
      }
      if (!bucket.endedAt || bucket.endedAt < sliceEndedAtIso) {
        bucket.endedAt = sliceEndedAtIso;
      }

      incrementMap(bucket.byJob, segment.jobId, sliceAlphaWU);
      incrementMap(bucket.byDeviceClass, segment.deviceInfo.deviceClass ?? 'UNKNOWN', sliceAlphaWU);
      incrementMap(bucket.bySlaProfile, segment.slaProfile ?? 'UNKNOWN', sliceAlphaWU);

      accumulatedAlpha = addRounded(accumulatedAlpha, sliceAlphaWU);
      accumulatedGpuMinutes = addRounded(accumulatedGpuMinutes, sliceGpuMinutes, GPU_MINUTE_DECIMALS);
      sliceStartMs = sliceEndMs;
    }
  }

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
    qualityMultiplier,
    alphaWU
  });
}

export function getJobAlphaWU(jobId) {
  if (!jobId) {
    return 0;
  }
  const key = normaliseJobKey(jobId);
  if (!key) {
    return 0;
  }
  return state.jobTotals.get(key) ?? 0;
}

export function getJobAlphaSummary(jobId) {
  return buildJobAlphaSummary(jobId);
}

export function getLifetimeAlphaWU() {
  return Number(state.totalAlphaWU ?? 0);
}

export function getGlobalAlphaSummary() {
  const summary = buildGlobalAlphaSummary();
  summary.modelClassBreakdown = normaliseBreakdownMap(summary.modelClassBreakdown);
  summary.slaBreakdown = normaliseBreakdownMap(summary.slaBreakdown);
  return summary;
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
  state.jobSegments.clear();
  state.epochBuckets.clear();
  state.totalAlphaWU = 0;
}

export function getSegmentsSnapshot() {
  const segments = Array.from(state.jobSegments.values()).flatMap((entries) => cloneSegments(entries));
  return segments.sort((a, b) => {
    const aTime = a.startedAt ? Date.parse(a.startedAt) : 0;
    const bTime = b.startedAt ? Date.parse(b.startedAt) : 0;
    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
      return aTime - bTime;
    }
    return String(a.jobId ?? '').localeCompare(String(b.jobId ?? '')) || String(a.segmentId ?? '').localeCompare(String(b.segmentId ?? ''));
  });
}

export function __getInternalState() {
  return state;
}
