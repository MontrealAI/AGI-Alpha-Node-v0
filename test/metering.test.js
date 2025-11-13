import { beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';
import {
  startSegment,
  stopSegment,
  getJobAlphaWU,
  getEpochAlphaWU,
  getRecentEpochSummaries,
  resetMetering
} from '../src/services/metering.js';
import { MODEL_CLASSES, SLA_PROFILES, VRAM_TIERS } from '../src/constants/workUnits.js';

const START_TIME = new Date('2024-01-01T00:00:00Z');

describe('metering service', () => {
  beforeEach(() => {
    resetMetering();
    loadConfig({});
  });

  it('computes alpha work units using duration, device, and SLA weights', () => {
    const { segmentId, epochId } = startSegment({
      jobId: 'job-1',
      deviceInfo: { deviceClass: 'A100-80GB', vramTier: VRAM_TIERS.TIER_80, gpuCount: 2 },
      modelClass: MODEL_CLASSES.LLM_70B,
      slaProfile: SLA_PROFILES.LOW_LATENCY_ENCLAVE,
      startedAt: START_TIME
    });

    const result = stopSegment(segmentId, {
      endedAt: new Date('2024-01-01T00:10:00Z')
    });

    expect(result.gpuMinutes).toBeCloseTo(20, 4);
    expect(result.qualityMultiplier).toBeCloseTo(19.32, 2);
    expect(result.alphaWU).toBeCloseTo(386.4, 2);

    expect(getJobAlphaWU('job-1')).toBeCloseTo(386.4, 2);

    const epochTotals = getEpochAlphaWU(epochId);
    expect(epochTotals.totalAlphaWU).toBeCloseTo(386.4, 2);
    expect(epochTotals.alphaWU_by_job['job-1']).toBeCloseTo(386.4, 2);
    expect(epochTotals.alphaWU_by_deviceClass['A100-80GB']).toBeCloseTo(386.4, 2);
    expect(epochTotals.alphaWU_by_slaProfile[SLA_PROFILES.LOW_LATENCY_ENCLAVE]).toBeCloseTo(386.4, 2);
  });

  it('maintains rolling epoch summaries for downstream telemetry', () => {
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
      deviceInfo: { deviceClass: 'A100-80GB', vramTier: VRAM_TIERS.TIER_48, gpuCount: 1 },
      modelClass: MODEL_CLASSES.LLM_8B,
      slaProfile: SLA_PROFILES.STANDARD,
      startedAt: new Date(START_TIME.getTime() + 45 * 60_000)
    });
    stopSegment(second.segmentId, { endedAt: new Date(START_TIME.getTime() + 60 * 60_000) });

    const summaries = getRecentEpochSummaries({ limit: 5 });
    expect(summaries.length).toBeGreaterThan(0);
    const jobIds = new Set(
      summaries.flatMap((entry) => Object.keys(entry.alphaWU_by_job))
    );
    expect(jobIds.has('alpha')).toBe(true);
    expect(jobIds.has('beta')).toBe(true);
    summaries.forEach((entry) => {
      expect(Object.values(entry.alphaWU_by_deviceClass).every((value) => value >= 0)).toBe(true);
      expect(Object.values(entry.alphaWU_by_slaProfile).every((value) => value >= 0)).toBe(true);
    });
  });
});
