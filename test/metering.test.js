import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config/env.js';
import {
  startSegment,
  stopSegment,
  getJobAlphaWU,
  getJobAlphaSummary,
  getLifetimeAlphaWU,
  getGlobalAlphaSummary,
  getEpochAlphaWU,
  getRecentEpochSummaries,
  resetMetering
} from '../src/services/metering.js';
import {
  MODEL_CLASSES,
  MODEL_CLASS_WEIGHTS,
  VRAM_TIERS,
  VRAM_TIER_WEIGHTS,
  SLA_PROFILES,
  SLA_WEIGHTS,
  BENCHMARK_WEIGHTS,
  roundTo
} from '../src/constants/workUnits.js';
import * as monitoring from '../src/telemetry/monitoring.js';

const START_TIME = new Date('2024-01-01T00:00:00Z');

const WEIGHT_CASES = [
  {
    name: 'LLM_8B · STANDARD on A100',
    jobId: 'weights-standard',
    modelClass: MODEL_CLASSES.LLM_8B,
    vramTier: VRAM_TIERS.TIER_16,
    slaProfile: SLA_PROFILES.STANDARD,
    deviceClass: 'A100-80GB',
    gpuCount: 1,
    durationMinutes: 12.5,
    offsetMinutes: 0.5
  },
  {
    name: 'LLM_70B · LOW_LATENCY on H100',
    jobId: 'weights-low-latency',
    modelClass: MODEL_CLASSES.LLM_70B,
    vramTier: VRAM_TIERS.TIER_80,
    slaProfile: SLA_PROFILES.LOW_LATENCY_ENCLAVE,
    deviceClass: 'H100-80GB',
    gpuCount: 2,
    durationMinutes: 8.75,
    offsetMinutes: 2.25
  },
  {
    name: 'RESEARCH_AGENT · TRUSTED_EXECUTION on MI300X',
    jobId: 'weights-trusted',
    modelClass: MODEL_CLASSES.RESEARCH_AGENT,
    vramTier: VRAM_TIERS.TIER_48,
    slaProfile: SLA_PROFILES.TRUSTED_EXECUTION,
    deviceClass: 'MI300X-192GB',
    gpuCount: 3,
    durationMinutes: 6.4,
    offsetMinutes: 3.75
  }
];

describe('metering service', () => {
  beforeEach(() => {
    resetMetering();
    loadConfig({});
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('computes GPU minutes from wall clock duration and GPU count', () => {
    const { segmentId, epochId } = startSegment({
      jobId: 'gpu-minutes',
      deviceInfo: { deviceClass: 'A100-80GB', vramTier: VRAM_TIERS.TIER_16, gpuCount: 2 },
      modelClass: MODEL_CLASSES.LLM_8B,
      slaProfile: SLA_PROFILES.STANDARD,
      startedAt: START_TIME
    });

    const result = stopSegment(segmentId, {
      endedAt: new Date(START_TIME.getTime() + 15 * 60_000)
    });

    const expectedGpuMinutes = roundTo(30, 4);
    expect(result.gpuMinutes).toBeCloseTo(expectedGpuMinutes, 4);
    expect(result.alphaWU).toBeCloseTo(result.gpuMinutes * result.qualityMultiplier, 2);
    expect(getJobAlphaWU('gpu-minutes')).toBe(result.alphaWU);

    const epochTotals = getEpochAlphaWU(epochId);
    expect(epochTotals.totalAlphaWU).toBe(result.alphaWU);
    expect(epochTotals.alphaWU_by_job['gpu-minutes']).toBe(result.alphaWU);
  });

  it.each(WEIGHT_CASES)('applies work unit weights for %s', (testCase) => {
    const {
      jobId,
      name,
      modelClass,
      vramTier,
      slaProfile,
      deviceClass,
      gpuCount,
      durationMinutes,
      offsetMinutes
    } = testCase;
    const startedAt = new Date(START_TIME.getTime() + offsetMinutes * 60_000);
    const endedAt = new Date(startedAt.getTime() + durationMinutes * 60_000);

    const expectedMultiplier =
      MODEL_CLASS_WEIGHTS[modelClass] *
      VRAM_TIER_WEIGHTS[vramTier] *
      SLA_WEIGHTS[slaProfile] *
      (BENCHMARK_WEIGHTS[deviceClass] ?? 1);
    const expectedQuality = roundTo(expectedMultiplier, 4);
    const expectedGpuMinutes = roundTo(durationMinutes * gpuCount, 4);
    const expectedAlpha = roundTo(expectedGpuMinutes * expectedQuality, 2);

    const { segmentId } = startSegment({
      jobId,
      deviceInfo: { deviceClass, vramTier, gpuCount },
      modelClass,
      slaProfile,
      startedAt
    });

    const result = stopSegment(segmentId, { endedAt });

    expect(result.gpuMinutes).toBeCloseTo(expectedGpuMinutes, 4);
    expect(result.qualityMultiplier).toBeCloseTo(expectedQuality, 4);
    expect(result.alphaWU).toBe(expectedAlpha);

    const summary = getJobAlphaSummary(jobId);
    expect(summary.total).toBe(expectedAlpha);
    expect(summary.bySegment).toHaveLength(1);
    expect(summary.bySegment[0].alphaWU).toBe(expectedAlpha);
    expect(summary.bySegment[0].qualityMultiplier).toBeCloseTo(expectedQuality, 4);
    expect(summary.bySegment[0].gpuMinutes).toBeCloseTo(expectedGpuMinutes, 4);

    const label = `${name} :: alpha`; // ensure label used for debugging
    expect(label).toBeTruthy();
  });

  it('maintains rolling epoch summaries with rounded, non-negative totals', () => {
    const first = startSegment({
      jobId: 'alpha',
      deviceInfo: { deviceClass: 'H100-80GB', vramTier: VRAM_TIERS.TIER_80, gpuCount: 1 },
      modelClass: MODEL_CLASSES.RESEARCH_AGENT,
      slaProfile: SLA_PROFILES.HIGH_REDUNDANCY,
      startedAt: new Date(START_TIME.getTime() + 60_000)
    });
    stopSegment(first.segmentId, { endedAt: new Date(START_TIME.getTime() + 15 * 60_000) });

    const second = startSegment({
      jobId: 'beta',
      deviceInfo: { deviceClass: 'A100-80GB', vramTier: VRAM_TIERS.TIER_48, gpuCount: 2 },
      modelClass: MODEL_CLASSES.LLM_8B,
      slaProfile: SLA_PROFILES.STANDARD,
      startedAt: new Date(START_TIME.getTime() + 45 * 60_000)
    });
    stopSegment(second.segmentId, { endedAt: new Date(START_TIME.getTime() + 60 * 60_000) });

    const summaries = getRecentEpochSummaries({ limit: 5 });
    expect(summaries.length).toBeGreaterThan(0);
    const jobIds = new Set(summaries.flatMap((entry) => Object.keys(entry.alphaWU_by_job)));
    expect(jobIds.has('alpha')).toBe(true);
    expect(jobIds.has('beta')).toBe(true);
    summaries.forEach((entry) => {
      expect(entry.totalAlphaWU).toBe(Math.round(entry.totalAlphaWU * 100) / 100);
      expect(Object.values(entry.alphaWU_by_deviceClass).every((value) => value >= 0)).toBe(true);
      expect(Object.values(entry.alphaWU_by_slaProfile).every((value) => value >= 0)).toBe(true);
      Object.values(entry.alphaWU_by_job).forEach((value) => {
        expect(value).toBe(Math.round(value * 100) / 100);
      });
    });
  });

  it('rounds alpha work units to two decimals deterministically across exports', () => {
    const recordSpy = vi.spyOn(monitoring, 'recordAlphaWorkUnitSegment');

    const { segmentId, epochId } = startSegment({
      jobId: 'rounding-case',
      deviceInfo: { deviceClass: 'MI300X-192GB', vramTier: VRAM_TIERS.TIER_48, gpuCount: 3 },
      modelClass: MODEL_CLASSES.MULTIMODAL_ROUTER,
      slaProfile: SLA_PROFILES.HIGH_REDUNDANCY,
      startedAt: new Date(START_TIME.getTime() + 5 * 60_000)
    });

    const result = stopSegment(segmentId, {
      endedAt: new Date(START_TIME.getTime() + 5 * 60_000 + 7.5 * 60_000)
    });

    const scaledAlpha = Math.round(result.alphaWU * 100);
    expect(result.alphaWU).toBe(scaledAlpha / 100);
    expect(Number.isInteger(scaledAlpha)).toBe(true);

    const summary = getJobAlphaSummary('rounding-case');
    expect(summary.total).toBe(result.alphaWU);
    expect(summary.bySegment).toHaveLength(1);
    expect(summary.bySegment[0].alphaWU).toBe(result.alphaWU);
    expect(summary.bySegment[0].gpuMinutes).toBe(Math.round(summary.bySegment[0].gpuMinutes * 10000) / 10000);

    const lifetime = getLifetimeAlphaWU();
    expect(lifetime).toBe(result.alphaWU);

    const epochTotals = getEpochAlphaWU(epochId);
    expect(epochTotals.totalAlphaWU).toBe(result.alphaWU);
    Object.values(epochTotals.alphaWU_by_job).forEach((value) => {
      expect(value).toBe(Math.round(value * 100) / 100);
    });

    const recent = getRecentEpochSummaries({ limit: 1 });
    expect(recent[0].totalAlphaWU).toBe(result.alphaWU);

    const globalSummary = getGlobalAlphaSummary();
    expect(globalSummary.total).toBe(result.alphaWU);
    expect(globalSummary.bySegment[0].alphaWU).toBe(result.alphaWU);

    expect(recordSpy).toHaveBeenCalled();
    const lastCall = recordSpy.mock.calls[recordSpy.mock.calls.length - 1];
    expect(lastCall?.[0]?.alphaWU).toBe(result.alphaWU);
  });

  it('normalizes job identifiers and accumulates totals deterministically', () => {
    const firstStart = new Date(START_TIME.getTime() + 90 * 60_000);
    const secondStart = new Date(START_TIME.getTime() + 120 * 60_000);

    const firstSegment = startSegment({
      jobId: 'CaseSensitive',
      deviceInfo: { deviceClass: 'A100-80GB', vramTier: VRAM_TIERS.TIER_16, gpuCount: 1 },
      modelClass: MODEL_CLASSES.LLM_8B,
      slaProfile: SLA_PROFILES.STANDARD,
      startedAt: firstStart
    });
    const firstResult = stopSegment(firstSegment.segmentId, {
      endedAt: new Date(firstStart.getTime() + 9.333 * 60_000)
    });

    const secondSegment = startSegment({
      jobId: 'casesensitive  ',
      deviceInfo: { deviceClass: 'H100-80GB', vramTier: VRAM_TIERS.TIER_80, gpuCount: 2 },
      modelClass: MODEL_CLASSES.RESEARCH_AGENT,
      slaProfile: SLA_PROFILES.TRUSTED_EXECUTION,
      startedAt: secondStart
    });
    const secondResult = stopSegment(secondSegment.segmentId, {
      endedAt: new Date(secondStart.getTime() + 6.25 * 60_000)
    });

    const expectedTotal = roundTo(firstResult.alphaWU + secondResult.alphaWU, 2);

    const summary = getJobAlphaSummary('CASEsensitive');
    expect(summary.total).toBeCloseTo(expectedTotal, 2);
    expect(summary.bySegment).toHaveLength(2);

    const segmentTotal = roundTo(
      summary.bySegment.reduce((acc, segment) => acc + segment.alphaWU, 0),
      2
    );
    expect(segmentTotal).toBeCloseTo(expectedTotal, 2);

    const modelBreakdownSum = roundTo(
      Object.values(summary.modelClassBreakdown).reduce((acc, value) => acc + value, 0),
      2
    );
    expect(modelBreakdownSum).toBeCloseTo(expectedTotal, 2);

    const lifetimeAlpha = getLifetimeAlphaWU();
    expect(lifetimeAlpha).toBeCloseTo(expectedTotal, 2);

    const globalSummary = getGlobalAlphaSummary();
    expect(globalSummary.total).toBeCloseTo(expectedTotal, 2);
    expect(globalSummary.bySegment).toHaveLength(2);
    expect(Object.keys(globalSummary.modelClassBreakdown)).toEqual([
      MODEL_CLASSES.LLM_8B,
      MODEL_CLASSES.RESEARCH_AGENT
    ]);

    const epochSummaries = getRecentEpochSummaries({ limit: 5 });
    expect(epochSummaries.length).toBeGreaterThan(0);

    const epochIds = epochSummaries.map((entry) => entry.epochId);
    expect(epochIds).toContain(firstSegment.epochId);
    expect(epochIds).toContain(secondSegment.epochId);

    const aggregatedEpochAlpha = roundTo(
      epochSummaries.reduce(
        (acc, entry) => acc + (entry.alphaWU_by_job.casesensitive ?? 0),
        0
      ),
      2
    );
    expect(aggregatedEpochAlpha).toBeCloseTo(expectedTotal, 2);
  });

  it('defaults benchmark multipliers to one for unmapped devices while keeping α-WU rounding stable', () => {
    const { segmentId } = startSegment({
      jobId: 'unknown-benchmark',
      deviceInfo: { deviceClass: 'UNLISTED-GPU', vramTier: VRAM_TIERS.TIER_16, gpuCount: 1 },
      modelClass: MODEL_CLASSES.LLM_8B,
      slaProfile: SLA_PROFILES.STANDARD,
      startedAt: new Date(START_TIME.getTime() + 180 * 60_000)
    });

    const result = stopSegment(segmentId, {
      endedAt: new Date(START_TIME.getTime() + 190 * 60_000)
    });

    expect(result.qualityMultiplier).toBeCloseTo(1, 4);
    expect(result.gpuMinutes).toBeCloseTo(10, 4);
    expect(result.alphaWU).toBe(roundTo(result.gpuMinutes, 2));

    const summary = getJobAlphaSummary('unknown-benchmark');
    expect(summary.total).toBe(result.alphaWU);
    expect(summary.bySegment[0].deviceClass).toBe('UNLISTED-GPU');
    expect(summary.bySegment[0].qualityMultiplier).toBe(result.qualityMultiplier);
  });
});
