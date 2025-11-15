import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setTimeout as delay } from 'node:timers/promises';
import { createJobLifecycle } from '../src/services/jobLifecycle.js';
import { resolveJobProfile, createInterfaceFromProfile } from '../src/services/jobProfiles.js';
import * as metering from '../src/services/metering.js';
import * as monitoring from '../src/telemetry/monitoring.js';
import { loadConfig } from '../src/config/env.js';

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
    transactionHash: '0xmetricslog'
  };
}

describe('job lifecycle metrics integration', () => {
  const provider = {
    getBlockNumber: vi.fn(async () => 120),
    getLogs: vi.fn(async () => []),
    on: vi.fn(),
    off: vi.fn()
  };

  const noopLogger = { info: () => {}, warn: () => {}, error: () => {} };

  let lifecycle;

  const monitoringSpies = {};

  beforeEach(() => {
    Object.values(monitoringSpies).forEach((spy) => spy?.mockRestore?.());
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    loadConfig({});
    metering.resetMetering();
    provider.getBlockNumber.mockResolvedValue(120);
    provider.getLogs.mockResolvedValue([]);
    provider.on.mockReset();
    provider.off.mockReset();
    process.env.NODE_PRIVATE_KEY =
      '0x59c6995e998f97a5a0044966f0945386f0b0c9cc1fa50bdbeeb29f44cbeb2c82';

    monitoringSpies.updateJobsRunning = vi.spyOn(monitoring, 'updateJobsRunning');
    monitoringSpies.incrementJobsCompleted = vi.spyOn(monitoring, 'incrementJobsCompleted');
    monitoringSpies.incrementJobsFailed = vi.spyOn(monitoring, 'incrementJobsFailed');
    monitoringSpies.observeJobLatencyMs = vi.spyOn(monitoring, 'observeJobLatencyMs');
    monitoringSpies.incrementAlphaWuValidated = vi.spyOn(monitoring, 'incrementAlphaWuValidated');
    monitoringSpies.incrementAlphaWuInvalid = vi.spyOn(monitoring, 'incrementAlphaWuInvalid');
    monitoringSpies.observeAlphaWuValidationLatencyMs = vi.spyOn(
      monitoring,
      'observeAlphaWuValidationLatencyMs'
    );

    const jobCreatedLog = buildLog('JobCreated', [
      '0x' + '01'.repeat(32),
      '0x0000000000000000000000000000000000000001',
      250n,
      1_800_000_000n,
      'ipfs://job-metrics',
      '["metrics", "alpha"]'
    ]);

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

    lifecycle = createJobLifecycle({
      provider,
      jobRegistryAddress: registryAddress,
      profile: 'v0',
      journal: null,
      contractFactory,
      logger: noopLogger
    });
  });

  afterEach(async () => {
    delete process.env.NODE_PRIVATE_KEY;
    lifecycle?.stop();
    lifecycle = null;
    Object.values(monitoringSpies).forEach((spy) => spy?.mockRestore?.());
    vi.useRealTimers();
    await delay(0);
  });

  it('updates job metrics and latency histograms across lifecycle transitions', async () => {
    const jobs = await lifecycle.discover();
    expect(jobs).toHaveLength(1);
    const jobId = jobs[0].jobId;

    // reset spies after initial discovery snapshot
    Object.values(monitoringSpies).forEach((spy) => spy.mockClear());

    await lifecycle.apply(jobId, { subdomain: 'node', proof: '0x1234' });
    expect(monitoringSpies.updateJobsRunning).toHaveBeenCalledWith(1);

    const segmentStart = metering.startSegment({
      jobId,
      deviceInfo: { deviceClass: 'H100-80GB', gpuCount: 1 },
      modelClass: 'LLM_70B',
      slaProfile: 'STANDARD',
      startedAt: new Date('2024-01-01T00:00:00Z')
    });
    vi.advanceTimersByTime(4_200);
    metering.stopSegment(segmentStart.segmentId, {
      endedAt: new Date('2024-01-01T00:00:04.200Z')
    });

    await lifecycle.submitExecutorResult(jobId, {
      result: { ok: true },
      resultUri: 'ipfs://result'
    });

    expect(monitoringSpies.updateJobsRunning).toHaveBeenLastCalledWith(0);
    expect(monitoringSpies.incrementJobsCompleted).toHaveBeenCalledOnce();
    expect(monitoringSpies.incrementJobsFailed).not.toHaveBeenCalled();
    expect(monitoringSpies.observeJobLatencyMs).toHaveBeenCalledTimes(1);
    const latencyCall = monitoringSpies.observeJobLatencyMs.mock.calls[0][0];
    expect(latencyCall).toBeGreaterThanOrEqual(4200);
    expect(latencyCall).toBeLessThan(4300);

    await lifecycle.finalize(jobId);
    expect(monitoringSpies.incrementJobsCompleted).toHaveBeenCalledTimes(1);
  });

  it('records alpha work unit validation and slash metrics with latency tracking', () => {
    const mintedTimestamp = 1_700_000_000n;
    const validatorA = '0x00000000000000000000000000000000000000a1';
    const validatorB = '0x00000000000000000000000000000000000000b2';
    const validatorC = '0x00000000000000000000000000000000000000c3';
    lifecycle.recordAlphaWorkUnitEvent('minted', {
      id: '0x' + 'aa'.repeat(32),
      timestamp: mintedTimestamp
    });

    lifecycle.recordAlphaWorkUnitEvent('minted', {
      id: '0x' + 'bb'.repeat(32),
      timestamp: mintedTimestamp
    });

    lifecycle.recordAlphaWorkUnitEvent('minted', {
      id: '0x' + 'cc'.repeat(32),
      timestamp: mintedTimestamp
    });

    lifecycle.recordAlphaWorkUnitEvent('validated', {
      id: '0x' + 'aa'.repeat(32),
      score: 5,
      validator: validatorA,
      stake: 10,
      timestamp: mintedTimestamp + 12n
    });

    lifecycle.recordAlphaWorkUnitEvent('validated', {
      id: '0x' + 'bb'.repeat(32),
      score: 0,
      validator: validatorB,
      stake: 5,
      timestamp: mintedTimestamp + 8n
    });

    lifecycle.recordAlphaWorkUnitEvent('slashed', {
      id: '0x' + 'cc'.repeat(32),
      validator: validatorC,
      amount: 3,
      timestamp: mintedTimestamp + 9n
    });

    expect(monitoringSpies.incrementAlphaWuValidated).toHaveBeenCalledTimes(1);
    expect(monitoringSpies.incrementAlphaWuInvalid).toHaveBeenCalledTimes(2);
    expect(monitoringSpies.observeAlphaWuValidationLatencyMs).toHaveBeenCalled();
    const validationLatencyCalls = monitoringSpies.observeAlphaWuValidationLatencyMs.mock.calls.map(
      ([duration]) => duration
    );
    expect(validationLatencyCalls.some((value) => Math.abs(value - 12_000) <= 1)).toBe(true);
  });
});
