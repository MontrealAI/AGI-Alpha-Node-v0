import { describe, expect, it, beforeEach, vi } from 'vitest';
import { zeroPadValue, keccak256, toUtf8Bytes } from 'ethers';
import { createJobLifecycle } from '../src/services/jobLifecycle.js';
import { resolveJobProfile, createInterfaceFromProfile } from '../src/services/jobProfiles.js';
import { resetMetering, startSegment, stopSegment } from '../src/services/metering.js';
import { MODEL_CLASSES, SLA_PROFILES } from '../src/constants/workUnits.js';

const registryAddress = '0x00000000000000000000000000000000000000aa';
const v0Profile = resolveJobProfile('v0');
const v0Interface = createInterfaceFromProfile(v0Profile);
const v2Profile = resolveJobProfile('v2');
const v2Interface = createInterfaceFromProfile(v2Profile);

function buildLog(iface, eventName, params) {
  const { data, topics } = iface.encodeEventLog(eventName, params);
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

describe('job lifecycle service', () => {
  const provider = {
    getBlockNumber: vi.fn(async () => 120),
    getLogs: vi.fn(async () => []),
    on: vi.fn(),
    off: vi.fn()
  };

  beforeEach(() => {
    resetMetering();
    provider.getBlockNumber.mockResolvedValue(120);
    provider.getLogs.mockResolvedValue([]);
    provider.on.mockReset();
    provider.off.mockReset();
  });

  it('discovers jobs from JobCreated events and records snapshots', async () => {
    const jobId = '0x' + '11'.repeat(32);
    const client = '0x0000000000000000000000000000000000000001';
    const reward = 100n;
    const deadline = 1_700_000_000n;
    const uri = 'ipfs://job';
    const tags = '["alpha"]';
    const log = buildLog(v0Interface, 'JobCreated', [jobId, client, reward, deadline, uri, tags]);
    provider.getLogs.mockResolvedValue([log]);
    const journal = createMemoryJournal();

    const lifecycle = createJobLifecycle({
      provider,
      jobRegistryAddress: registryAddress,
      profile: 'v0',
      journal,
      contractFactory: () => ({ target: registryAddress, interface: v0Interface })
    });

    const jobs = await lifecycle.discover();
    expect(provider.getLogs).toHaveBeenCalled();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].jobId).toBe(jobId.toLowerCase());
    expect(jobs[0].client).toBe(client);
    expect(jobs[0].reward).toBe(reward);
    expect(jobs[0].uri).toBe(uri);
    expect(jobs[0].tags).toEqual(['alpha']);
    expect(journal.entries).toHaveLength(1);
    expect(journal.entries[0].kind).toBe('snapshot');
    expect(journal.entries[0].jobs[0].metadata.jobId).toBe(jobId.toLowerCase());
  });

  it('merges getOpenJobs results when registry exposes helper', async () => {
    provider.getLogs.mockResolvedValue([]);

    const jobId = '0x' + '33'.repeat(32);
    const client = '0x0000000000000000000000000000000000000003';
    const reward = 250n;
    const deadline = 1_800_000_000n;
    const getOpenJobs = vi.fn(async () => [[jobId, client, reward, deadline, 'ipfs://open', ['ops', 'urgent']]]);

    const lifecycle = createJobLifecycle({
      provider,
      jobRegistryAddress: registryAddress,
      profile: 'v0',
      contractFactory: () => ({ target: registryAddress, interface: v0Interface, getOpenJobs })
    });

    const jobs = await lifecycle.discover({ maxJobs: 5 });
    expect(getOpenJobs).toHaveBeenCalled();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].jobId).toBe(jobId.toLowerCase());
    expect(jobs[0].client).toBe(client);
    expect(jobs[0].reward).toBe(reward);
    expect(jobs[0].deadline).toBe(deadline);
    expect(jobs[0].status).toBe('open');
    expect(jobs[0].tags).toEqual(['ops', 'urgent']);
  });

  it('applies, submits, and finalizes jobs using profile preferences and journals actions', async () => {
    const normalizedJobId = zeroPadValue(keccak256(toUtf8Bytes('job-7')), 32);

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
      contractFactory,
      journal
    });

    const segmentStart = startSegment({
      jobId: normalizedJobId,
      deviceInfo: { deviceClass: 'A100-80GB', vramTier: 'TIER_80', gpuCount: 1 },
      modelClass: MODEL_CLASSES.LLM_8B,
      slaProfile: SLA_PROFILES.STANDARD,
      startedAt: new Date('2024-01-01T00:00:00Z')
    });

    await lifecycle.apply('job-7', { subdomain: 'node', proof: '0x1234' });
    expect(applyMock).toHaveBeenCalledWith(normalizedJobId, 'node', '0x1234');

    const submission = await lifecycle.submit('job-7', {
      result: { ok: true },
      resultUri: 'ipfs://result'
    });
    expect(submitMock).toHaveBeenCalled();
    expect(submission.commitment).toMatch(/^0x/);
    expect(submission.resultHash).toMatch(/^0x/);
    expect(submission.validator).toBeNull();

    stopSegment(segmentStart.segmentId, {
      endedAt: new Date('2024-01-01T00:15:00Z')
    });

    await lifecycle.finalize('job-7');
    expect(finalizeMock).toHaveBeenCalledWith(normalizedJobId);

    const actionTypes = journal.entries.filter((entry) => entry.kind === 'action').map((entry) => entry.action.type);
    expect(actionTypes).toEqual(expect.arrayContaining(['apply', 'submit', 'finalize']));

    const finalizedJob = lifecycle.getJob('job-7');
    expect(finalizedJob.alphaWU).not.toBeNull();
    expect(finalizedJob.alphaWU.total).toBeGreaterThan(0);
    expect(finalizedJob.alphaWU.bySegment.length).toBeGreaterThan(0);
    expect(Object.keys(finalizedJob.alphaWU.modelClassBreakdown).length).toBeGreaterThan(0);
    expect(Object.keys(finalizedJob.alphaWU.slaBreakdown).length).toBeGreaterThan(0);
    expect(finalizedJob.alphaWU.bySegment[0].gpuCount).toBe(1);

    const finalizeEntry = journal.entries.find((entry) => entry.action?.type === 'finalize');
    expect(finalizeEntry?.job?.alphaWU?.total).toBeGreaterThan(0);
    expect(Object.keys(finalizeEntry?.job?.alphaWU?.modelClassBreakdown ?? {})).toContain(MODEL_CLASSES.LLM_8B);
  });

  it('records alpha work unit events manually and surfaces metrics', () => {
    const lifecycle = createJobLifecycle({});
    const events = [];
    lifecycle.on('alpha-wu:event', (event) => events.push(event));

    const unitId = '0x' + 'aa'.repeat(32);
    lifecycle.recordAlphaWorkUnitEvent('minted', {
      id: unitId,
      agent: '0x0000000000000000000000000000000000000011',
      node: '0x0000000000000000000000000000000000000022',
      timestamp: 1_700_000_000
    });
    lifecycle.recordAlphaWorkUnitEvent('validated', {
      id: unitId,
      validator: '0x0000000000000000000000000000000000000033',
      stake: 100,
      score: 0.95,
      timestamp: 1_700_000_100
    });
    lifecycle.recordAlphaWorkUnitEvent('accepted', {
      id: unitId,
      timestamp: 1_700_000_180
    });
    lifecycle.recordAlphaWorkUnitEvent('slashed', {
      id: unitId,
      validator: '0x0000000000000000000000000000000000000033',
      amount: 0.5,
      timestamp: 1_700_000_200
    });

    const alphaMetrics = lifecycle.getAlphaWorkUnitMetrics();
    expect(alphaMetrics.overall.totals.minted).toBe(1);
    expect(alphaMetrics.overall.totals.accepted).toBe(1);
    expect(alphaMetrics.overall.acceptanceRate).toBeCloseTo(1);
    expect(events).toHaveLength(4);
    expect(events[0].type).toBe('minted');
  });

  it('runs validator-aware v2 flow including notifyValidator and records telemetry', async () => {
    const normalizedJobId = zeroPadValue(keccak256(toUtf8Bytes('job-99')), 32);
    const submitWithValidator = vi.fn(async () => ({ hash: '0xsubmitv2' }));
    const finalizeWithValidator = vi.fn(async () => ({ hash: '0xfinalv2' }));
    const notifyValidator = vi.fn(async () => ({ hash: '0xnotify' }));

    const contractFactory = vi.fn(() => ({
      target: registryAddress,
      interface: v2Interface,
      submitWithValidator,
      finalizeWithValidator,
      notifyValidator,
      connect() {
        return this;
      }
    }));
    const journal = createMemoryJournal();

    const lifecycle = createJobLifecycle({
      provider,
      jobRegistryAddress: registryAddress,
      profile: 'v2',
      contractFactory,
      journal
    });

    await lifecycle.submit('job-99', {
      result: { ok: true },
      resultUri: 'ipfs://job-99',
      validator: '0x0000000000000000000000000000000000000010'
    });
    expect(submitWithValidator).toHaveBeenCalledWith(
      normalizedJobId,
      expect.any(String),
      expect.any(String),
      'ipfs://job-99',
      expect.any(String),
      '0x0000000000000000000000000000000000000010'
    );

    await lifecycle.notifyValidator('job-99', '0x0000000000000000000000000000000000000010');
    expect(notifyValidator).toHaveBeenCalledWith(normalizedJobId, '0x0000000000000000000000000000000000000010');

    await lifecycle.finalize('job-99', { validator: '0x0000000000000000000000000000000000000010' });
    expect(finalizeWithValidator).toHaveBeenCalledWith(normalizedJobId, '0x0000000000000000000000000000000000000010');

    const types = journal.entries.filter((entry) => entry.kind === 'action').map((entry) => entry.action.type);
    expect(types).toEqual(expect.arrayContaining(['submit', 'notifyValidator', 'finalize']));
  });

  it('updates job status from watched events and records validation actions', async () => {
    const watchers = [];
    provider.on.mockImplementation((filter, handler) => {
      watchers.push({ filter, handler });
    });
    provider.off.mockImplementation((filter, handler) => {
      const index = watchers.findIndex((entry) => entry.filter === filter && entry.handler === handler);
      if (index >= 0) {
        watchers.splice(index, 1);
      }
    });

    const journal = createMemoryJournal();

    const lifecycle = createJobLifecycle({
      provider,
      jobRegistryAddress: registryAddress,
      profile: 'v2',
      journal,
      contractFactory: () => ({ target: registryAddress, interface: v2Interface })
    });

    const stop = lifecycle.watch();
    expect(typeof stop).toBe('function');
    expect(watchers.length).toBeGreaterThan(0);

    const jobId = '0x' + '22'.repeat(32);
    const createdLog = buildLog(v2Interface, 'JobCreated', [jobId, registryAddress, 50n, 1_600_000_000n, 'ipfs://job', '[]']);
    const createdWatcher = watchers.find((entry) => entry.filter.topics?.[0] === v2Interface.getEvent('JobCreated').topicHash);
    createdWatcher.handler(createdLog);

    const appliedLog = buildLog(v2Interface, 'JobApplied', [jobId, registryAddress]);
    const appliedWatcher = watchers.find((entry) => entry.filter.topics?.[0] === v2Interface.getEvent('JobApplied').topicHash);
    appliedWatcher.handler(appliedLog);

    const validatedLog = buildLog(v2Interface, 'JobValidated', [jobId, registryAddress, true]);
    const validatedWatcher = watchers.find((entry) => entry.filter.topics?.[0] === v2Interface.getEvent('JobValidated').topicHash);
    validatedWatcher.handler(validatedLog);

    const alphaMintedLog = buildLog(v2Interface, 'AlphaWUMinted', [jobId, registryAddress, registryAddress, 1_600_000_010n]);
    const alphaMintedWatcher = watchers.find(
      (entry) => entry.filter?.topics?.[0] === v2Interface.getEvent('AlphaWUMinted').topicHash
    );
    expect(alphaMintedWatcher).toBeDefined();
    alphaMintedWatcher.handler(alphaMintedLog);

    const alphaValidatedLog = buildLog(v2Interface, 'AlphaWUValidated', [
      jobId,
      registryAddress,
      100n,
      90,
      1_600_000_020n
    ]);
    const alphaValidatedWatcher = watchers.find(
      (entry) => entry.filter?.topics?.[0] === v2Interface.getEvent('AlphaWUValidated').topicHash
    );
    expect(alphaValidatedWatcher).toBeDefined();
    alphaValidatedWatcher.handler(alphaValidatedLog);

    const alphaAcceptedLog = buildLog(v2Interface, 'AlphaWUAccepted', [jobId, 1_600_000_030n]);
    const alphaAcceptedWatcher = watchers.find(
      (entry) => entry.filter?.topics?.[0] === v2Interface.getEvent('AlphaWUAccepted').topicHash
    );
    expect(alphaAcceptedWatcher).toBeDefined();
    alphaAcceptedWatcher.handler(alphaAcceptedLog);

    const job = lifecycle.getJob(jobId);
    expect(job.status).toBe('validated');

    const metrics = lifecycle.getMetrics();
    expect(metrics.validatorNotifications).toBeGreaterThan(0);

    const alphaMetrics = lifecycle.getAlphaWorkUnitMetrics();
    expect(alphaMetrics.overall.totals.minted).toBeGreaterThanOrEqual(1);
    expect(alphaMetrics.overall.acceptanceRate).toBeGreaterThan(0);

    const validationEntries = journal.entries.filter((entry) => entry.kind === 'action' && entry.action.type === 'validation');
    expect(validationEntries).toHaveLength(1);
    expect(validationEntries[0].action.accepted).toBe(true);

    stop();
    expect(watchers.length).toBe(0);
  });
});
