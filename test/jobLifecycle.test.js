import { describe, expect, it, beforeEach, vi } from 'vitest';
import { Interface, zeroPadValue, keccak256, toUtf8Bytes } from 'ethers';
import { createJobLifecycle, JOB_REGISTRY_ABI } from '../src/services/jobLifecycle.js';

const registryAddress = '0x00000000000000000000000000000000000000aa';
const iface = new Interface(JOB_REGISTRY_ABI);

function buildLog(eventName, params) {
  const { data, topics } = iface.encodeEventLog(eventName, params);
  return {
    address: registryAddress,
    data,
    topics,
    blockNumber: 123,
    transactionHash: '0xlog'
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
    provider.getBlockNumber.mockResolvedValue(120);
    provider.getLogs.mockResolvedValue([]);
    provider.on.mockReset();
    provider.off.mockReset();
  });

  it('discovers jobs from JobCreated events', async () => {
    const jobId = '0x' + '11'.repeat(32);
    const client = '0x0000000000000000000000000000000000000001';
    const reward = 100n;
    const deadline = 1_700_000_000n;
    const uri = 'ipfs://job';
    const tags = '["alpha"]';
    const log = buildLog('JobCreated', [jobId, client, reward, deadline, uri, tags]);
    provider.getLogs.mockResolvedValue([log]);

    const lifecycle = createJobLifecycle({
      provider,
      jobRegistryAddress: registryAddress,
      contractFactory: () => ({ target: registryAddress, interface: iface })
    });

    const jobs = await lifecycle.discover();
    expect(provider.getLogs).toHaveBeenCalled();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].jobId).toBe(jobId.toLowerCase());
    expect(jobs[0].client).toBe(client);
    expect(jobs[0].reward).toBe(reward);
    expect(jobs[0].uri).toBe(uri);
    expect(jobs[0].tags).toEqual(['alpha']);
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
      contractFactory: () => ({ target: registryAddress, interface: iface, getOpenJobs })
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

  it('applies, submits, and finalizes jobs using available contract methods', async () => {
    const normalizedJobId = zeroPadValue(keccak256(toUtf8Bytes('job-7')), 32);

    const applyMock = vi.fn(async () => ({ hash: '0xapply' }));
    const submitMock = vi.fn(async () => ({ hash: '0xsubmit' }));
    const finalizeMock = vi.fn(async () => ({ hash: '0xfinal' }));

    const contractFactory = vi.fn(() => ({
      target: registryAddress,
      interface: iface,
      applyForJob: applyMock,
      submitProof: submitMock,
      finalize: finalizeMock,
      connect() {
        return this;
      }
    }));

    const lifecycle = createJobLifecycle({
      provider,
      jobRegistryAddress: registryAddress,
      contractFactory
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

    await lifecycle.finalize('job-7');
    expect(finalizeMock).toHaveBeenCalledWith(normalizedJobId);
  });

  it('updates job status from watched events', async () => {
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

    const lifecycle = createJobLifecycle({
      provider,
      jobRegistryAddress: registryAddress,
      contractFactory: () => ({ target: registryAddress, interface: iface })
    });

    const stop = lifecycle.watch();
    expect(typeof stop).toBe('function');
    expect(watchers.length).toBeGreaterThan(0);

    const jobId = '0x' + '22'.repeat(32);
    const createdLog = buildLog('JobCreated', [jobId, registryAddress, 50n, 1_600_000_000n, 'ipfs://job', '[]']);
    const jobCreatedTopic = iface.getEvent('JobCreated').topicHash;
    const createdWatcher = watchers.find((entry) => entry.filter.topics?.[0] === jobCreatedTopic);
    createdWatcher.handler(createdLog);

    const appliedLog = buildLog('JobApplied', [jobId, registryAddress]);
    const jobAppliedTopic = iface.getEvent('JobApplied').topicHash;
    const appliedWatcher = watchers.find((entry) => entry.filter.topics?.[0] === jobAppliedTopic);
    appliedWatcher.handler(appliedLog);

    const job = lifecycle.getJob(jobId);
    expect(job.status).toBe('applied');
    expect(job.worker?.toLowerCase()).toBe(registryAddress.toLowerCase());

    stop();
    expect(watchers.length).toBe(0);
  });
});
