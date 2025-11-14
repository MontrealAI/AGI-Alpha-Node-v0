import { createHash } from 'node:crypto';
import { getConfig } from '../config/env.js';
import { getSegmentsSnapshot } from './metering.js';

function parseTimestamp(input, label) {
  if (input === undefined || input === null) {
    throw new Error(`${label} must be provided`);
  }
  if (input instanceof Date) {
    const value = input.getTime();
    if (!Number.isFinite(value)) {
      throw new Error(`${label} must be a finite timestamp`);
    }
    return value;
  }
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      throw new Error(`${label} must be a finite number`);
    }
    return input;
  }
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) {
      throw new Error(`${label} must be a non-empty string`);
    }
    const parsed = Date.parse(trimmed);
    if (Number.isNaN(parsed)) {
      throw new Error(`Unable to parse ${label} value "${input}"`);
    }
    return parsed;
  }
  throw new Error(`${label} must be a Date, number, or ISO string`);
}

function toIso(ms) {
  return new Date(ms).toISOString();
}

function resolveNodeLabel() {
  try {
    const config = getConfig();
    if (config?.NODE_LABEL) {
      return String(config.NODE_LABEL);
    }
    if (config?.PROVIDER_LABEL) {
      return String(config.PROVIDER_LABEL);
    }
  } catch {
    // ignored
  }
  return 'unknown-node';
}

function resolveEpochId(provided, fromMs, toMs, nodeLabel) {
  if (provided) {
    return String(provided);
  }
  const hash = createHash('sha256')
    .update(`${nodeLabel}|${fromMs}|${toMs}`)
    .digest('hex')
    .slice(0, 16);
  return `epoch-${hash}`;
}

function accumulate(map, key, alphaWU, gpuMinutes) {
  const current = map.get(key) ?? { alphaWU: 0, gpuMinutes: 0 };
  current.alphaWU += alphaWU;
  if (typeof gpuMinutes === 'number') {
    current.gpuMinutes += gpuMinutes;
  }
  map.set(key, current);
}

function accumulateScalar(map, key, value) {
  const current = map.get(key) ?? 0;
  map.set(key, current + value);
}

function toSortedObject(map, mapper = (value) => value) {
  return Object.fromEntries(
    Array.from(map.entries())
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .map(([key, value]) => [key, mapper(value)])
  );
}

function sanitizeNumber(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number.parseFloat(value.toFixed(8));
}

function normaliseLabel(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed.toLowerCase() : null;
  }
  const stringified = String(value).trim();
  return stringified ? stringified.toLowerCase() : null;
}

export function buildEpochPayload({ epochId = null, fromTs, toTs } = {}) {
  const fromMs = parseTimestamp(fromTs, 'fromTs');
  const toMs = parseTimestamp(toTs, 'toTs');
  if (toMs <= fromMs) {
    throw new Error('toTs must be greater than fromTs');
  }

  const nodeLabel = resolveNodeLabel();
  const normalizedNodeLabel = normaliseLabel(nodeLabel);
  const snapshot = getSegmentsSnapshot();

  let totalAlpha = 0;
  const jobTotals = new Map();
  const deviceTotals = new Map();
  const slaTotals = new Map();

  for (const segment of snapshot) {
    const normalizedProviderLabel = normaliseLabel(
      segment?.providerLabel ?? segment?.deviceInfo?.providerLabel ?? null
    );
    if (!normalizedProviderLabel || normalizedProviderLabel !== normalizedNodeLabel) {
      continue;
    }

    const startMs = segment.startedAt ? Date.parse(segment.startedAt) : null;
    const endMs = segment.endedAt ? Date.parse(segment.endedAt) : startMs;
    if (startMs === null || Number.isNaN(startMs) || endMs === null || Number.isNaN(endMs)) {
      continue;
    }

    const normalizedEndMs = endMs ?? startMs;
    const durationMs = Math.max(0, (normalizedEndMs ?? 0) - (startMs ?? 0));

    const overlapStart = Math.max(fromMs, startMs ?? fromMs);
    const overlapEnd = Math.min(toMs, normalizedEndMs ?? toMs);

    let fraction = 0;
    if (durationMs === 0) {
      if (startMs >= fromMs && startMs < toMs) {
        fraction = 1;
      }
    } else {
      const overlap = Math.max(0, overlapEnd - overlapStart);
      if (overlap > 0) {
        fraction = overlap / durationMs;
      }
    }

    if (fraction <= 0) {
      continue;
    }

    const segmentAlpha = Number(segment.alphaWU ?? 0) * fraction;
    const segmentGpu = Number(segment.gpuMinutes ?? 0) * fraction;

    totalAlpha += segmentAlpha;

    const jobKey = segment.jobId ?? 'UNKNOWN';
    accumulate(jobTotals, jobKey, segmentAlpha, segmentGpu);

    const deviceKey = segment.deviceClass ?? 'UNKNOWN';
    accumulateScalar(deviceTotals, deviceKey, segmentAlpha);

    const slaKey = segment.slaProfile ?? 'UNKNOWN';
    accumulateScalar(slaTotals, slaKey, segmentAlpha);
  }

  const jobBreakdown = Object.fromEntries(
    Array.from(jobTotals.entries())
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .map(([jobId, metrics]) => [jobId, {
        alphaWU: sanitizeNumber(metrics.alphaWU),
        gpuMinutes: sanitizeNumber(metrics.gpuMinutes)
      }])
  );

  const deviceBreakdown = toSortedObject(deviceTotals, (value) => sanitizeNumber(value));
  const slaBreakdown = toSortedObject(slaTotals, (value) => sanitizeNumber(value));

  return {
    epochId: resolveEpochId(epochId, fromMs, toMs, nodeLabel),
    nodeLabel,
    window: {
      from: toIso(fromMs),
      to: toIso(toMs)
    },
    totals: {
      alphaWU: sanitizeNumber(totalAlpha)
    },
    breakdown: {
      byJob: jobBreakdown,
      byDeviceClass: deviceBreakdown,
      bySlaProfile: slaBreakdown
    }
  };
}

export default {
  buildEpochPayload
};
