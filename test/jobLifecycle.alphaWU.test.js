import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createJobLifecycle } from '../src/services/jobLifecycle.js';
import { resolveJobProfile, createInterfaceFromProfile } from '../src/services/jobProfiles.js';
import * as metering from '../src/services/metering.js';
import * as jobProof from '../src/services/jobProof.js';
import { recordGovernanceAction } from '../src/services/governanceLedger.js';
import { loadConfig } from '../src/config/env.js';
import { MODEL_CLASSES, SLA_PROFILES, VRAM_TIERS } from '../src/constants/workUnits.js';
import { verifyAlphaWu } from '../src/crypto/signing.js';

const registryAddress = '0x00000000000000000000000000000000000000aa';
const v0Profile = resolveJobProfile('v0');
const v0Interface = createInterfaceFromProfile(v0Profile);

function buildLog(eventName, params) {
  const { data, topics } = v0Interface.encodeEventLog(eventName, params);
  return {
    address: registryAddress,
    data,
    topics,
    blockNumber: 123,
    transactionHash: '0xlog'
  };
}

function createMemoryJournal() {
  const entries = [];
  return {
    entries,
    append(entry) {
      entries.push(entry);
      return entry;
    }
  };
}

describe('job lifecycle α-WU integration', () => {
  const provider = {
    getBlockNumber: vi.fn(async () => 120),
    getLogs: vi.fn(async () => []),
    on: vi.fn(),
    off: vi.fn()
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    loadConfig({});
    metering.resetMetering();
    provider.getBlockNumber.mockResolvedValue(120);
    provider.getLogs.mockResolvedValue([]);
    provider.on.mockReset();
    provider.off.mockReset();
    process.env.NODE_PRIVATE_KEY =
      '0x59c6995e998f97a5a0044966f0945386f0b0c9cc1fa50bdbeeb29f44cbeb2c82';
  });

  afterEach(() => {
    delete process.env.NODE_PRIVATE_KEY;
  });

  it('propagates α-WU totals through lifecycle proof and governance ledger', async () => {
    const jobIdHex = '0x' + '55'.repeat(32);
    const client = '0x0000000000000000000000000000000000000001';
    const reward = 250n;
    const deadline = 1_800_000_000n;
    const uri = 'ipfs://job-alpha';
    const tags = '["alpha", "production"]';

    const jobCreatedLog = buildLog('JobCreated', [jobIdHex, client, reward, deadline, uri, tags]);
    provider.getLogs.mockResolvedValue([jobCreatedLog]);

    const applyMock = vi.fn(async () => ({ hash: '0xapply' }));
    const submitMock = vi.fn(async () => ({ hash: '0xsubmit' }));
    const finalizeMock = vi.fn(async () => ({ hash: '0xfinal' }));

    const contractFactory = vi.fn(() => ({
      target: registryAddress,
      interface: v0Interface,
      applyForJob: applyMock,
      submitProof: submitMock,
      finalize: finalizeMock,
      connect() {
        return this;
      }
    }));

    const journal = createMemoryJournal();

    const lifecycle = createJobLifecycle({
      provider,
      jobRegistryAddress: registryAddress,
      profile: 'v0',
      journal,
      contractFactory
    });

    const jobs = await lifecycle.discover();
    expect(jobs).toHaveLength(1);
    const discoveredJobId = jobs[0].jobId;

    const startSpy = vi.spyOn(metering, 'startSegment');
    const stopSpy = vi.spyOn(metering, 'stopSegment');
    const proofSpy = vi.spyOn(jobProof, 'createJobProof');

    await lifecycle.apply(discoveredJobId, { subdomain: 'node', proof: '0x1234' });

    const segmentStart = metering.startSegment({
      jobId: discoveredJobId,
      deviceInfo: { deviceClass: 'H100-80GB', vramTier: VRAM_TIERS.TIER_80, gpuCount: 2 },
      modelClass: MODEL_CLASSES.LLM_70B,
      slaProfile: SLA_PROFILES.LOW_LATENCY_ENCLAVE,
      startedAt: new Date('2024-01-01T00:00:00Z')
    });

    const segmentResult = metering.stopSegment(segmentStart.segmentId, {
      endedAt: new Date('2024-01-01T00:12:00Z')
    });

    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(segmentResult.alphaWU).toBeGreaterThan(0);

    const submission = await lifecycle.submitExecutorResult(discoveredJobId, {
      result: { ok: true },
      resultUri: 'ipfs://result'
    });

    expect(submission.commitment).toMatch(/^0x/);
    expect(submission.alphaWu).toBeTruthy();
    expect(verifyAlphaWu(submission.alphaWu)).toBe(true);
    const recorded = lifecycle.getAlphaWUsForJob(discoveredJobId);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].wu_id).toBe(submission.alphaWu.wu_id);
    expect(proofSpy).toHaveBeenCalledTimes(1);
    const proof = proofSpy.mock.results[0]?.value;
    expect(proof).toBeTruthy();
    expect(proof.alphaWU.total).toBeCloseTo(segmentResult.alphaWU, 2);
    expect(proof.alphaWU.bySegment).toHaveLength(1);
    expect(proof.alphaWU.bySegment[0].alphaWU).toBe(segmentResult.alphaWU);

    await lifecycle.finalize(discoveredJobId);

    const tempDir = mkdtempSync(path.join(tmpdir(), 'ledger-'));
    try {
      const { entry } = recordGovernanceAction({
        payload: { kind: 'job-submitted', jobId: discoveredJobId },
        meta: { method: 'submitProof', args: { jobId: discoveredJobId } },
        rootDir: tempDir
      });

      expect(entry.meta.alphaWU.total).toBeCloseTo(segmentResult.alphaWU, 2);
      expect(entry.meta.alphaWU.bySegment.length).toBeGreaterThan(0);
      expect(entry.meta.alphaWU.bySegment[0].alphaWU).toBe(segmentResult.alphaWU);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }

    const finalizeEntry = journal.entries.find((entry) => entry.action?.type === 'finalize');
    expect(finalizeEntry?.job?.alphaWU?.total).toBe(segmentResult.alphaWU);

    expect(applyMock).toHaveBeenCalled();
    expect(submitMock).toHaveBeenCalled();
    expect(finalizeMock).toHaveBeenCalled();
  });
});
