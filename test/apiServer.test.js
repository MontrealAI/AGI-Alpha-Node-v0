import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { startAgentApi } from '../src/network/apiServer.js';

const noopLogger = { info: () => {}, warn: () => {}, error: () => {} };

function buildBaseUrl(server) {
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return `http://127.0.0.1:${port}`;
}

describe('agent API server', () => {
  let api;
  const jobsEmitter = new EventEmitter();

  beforeEach(() => {
    jobsEmitter.removeAllListeners();
  });

  afterEach(async () => {
    if (api) {
      await api.stop();
      api = null;
    }
  });

  it('exposes lifecycle jobs and forwards apply/submit/finalize calls', async () => {
    const jobLifecycle = {
      listJobs: vi.fn(() => [
        {
          jobId: 'job-1',
          status: 'open',
          reward: 10n,
          uri: 'ipfs://job-1',
          tags: ['test']
        }
      ]),
      on: vi.fn((event, handler) => {
        jobsEmitter.on(event, handler);
        return () => jobsEmitter.off(event, handler);
      }),
      apply: vi.fn(async () => ({ jobId: 'job-1', method: 'applyForJob', transactionHash: '0xapply' })),
      submit: vi.fn(async () => ({
        jobId: 'job-1',
        method: 'submitProof',
        transactionHash: '0xsubmit',
        commitment: '0xcommit',
        resultHash: '0xhash'
      })),
      finalize: vi.fn(async () => ({ jobId: 'job-1', method: 'finalize', transactionHash: '0xfinal' })),
      getMetrics: vi.fn(() => ({ discovered: 1, lastJobProvider: 'agi-jobs' }))
    };

    api = startAgentApi({ port: 0, jobLifecycle, logger: noopLogger });
    await new Promise((resolve) => setTimeout(resolve, 25));

    const baseUrl = buildBaseUrl(api.server);

    const listResponse = await fetch(`${baseUrl}/jobs`);
    expect(listResponse.status).toBe(200);
    const listPayload = await listResponse.json();
    expect(Array.isArray(listPayload.lifecycle)).toBe(true);
    expect(listPayload.lifecycle[0].jobId).toBe('job-1');

    jobsEmitter.emit('job:update', { jobId: 'job-2', status: 'open' });
    const refreshed = await fetch(`${baseUrl}/jobs`);
    const refreshedPayload = await refreshed.json();
    expect(refreshedPayload.lifecycle.some((job) => job.jobId === 'job-2')).toBe(true);

    const applyResponse = await fetch(`${baseUrl}/jobs/job-1/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subdomain: '1' })
    });
    expect(applyResponse.status).toBe(202);
    expect(jobLifecycle.apply).toHaveBeenCalledWith('job-1', expect.objectContaining({ subdomain: '1' }));

    const submitResponse = await fetch(`${baseUrl}/jobs/job-1/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result: '{"ok":true}' })
    });
    expect(submitResponse.status).toBe(202);
    expect(jobLifecycle.submit).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ result: expect.any(String) })
    );

    const finalizeResponse = await fetch(`${baseUrl}/jobs/job-1/finalize`, { method: 'POST' });
    expect(finalizeResponse.status).toBe(202);
    expect(jobLifecycle.finalize).toHaveBeenCalledWith('job-1');
  });

  it('returns informative error when lifecycle integration is missing', async () => {
    api = startAgentApi({ port: 0, logger: noopLogger });
    await new Promise((resolve) => setTimeout(resolve, 25));
    const baseUrl = buildBaseUrl(api.server);

    const response = await fetch(`${baseUrl}/jobs/abc/apply`, { method: 'POST' });
    expect(response.status).toBe(503);
    const payload = await response.json();
    expect(payload.error).toMatch(/not configured/i);
  });

  it('exposes governance directives and crafts owner payloads', async () => {
    api = startAgentApi({ port: 0, logger: noopLogger });
    await new Promise((resolve) => setTimeout(resolve, 25));
    const baseUrl = buildBaseUrl(api.server);

    api.setOwnerDirectives({
      priority: 'critical',
      actions: [{ type: 'pause', level: 'critical' }],
      notices: ['Stake deficit detected'],
      context: { meetsMinimum: false }
    });

    const directivesResponse = await fetch(`${baseUrl}/governance/directives`);
    expect(directivesResponse.status).toBe(200);
    const directivesPayload = await directivesResponse.json();
    expect(directivesPayload.directives.priority).toBe('critical');
    expect(Array.isArray(directivesPayload.directives.actions)).toBe(true);
    expect(directivesPayload.directives.actions[0].type).toBe('pause');
    expect(directivesPayload.directives.context.meetsMinimum).toBe(false);

    const pauseResponse = await fetch(`${baseUrl}/governance/pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPauseAddress: '0x0000000000000000000000000000000000000001', action: 'pause' })
    });
    expect(pauseResponse.status).toBe(200);
    const pausePayload = await pauseResponse.json();
    expect(pausePayload.tx.to).toBe('0x0000000000000000000000000000000000000001');
    expect(typeof pausePayload.tx.data).toBe('string');

    const minStakeResponse = await fetch(`${baseUrl}/governance/minimum-stake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stakeManagerAddress: '0x0000000000000000000000000000000000000002',
        amount: '1000.5',
        decimals: 18
      })
    });
    expect(minStakeResponse.status).toBe(200);
    const minStakePayload = await minStakeResponse.json();
    expect(minStakePayload.tx.to).toBe('0x0000000000000000000000000000000000000002');

    const roleShareResponse = await fetch(`${baseUrl}/governance/role-share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rewardEngineAddress: '0x0000000000000000000000000000000000000003',
        role: 'node',
        shareBps: 4200
      })
    });
    expect(roleShareResponse.status).toBe(200);
    const roleSharePayload = await roleShareResponse.json();
    expect(roleSharePayload.tx.role).toBeDefined();
    expect(roleSharePayload.tx.shareBps).toBe(4200);

    const globalSharesResponse = await fetch(`${baseUrl}/governance/global-shares`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rewardEngineAddress: '0x0000000000000000000000000000000000000004',
        operatorShareBps: 6000,
        validatorShareBps: 3000,
        treasuryShareBps: 1000
      })
    });
    expect(globalSharesResponse.status).toBe(200);
    const globalSharesPayload = await globalSharesResponse.json();
    expect(globalSharesPayload.tx.shares.operatorShare).toBe(6000);

    const stakeTopUpResponse = await fetch(`${baseUrl}/governance/stake-top-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        incentivesAddress: '0x0000000000000000000000000000000000000005',
        amount: '250.75'
      })
    });
    expect(stakeTopUpResponse.status).toBe(200);
    const stakeTopUpPayload = await stakeTopUpResponse.json();
    expect(stakeTopUpPayload.tx.to).toBe('0x0000000000000000000000000000000000000005');

    const updateDirectivesResponse = await fetch(`${baseUrl}/governance/directives`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        priority: 'warning',
        actions: [
          {
            type: 'resume',
            level: 'warning',
            reason: 'Stake posture nominal',
            tx: { to: '0x0000000000000000000000000000000000000010', method: 'resumeAll' }
          }
        ],
        notices: ['Operations can resume'],
        context: { meetsMinimum: true, deficit: '0' }
      })
    });
    expect(updateDirectivesResponse.status).toBe(200);
    const updateDirectivesPayload = await updateDirectivesResponse.json();
    expect(updateDirectivesPayload.directives.priority).toBe('warning');
    expect(updateDirectivesPayload.directives.actions[0].type).toBe('resume');
    expect(updateDirectivesPayload.directives.actions[0].level).toBe('warning');
    expect(updateDirectivesPayload.directives.context.meetsMinimum).toBe(true);

    const confirmDirectives = await fetch(`${baseUrl}/governance/directives`);
    const confirmPayload = await confirmDirectives.json();
    expect(confirmPayload.directives.priority).toBe('warning');
    expect(confirmPayload.directives.context.meetsMinimum).toBe(true);

    const metrics = api.getMetrics();
    expect(metrics.governance.directivesUpdates).toBeGreaterThanOrEqual(2);
    expect(metrics.governance.payloads).toBeGreaterThanOrEqual(5);

    const invalidResponse = await fetch(`${baseUrl}/governance/minimum-stake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stakeManagerAddress: '0x0' })
    });
    expect(invalidResponse.status).toBe(400);

    const invalidDirectives = await fetch(`${baseUrl}/governance/directives`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actions: { type: 'pause' } })
    });
    expect(invalidDirectives.status).toBe(400);
  });
});
