import { SLA_PROFILES, VRAM_TIERS } from '../constants/workUnits.js';

const PROFILE_ALIASES = {
  STANDARD: SLA_PROFILES.STANDARD,
  LOW_LATENCY: SLA_PROFILES.LOW_LATENCY_ENCLAVE,
  LOW_LATENCY_ENCLAVE: SLA_PROFILES.LOW_LATENCY_ENCLAVE,
  HIGH_REDUNDANCY: SLA_PROFILES.HIGH_REDUNDANCY,
  TRUSTED_EXECUTION: SLA_PROFILES.TRUSTED_EXECUTION,
  TRUSTED_EXEC: SLA_PROFILES.TRUSTED_EXECUTION,
  TE: SLA_PROFILES.TRUSTED_EXECUTION
};

const VRAM_THRESHOLDS = [
  { tier: VRAM_TIERS.TIER_16, max: 20 },
  { tier: VRAM_TIERS.TIER_24, max: 40 },
  { tier: VRAM_TIERS.TIER_48, max: 64 },
  { tier: VRAM_TIERS.TIER_80, max: Infinity }
];

function normalizeProfile(value) {
  if (!value && value !== 0) {
    return null;
  }
  const stringValue = String(value).trim();
  if (!stringValue) {
    return null;
  }
  const sanitized = stringValue.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
  if (PROFILE_ALIASES[sanitized]) {
    return PROFILE_ALIASES[sanitized];
  }
  for (const profile of Object.values(SLA_PROFILES)) {
    if (sanitized === profile.toUpperCase()) {
      return profile;
    }
  }
  return null;
}

function extractProfileFromTags(tags) {
  if (!Array.isArray(tags)) {
    return null;
  }
  for (const raw of tags) {
    if (!raw && raw !== 0) continue;
    const value = String(raw).trim();
    if (!value) continue;
    const match = value.match(/sla\s*[:=]\s*([^\s]+)/i);
    if (match) {
      const normalized = normalizeProfile(match[1]);
      if (normalized) {
        return normalized;
      }
    }
    const normalized = normalizeProfile(value);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function resolveVramTier(vramGb) {
  const numeric = typeof vramGb === 'number' ? vramGb : Number.parseFloat(vramGb);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  for (const entry of VRAM_THRESHOLDS) {
    if (numeric <= entry.max) {
      return entry.tier;
    }
  }
  return VRAM_TIERS.TIER_80;
}

export function getDeviceInfo({ env = process.env } = {}) {
  const providerLabel = env.PROVIDER_LABEL ?? env.NODE_LABEL ?? env.DEVICE_LABEL ?? null;
  const deviceClass = env.GPU_MODEL ?? env.GPU_NAME ?? env.GPU_TYPE ?? null;
  const vramGbRaw = env.GPU_VRAM_GB ?? env.GPU_MEMORY_GB ?? null;
  const gpuCountRaw = env.GPU_COUNT ?? env.GPU_INSTANCES ?? env.GPU_SLOTS ?? null;

  const vramGb = Number.parseFloat(vramGbRaw);
  const gpuCount = Number.parseInt(gpuCountRaw ?? '1', 10);

  return {
    providerLabel: providerLabel ?? null,
    deviceClass: deviceClass ?? null,
    vramTier: resolveVramTier(vramGb),
    vramGb: Number.isFinite(vramGb) ? vramGb : null,
    gpuCount: Number.isFinite(gpuCount) && gpuCount > 0 ? gpuCount : 1
  };
}

export function getSlaProfile(jobConfig = {}, runtimeConfig = {}) {
  const envDefault = normalizeProfile(process.env.DEFAULT_SLA_PROFILE ?? null);
  const runtimeCandidate = normalizeProfile(runtimeConfig.slaProfile ?? runtimeConfig.sla);
  const directCandidate = normalizeProfile(jobConfig.slaProfile ?? jobConfig.sla);
  const metadataCandidate = normalizeProfile(jobConfig.metadata?.slaProfile ?? jobConfig.metadata?.sla);
  const tagCandidate = extractProfileFromTags(jobConfig.tags ?? runtimeConfig.tags ?? []);

  return (
    directCandidate ??
    metadataCandidate ??
    runtimeCandidate ??
    tagCandidate ??
    envDefault ??
    SLA_PROFILES.STANDARD
  );
}

export function __test__resolveVramTier(value) {
  return resolveVramTier(value);
}
