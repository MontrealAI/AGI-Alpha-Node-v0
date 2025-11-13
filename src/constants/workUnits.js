const freeze = Object.freeze;

export const ALPHA_WU = 1;

export const MODEL_CLASSES = freeze({
  LLM_8B: 'LLM_8B',
  LLM_70B: 'LLM_70B',
  DIFFUSION_XL: 'DIFFUSION_XL',
  MULTIMODAL_ROUTER: 'MULTIMODAL_ROUTER',
  RESEARCH_AGENT: 'RESEARCH_AGENT'
});

export const VRAM_TIERS = freeze({
  TIER_16: 'TIER_16',
  TIER_24: 'TIER_24',
  TIER_48: 'TIER_48',
  TIER_80: 'TIER_80'
});

export const SLA_PROFILES = freeze({
  STANDARD: 'STANDARD',
  LOW_LATENCY_ENCLAVE: 'LOW_LATENCY_ENCLAVE',
  HIGH_REDUNDANCY: 'HIGH_REDUNDANCY',
  TRUSTED_EXECUTION: 'TRUSTED_EXECUTION'
});

export const MODEL_CLASS_WEIGHTS = freeze({
  [MODEL_CLASSES.LLM_8B]: 1.0,
  [MODEL_CLASSES.LLM_70B]: 4.2,
  [MODEL_CLASSES.DIFFUSION_XL]: 1.8,
  [MODEL_CLASSES.MULTIMODAL_ROUTER]: 2.6,
  [MODEL_CLASSES.RESEARCH_AGENT]: 2.1
});

export const VRAM_TIER_WEIGHTS = freeze({
  [VRAM_TIERS.TIER_16]: 1.0,
  [VRAM_TIERS.TIER_24]: 1.35,
  [VRAM_TIERS.TIER_48]: 1.85,
  [VRAM_TIERS.TIER_80]: 2.3
});

export const SLA_WEIGHTS = freeze({
  [SLA_PROFILES.STANDARD]: 1.0,
  [SLA_PROFILES.LOW_LATENCY_ENCLAVE]: 2.0,
  [SLA_PROFILES.HIGH_REDUNDANCY]: 1.7,
  [SLA_PROFILES.TRUSTED_EXECUTION]: 2.4
});

export const BENCHMARK_WEIGHTS = freeze({
  'A100-80GB': 1.0,
  'H100-80GB': 1.45,
  'MI300X-192GB': 1.55
});

export const DEFAULT_WORK_UNIT_CONFIG = freeze({
  baseUnit: ALPHA_WU,
  weights: freeze({
    modelClass: MODEL_CLASS_WEIGHTS,
    vramTier: VRAM_TIER_WEIGHTS,
    slaProfile: SLA_WEIGHTS,
    benchmark: BENCHMARK_WEIGHTS
  }),
  epochDurationSeconds: 900
});

export function cloneDefaultWorkUnitConfig() {
  return {
    baseUnit: DEFAULT_WORK_UNIT_CONFIG.baseUnit,
    weights: {
      modelClass: { ...MODEL_CLASS_WEIGHTS },
      vramTier: { ...VRAM_TIER_WEIGHTS },
      slaProfile: { ...SLA_WEIGHTS },
      benchmark: { ...BENCHMARK_WEIGHTS }
    },
    epochDurationSeconds: DEFAULT_WORK_UNIT_CONFIG.epochDurationSeconds
  };
}

function resolveWeightTable(candidate, fallback) {
  if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
    return candidate;
  }
  return fallback;
}

function safeLookup(weightTable, key, dimension) {
  if (!key) {
    return 1;
  }
  if (!weightTable || typeof weightTable !== 'object') {
    return 1;
  }
  if (!(key in weightTable)) {
    return 1;
  }
  const raw = weightTable[key];
  const numeric = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(numeric)) {
    throw new Error(`work unit weight ${dimension}.${key} must be finite`);
  }
  if (numeric < 0) {
    throw new Error(`work unit weight ${dimension}.${key} cannot be negative`);
  }
  return numeric;
}

export function calculateQualityMultiplier(segment = {}, config = {}) {
  const {
    modelClass = null,
    vramTier = null,
    slaProfile = null,
    deviceClass = null
  } = segment;

  const candidateWeights = config && typeof config === 'object' ? config.weights : undefined;
  const modelWeights = resolveWeightTable(candidateWeights?.modelClass, MODEL_CLASS_WEIGHTS);
  const vramWeights = resolveWeightTable(candidateWeights?.vramTier, VRAM_TIER_WEIGHTS);
  const slaWeights = resolveWeightTable(candidateWeights?.slaProfile, SLA_WEIGHTS);
  const benchmarkWeights = resolveWeightTable(candidateWeights?.benchmark, BENCHMARK_WEIGHTS);

  const components = [
    safeLookup(modelWeights, modelClass, 'modelClass'),
    safeLookup(vramWeights, vramTier, 'vramTier'),
    safeLookup(slaWeights, slaProfile, 'slaProfile'),
    safeLookup(benchmarkWeights, deviceClass, 'benchmark')
  ];

  return components.reduce((product, weight) => product * weight, 1);
}

export function computeAlphaWorkUnits({ gpuMinutes = 0, qualityMultiplier = 1 }) {
  const minutes = Number(gpuMinutes) || 0;
  const multiplier = Number(qualityMultiplier) || 0;
  if (minutes < 0 || multiplier < 0) {
    throw new Error('Alpha work units require non-negative gpuMinutes and qualityMultiplier');
  }
  return minutes * multiplier;
}

export function normalizeAlphaWorkUnitSegment(segment = {}) {
  const {
    jobId,
    providerLabel,
    deviceClass,
    vramTier,
    modelClass,
    slaProfile,
    startedAt,
    endedAt,
    gpuMinutes = 0,
    qualityMultiplier = 1
  } = segment;

  return {
    jobId: jobId ?? null,
    providerLabel: providerLabel ?? null,
    deviceClass: deviceClass ?? null,
    vramTier: vramTier ?? null,
    modelClass: modelClass ?? null,
    slaProfile: slaProfile ?? null,
    startedAt: startedAt ?? null,
    endedAt: endedAt ?? null,
    gpuMinutes,
    qualityMultiplier,
    alphaWU: computeAlphaWorkUnits({ gpuMinutes, qualityMultiplier })
  };
}
