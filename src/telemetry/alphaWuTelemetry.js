import { createHash } from 'node:crypto';

const DEFAULT_HASH_ALGO = process.env.TELEMETRY_HASH_ALGO || 'sha256';
const ENABLED = process.env.TELEMETRY_ENABLED !== 'false';

function normalizeJobId(jobId) {
  if (!jobId && jobId !== 0) {
    return null;
  }
  if (typeof jobId === 'string') {
    const trimmed = jobId.trim();
    return trimmed.length ? trimmed.toLowerCase() : null;
  }
  if (typeof jobId === 'object' && jobId !== null && typeof jobId.toString === 'function') {
    return normalizeJobId(jobId.toString());
  }
  return String(jobId).toLowerCase();
}

function canonicalize(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (typeof value === 'object') {
    return Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .reduce((acc, key) => {
        const val = value[key];
        if (val === undefined) {
          return acc;
        }
        acc[key] = canonicalize(val);
        return acc;
      }, {});
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Cannot hash non-finite number in telemetry payload');
    }
    return value;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

export function hashTelemetryPayload(payload, algorithm = DEFAULT_HASH_ALGO) {
  const canonical = JSON.stringify(canonicalize(payload ?? null));
  return `0x${createHash(algorithm).update(canonical).digest('hex')}`;
}

function sanitizeModelRuntime(modelRuntime = {}) {
  const name = String(modelRuntime?.name ?? 'unknown').trim() || 'unknown';
  const version = String(modelRuntime?.version ?? 'v0').trim() || 'v0';
  const runtimeType = String(modelRuntime?.runtime_type ?? modelRuntime?.runtimeType ?? 'container')
    .trim()
    .toLowerCase() || 'container';
  return {
    name,
    version,
    runtime_type: runtimeType
  };
}

export function deriveModelRuntimeFromJob(job = {}) {
  const tags = Array.isArray(job.tags) ? job.tags.map((tag) => String(tag)) : [];
  const tagMap = tags.reduce((acc, raw) => {
    const [key, ...rest] = raw.split(':');
    if (!key || !rest.length) {
      return acc;
    }
    acc[key.trim().toLowerCase()] = rest.join(':').trim();
    return acc;
  }, {});
  const name = tagMap.model ?? job.modelClass ?? job.model ?? 'unknown';
  const version = tagMap.version ?? tagMap['model-version'] ?? job.modelVersion ?? 'v0';
  const runtime = tagMap.runtime ?? tagMap['runtime-type'] ?? job.runtime ?? 'container';
  return sanitizeModelRuntime({ name, version, runtime_type: runtime });
}

export function createAlphaWuTelemetry({
  enabled = ENABLED,
  hashAlgorithm = DEFAULT_HASH_ALGO,
  nodeEnsName = process.env.NODE_ENS_NAME || process.env.NODE_LABEL || null,
  attestorAddress = process.env.OPERATOR_ADDRESS || null,
  clock = () => Date.now(),
  cpuUsage = (start) => process.cpuUsage(start),
  logger = null
} = {}) {
  const contexts = new Map();

  function beginContext({ jobId, job = {}, role = 'executor', modelRuntime = null, inputs = null } = {}) {
    if (!enabled) return null;
    const normalizedJobId = normalizeJobId(jobId);
    if (!normalizedJobId) {
      return null;
    }
    const now = clock();
    const context = {
      jobId: normalizedJobId,
      role,
      modelRuntime: sanitizeModelRuntime(modelRuntime ?? deriveModelRuntimeFromJob(job)),
      inputsHash: hashTelemetryPayload(inputs ?? job ?? { jobId: normalizedJobId }, hashAlgorithm),
      startedAtMs: now,
      cpuStart: cpuUsage(),
      wuId: null,
      alphaWuWeight: null,
      wallClockMs: null,
      gpuSec: null,
      energyKwh: null
    };
    contexts.set(normalizedJobId, context);
    return context;
  }

  function recordSegment(jobId, segment = {}) {
    if (!enabled) return null;
    const normalizedJobId = normalizeJobId(jobId);
    if (!normalizedJobId) return null;
    const context = contexts.get(normalizedJobId);
    if (!context) return null;
    if (segment.segmentId) {
      context.wuId = segment.segmentId;
    }
    if (segment.alphaWU !== undefined) {
      context.alphaWuWeight = Number(segment.alphaWU);
    }
    if (segment.startedAt && segment.endedAt) {
      const start = Date.parse(segment.startedAt);
      const end = Date.parse(segment.endedAt);
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
        context.wallClockMs = end - start;
      }
    }
    if (segment.gpuMinutes !== undefined && Number.isFinite(Number(segment.gpuMinutes))) {
      context.gpuSec = Number(segment.gpuMinutes) * 60;
    }
    if (segment.energyKwh !== undefined && Number.isFinite(Number(segment.energyKwh))) {
      context.energyKwh = Number(segment.energyKwh);
    }
    return context;
  }

  function finalize(jobId, { outputs = {}, alphaWuWeight = null, modelRuntime = null, energyKwh = null } = {}) {
    if (!enabled) {
      return null;
    }
    const normalizedJobId = normalizeJobId(jobId);
    if (!normalizedJobId) return null;
    const context = contexts.get(normalizedJobId);
    if (!context) {
      logger?.warn?.({ jobId: normalizedJobId }, 'Attempted to finalize missing α-WU context');
      return null;
    }
    const now = clock();
    const cpuDelta = cpuUsage(context.cpuStart);
    const cpuSec = Number(((cpuDelta.user + cpuDelta.system) / 1_000_000).toFixed(6));
    const wallClockMs = Number.isFinite(context.wallClockMs)
      ? Math.round(context.wallClockMs)
      : Math.max(0, Math.round(now - context.startedAtMs));
    const finalAlphaWuWeight = Number.isFinite(Number(alphaWuWeight))
      ? Number(alphaWuWeight)
      : Number(context.alphaWuWeight ?? 0);
    const finalModelRuntime = sanitizeModelRuntime(modelRuntime ?? context.modelRuntime);
    const finalEnergy = energyKwh ?? context.energyKwh;
    const alphaWu = {
      job_id: normalizedJobId,
      wu_id: context.wuId ?? `${normalizedJobId}:${now}`,
      role: context.role ?? 'executor',
      alpha_wu_weight: finalAlphaWuWeight,
      model_runtime: finalModelRuntime,
      inputs_hash: context.inputsHash,
      outputs_hash: hashTelemetryPayload(outputs, hashAlgorithm),
      wall_clock_ms: wallClockMs,
      cpu_sec: cpuSec >= 0 ? cpuSec : 0,
      gpu_sec: context.gpuSec !== null ? Number(context.gpuSec) : null,
      energy_kwh: finalEnergy !== null ? Number(finalEnergy) : null,
      node_ens_name: nodeEnsName,
      attestor_address: attestorAddress,
      attestor_sig: null,
      created_at: new Date(now).toISOString()
    };
    contexts.delete(normalizedJobId);
    return alphaWu;
  }

  function getContext(jobId) {
    const normalizedJobId = normalizeJobId(jobId);
    if (!normalizedJobId) return null;
    return contexts.get(normalizedJobId) ?? null;
  }

  function clear() {
    contexts.clear();
  }

  return {
    beginContext,
    recordSegment,
    finalize,
    getContext,
    clear,
    isEnabled: () => enabled
  };
}
