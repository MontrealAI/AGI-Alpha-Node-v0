import { beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';
import { resetMetering, startSegment, stopSegment } from '../src/services/metering.js';
import { buildEpochPayload } from '../src/services/oracleExport.js';
import { MODEL_CLASSES, SLA_PROFILES, VRAM_TIERS } from '../src/constants/workUnits.js';

const WINDOW_START = '2024-01-01T00:00:00Z';
const WINDOW_END = '2024-01-01T00:20:00Z';
const WINDOW_START_ISO = new Date(WINDOW_START).toISOString();
const WINDOW_END_ISO = new Date(WINDOW_END).toISOString();

describe('oracle epoch export', () => {
  beforeEach(() => {
    resetMetering();
    loadConfig({ NODE_LABEL: 'oracle-alpha' });
  });

  it('builds deterministic α-WU payloads with fractional overlaps', () => {
    const firstSegment = startSegment({
      jobId: 'job-1',
      deviceInfo: { providerLabel: 'oracle-alpha', deviceClass: 'A100-80GB', vramTier: VRAM_TIERS.TIER_80, gpuCount: 2 },
      modelClass: MODEL_CLASSES.LLM_8B,
      slaProfile: SLA_PROFILES.STANDARD,
      startedAt: new Date('2024-01-01T00:00:00Z')
    });
    const firstResult = stopSegment(firstSegment.segmentId, {
      endedAt: new Date('2024-01-01T00:30:00Z')
    });

    const secondSegment = startSegment({
      jobId: 'job-2',
      deviceInfo: { providerLabel: 'oracle-alpha', deviceClass: 'H100-80GB', vramTier: VRAM_TIERS.TIER_80, gpuCount: 1 },
      modelClass: MODEL_CLASSES.RESEARCH_AGENT,
      slaProfile: SLA_PROFILES.HIGH_REDUNDANCY,
      startedAt: new Date('2023-12-31T23:50:00Z')
    });
    const secondResult = stopSegment(secondSegment.segmentId, {
      endedAt: new Date('2024-01-01T00:10:00Z')
    });

    const firstFraction = (20 * 60_000) / (30 * 60_000);
    const secondFraction = (10 * 60_000) / (20 * 60_000);

    const expectedJob1Alpha = Number(firstResult.alphaWU) * firstFraction;
    const expectedJob2Alpha = Number(secondResult.alphaWU) * secondFraction;
    const expectedJob1Gpu = Number(firstResult.gpuMinutes) * firstFraction;
    const expectedJob2Gpu = Number(secondResult.gpuMinutes) * secondFraction;

    const payload = buildEpochPayload({
      epochId: 'epoch-test',
      fromTs: WINDOW_START,
      toTs: WINDOW_END
    });

    expect(payload.epochId).toBe('epoch-test');
    expect(payload.nodeLabel).toBe('oracle-alpha');
    expect(payload.window.from).toBe(WINDOW_START_ISO);
    expect(payload.window.to).toBe(WINDOW_END_ISO);

    expect(payload.totals.alphaWU).toBeCloseTo(expectedJob1Alpha + expectedJob2Alpha, 6);
    expect(payload.breakdown.byProvider['oracle-alpha'].alphaWU).toBeCloseTo(
      expectedJob1Alpha + expectedJob2Alpha,
      6
    );
    expect(payload.breakdown.byProvider['oracle-alpha'].gpuMinutes).toBeCloseTo(
      expectedJob1Gpu + expectedJob2Gpu,
      6
    );
    expect(payload.breakdown.byJob['job-1'].alphaWU).toBeCloseTo(expectedJob1Alpha, 6);
    expect(payload.breakdown.byJob['job-2'].alphaWU).toBeCloseTo(expectedJob2Alpha, 6);
    expect(payload.breakdown.byJob['job-1'].gpuMinutes).toBeCloseTo(expectedJob1Gpu, 6);
    expect(payload.breakdown.byJob['job-2'].gpuMinutes).toBeCloseTo(expectedJob2Gpu, 6);

    expect(payload.breakdown.byDeviceClass['A100-80GB']).toBeCloseTo(expectedJob1Alpha, 6);
    expect(payload.breakdown.byDeviceClass['H100-80GB']).toBeCloseTo(expectedJob2Alpha, 6);
    expect(payload.breakdown.bySlaProfile[SLA_PROFILES.STANDARD]).toBeCloseTo(expectedJob1Alpha, 6);
    expect(payload.breakdown.bySlaProfile[SLA_PROFILES.HIGH_REDUNDANCY]).toBeCloseTo(expectedJob2Alpha, 6);
  });

  it('filters segments that do not match the active node label', () => {
    const matchingSegment = startSegment({
      jobId: 'job-allow',
      deviceInfo: { providerLabel: 'oracle-alpha', deviceClass: 'A100-80GB' },
      startedAt: new Date('2024-01-01T00:00:00Z')
    });
    const matchingResult = stopSegment(matchingSegment.segmentId, {
      endedAt: new Date('2024-01-01T00:10:00Z')
    });

    const rogueSegment = startSegment({
      jobId: 'job-deny',
      deviceInfo: { providerLabel: 'rogue-node', deviceClass: 'H100-80GB' },
      startedAt: new Date('2024-01-01T00:00:00Z')
    });
    stopSegment(rogueSegment.segmentId, {
      endedAt: new Date('2024-01-01T00:10:00Z')
    });

    const payload = buildEpochPayload({
      epochId: 'epoch-filter',
      fromTs: WINDOW_START,
      toTs: WINDOW_END
    });

    expect(payload.totals.alphaWU).toBeCloseTo(Number(matchingResult.alphaWU), 6);
    expect(payload.breakdown.byProvider['oracle-alpha'].alphaWU).toBeCloseTo(
      Number(matchingResult.alphaWU),
      6
    );
    expect(payload.breakdown.byProvider).not.toHaveProperty('rogue-node');
    expect(payload.breakdown.byJob['job-allow'].alphaWU).toBeCloseTo(Number(matchingResult.alphaWU), 6);
    expect(payload.breakdown.byJob).not.toHaveProperty('job-deny');
    expect(payload.breakdown.byDeviceClass['A100-80GB']).toBeCloseTo(payload.totals.alphaWU, 6);
    expect(payload.breakdown.byDeviceClass['H100-80GB']).toBeUndefined();
  });

  it('rejects invalid windows', () => {
    expect(() => buildEpochPayload({ fromTs: null, toTs: WINDOW_END })).toThrow(/fromTs/);
    expect(() => buildEpochPayload({ fromTs: WINDOW_START, toTs: WINDOW_START })).toThrow(/greater than/);
  });
});
