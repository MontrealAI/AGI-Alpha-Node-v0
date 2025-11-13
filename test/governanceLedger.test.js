import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { zeroPadValue, keccak256, toUtf8Bytes } from 'ethers';
import { recordGovernanceAction } from '../src/services/governanceLedger.js';
import { resetMetering, startSegment, stopSegment } from '../src/services/metering.js';
import { MODEL_CLASSES, SLA_PROFILES } from '../src/constants/workUnits.js';

let tempDir;

describe('governance ledger α-WU enrichment', () => {
  beforeEach(() => {
    resetMetering();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-alpha-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('persists job-scoped α-WU summaries for submission payloads', () => {
    const jobLabel = 'ledger-job-1';
    const normalizedJobId = zeroPadValue(keccak256(toUtf8Bytes(jobLabel)), 32);
    const { segmentId } = startSegment({
      jobId: normalizedJobId,
      deviceInfo: { deviceClass: 'A100-80GB', vramTier: 'TIER_80', gpuCount: 1 },
      modelClass: MODEL_CLASSES.LLM_8B,
      slaProfile: SLA_PROFILES.STANDARD,
      startedAt: new Date('2024-03-01T00:00:00Z')
    });
    stopSegment(segmentId, { endedAt: new Date('2024-03-01T00:20:00Z') });

    const { filePath } = recordGovernanceAction({
      payload: { to: '0x0000000000000000000000000000000000000000', data: '0x' },
      meta: {
        contract: 'JobRegistry',
        method: 'submitJob',
        to: '0x0000000000000000000000000000000000000000',
        description: 'Submit finalized workload',
        args: { jobId: normalizedJobId }
      },
      rootDir: tempDir
    });

    const stored = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(stored.meta.alphaWU.total).toBeGreaterThan(0);
    expect(Object.keys(stored.meta.alphaWU.modelClassBreakdown)).toContain(MODEL_CLASSES.LLM_8B);
    expect(Object.values(stored.meta.alphaWU.slaBreakdown).reduce((acc, value) => acc + Number(value), 0)).toBeGreaterThan(0);
    expect(Object.keys(stored.meta.alphaWU.breakdown.modelClass)).toContain(MODEL_CLASSES.LLM_8B);
    expect(Object.keys(stored.meta.alphaWU.quality.modelClass)).toContain(MODEL_CLASSES.LLM_8B);
    expect(Object.keys(stored.meta.alphaWU.quality.sla)).toContain(SLA_PROFILES.STANDARD);
  });

  it('falls back to global α-WU aggregates when no jobId is provided', () => {
    const { segmentId } = startSegment({
      jobId: zeroPadValue('0x' + 'aa'.repeat(32), 32),
      deviceInfo: { deviceClass: 'H100-80GB', vramTier: 'TIER_80', gpuCount: 2 },
      modelClass: MODEL_CLASSES.RESEARCH_AGENT,
      slaProfile: SLA_PROFILES.HIGH_REDUNDANCY,
      startedAt: new Date('2024-03-02T00:00:00Z')
    });
    stopSegment(segmentId, { endedAt: new Date('2024-03-02T00:10:00Z') });

    const { filePath } = recordGovernanceAction({
      payload: { to: '0x0000000000000000000000000000000000000000', data: '0x' },
      meta: {
        contract: 'StakeManager',
        method: 'stakeAdjustment',
        to: '0x0000000000000000000000000000000000000000',
        description: 'Adjust stake weights',
        args: { amount: '1000' }
      },
      rootDir: tempDir
    });

    const stored = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(stored.meta.alphaWU.total).toBeGreaterThan(0);
    expect(Object.keys(stored.meta.alphaWU.modelClassBreakdown).length).toBeGreaterThan(0);
    expect(Object.keys(stored.meta.alphaWU.slaBreakdown).length).toBeGreaterThan(0);
    expect(Object.keys(stored.meta.alphaWU.breakdown.modelClass).length).toBeGreaterThan(0);
    expect(Object.keys(stored.meta.alphaWU.quality.modelClass).length).toBeGreaterThan(0);
    expect(Object.keys(stored.meta.alphaWU.quality.sla).length).toBeGreaterThan(0);
  });
});
