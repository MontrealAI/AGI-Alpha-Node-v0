import { describe, it, expect } from 'vitest';
import {
  ALPHA_WU,
  MODEL_CLASSES,
  VRAM_TIERS,
  SLA_PROFILES,
  MODEL_CLASS_WEIGHTS,
  VRAM_TIER_WEIGHTS,
  SLA_WEIGHTS,
  BENCHMARK_WEIGHTS,
  DEFAULT_WORK_UNIT_CONFIG,
  cloneDefaultWorkUnitConfig,
  computeAlphaWorkUnits,
  normalizeAlphaWorkUnitSegment
} from '../src/constants/workUnits.js';

describe('work unit constants', () => {
  it('exposes immutable canonical tables', () => {
    expect(ALPHA_WU).toBe(1);
    expect(Object.keys(MODEL_CLASSES)).toContain('LLM_70B');
    expect(Object.keys(VRAM_TIERS)).toContain('TIER_80');
    expect(Object.keys(SLA_PROFILES)).toContain('LOW_LATENCY_ENCLAVE');
    expect(MODEL_CLASS_WEIGHTS[MODEL_CLASSES.LLM_70B]).toBeGreaterThan(MODEL_CLASS_WEIGHTS[MODEL_CLASSES.LLM_8B]);
    expect(VRAM_TIER_WEIGHTS[VRAM_TIERS.TIER_80]).toBeGreaterThan(VRAM_TIER_WEIGHTS[VRAM_TIERS.TIER_16]);
    expect(SLA_WEIGHTS[SLA_PROFILES.LOW_LATENCY_ENCLAVE]).toBeGreaterThan(SLA_WEIGHTS[SLA_PROFILES.STANDARD]);
    expect(BENCHMARK_WEIGHTS['H100-80GB']).toBeGreaterThan(BENCHMARK_WEIGHTS['A100-80GB']);
  });

  it('computes alpha work units using gpu minutes and multiplier', () => {
    expect(computeAlphaWorkUnits({ gpuMinutes: 20, qualityMultiplier: 28.014 })).toBeCloseTo(560.28, 2);
    expect(computeAlphaWorkUnits({ gpuMinutes: '15', qualityMultiplier: '2' })).toBe(30);
  });

  it('rejects negative alpha work unit parameters', () => {
    expect(() => computeAlphaWorkUnits({ gpuMinutes: -1, qualityMultiplier: 1 })).toThrow(/non-negative/);
    expect(() => computeAlphaWorkUnits({ gpuMinutes: 10, qualityMultiplier: -0.1 })).toThrow(/non-negative/);
  });

  it('normalizes metered segments and backfills defaults', () => {
    const normalized = normalizeAlphaWorkUnitSegment({
      jobId: 'job-01',
      providerLabel: 'test-provider',
      deviceClass: 'H100-80GB',
      vramTier: VRAM_TIERS.TIER_80,
      modelClass: MODEL_CLASSES.LLM_70B,
      slaProfile: SLA_PROFILES.LOW_LATENCY_ENCLAVE,
      startedAt: '2024-01-01T00:00:00Z',
      endedAt: '2024-01-01T00:10:00Z',
      gpuMinutes: 10,
      qualityMultiplier: 3
    });

    expect(normalized).toEqual({
      jobId: 'job-01',
      providerLabel: 'test-provider',
      deviceClass: 'H100-80GB',
      vramTier: VRAM_TIERS.TIER_80,
      modelClass: MODEL_CLASSES.LLM_70B,
      slaProfile: SLA_PROFILES.LOW_LATENCY_ENCLAVE,
      startedAt: '2024-01-01T00:00:00Z',
      endedAt: '2024-01-01T00:10:00Z',
      gpuMinutes: 10,
      qualityMultiplier: 3,
      alphaWU: 30
    });

    const normalizedEmpty = normalizeAlphaWorkUnitSegment();
    expect(normalizedEmpty).toEqual({
      jobId: null,
      providerLabel: null,
      deviceClass: null,
      vramTier: null,
      modelClass: null,
      slaProfile: null,
      startedAt: null,
      endedAt: null,
      gpuMinutes: 0,
      qualityMultiplier: 1,
      alphaWU: 0
    });
  });

  it('creates isolated clones of the default configuration', () => {
    const cloneA = cloneDefaultWorkUnitConfig();
    const cloneB = cloneDefaultWorkUnitConfig();

    expect(cloneA).not.toBe(DEFAULT_WORK_UNIT_CONFIG);
    expect(cloneA.weights).not.toBe(DEFAULT_WORK_UNIT_CONFIG.weights);

    cloneA.baseUnit = 2;
    cloneA.weights.modelClass.LLM_8B = 1.5;

    expect(cloneB.baseUnit).toBe(DEFAULT_WORK_UNIT_CONFIG.baseUnit);
    expect(cloneB.weights.modelClass.LLM_8B).toBe(DEFAULT_WORK_UNIT_CONFIG.weights.modelClass.LLM_8B);
  });
});
