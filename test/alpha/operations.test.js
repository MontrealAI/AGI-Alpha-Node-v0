import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { Wallet } from 'ethers';
import { signOutcome, importOutcome, outcomeSummary, initializeNode, loadNode, runMission, exportMission, signDetachedReview, importDetachedReview, pauseNode, recordOperation } from '../../src/alpha/node.js';
import { cycle, discoverUsage, operationStatus } from '../../src/alpha/operations.js';
import { operatorServer } from '../../src/alpha/operator.js';
import { digest } from '../../src/alpha/mission.js';
const policy = JSON.parse(await readFile('examples/alpha/pipeline.json', 'utf8'));
const fixture = JSON.parse(await readFile('examples/alpha/opportunity-scan.json', 'utf8'));
const usage = () => ({ schema: 1, observedAt: new Date().toISOString(), period: 'Synthetic test month', services: [{ id: 'inference', name: 'Fixture inference', requests: 1000, repeatedRequests: 600, costUsd: 500 }] });
let dir, reviewer, input;
const write = (name, data) => writeFile(join(dir, name), JSON.stringify(data));
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'alpha-ops-')); reviewer = Wallet.createRandom(); await initializeNode(dir, { ensName: 'ops.alpha.node.agi.eth', reviewer: reviewer.address }); input = usage(); await write('usage.json', input); await write('pipeline.json', policy); });
afterEach(async () => rm(dir, { recursive: true, force: true }));
describe('bounded usage discovery', () => {
  it('discovers a candidate, signs and exports, restarts without repeat costs, and accepts an asynchronous review', async () => {
    const result = await cycle(dir); expect(result.status).toBe('awaiting-review');
    const bundle = JSON.parse(await readFile(join(dir, 'deliverables', result.missionId, 'evidence.json'), 'utf8'));
    expect(bundle.run.analysis.recommendation).toBe('cache-inference');
    const signed = await signDetachedReview(bundle, 'accepted', 'Fixture review; economics remain assumptions.', reviewer.privateKey);
    await runMission(dir, fixture); // unrelated ledger activity must not invalidate the signature
    await importDetachedReview(dir, signed);
    expect((await loadNode(dir)).runs.get(result.missionId).review.decision).toBe('accepted');
    expect((await cycle(dir)).status).toBe('replayed');
    expect(operationStatus(await loadNode(dir)).dailyRuns).toBe(1);
    await expect(importDetachedReview(dir, signed)).rejects.toThrow('already reviewed');
  });
  it('records one reviewer-signed measured outcome and compares it with the projection', async () => {
    const result = await cycle(dir); let out = await exportMission(dir, result.missionId, join(dir, 'out'));
    let bundle = JSON.parse(await readFile(out.evidence, 'utf8'));
    await importDetachedReview(dir, await signDetachedReview(bundle, 'accepted', 'Accepted for fixture experiment', reviewer.privateKey));
    out = await exportMission(dir, result.missionId, join(dir, 'out')); bundle = JSON.parse(await readFile(out.evidence, 'utf8'));
    const measurement = { measuredBenefitUsd: 100, measuredCostUsd: 30, observedAt: new Date().toISOString(), evidence: 'Synthetic fixture measurements; no real savings claimed.' };
    const signed = await signOutcome(bundle, measurement, reviewer.privateKey);
    await importOutcome(dir, signed);
    expect(outcomeSummary(await loadNode(dir)).reviewerReportedNetUsd).toBe(70);
    await expect(importOutcome(dir, signed)).rejects.toThrow('previous outcome');
    await expect(signOutcome(bundle, { ...measurement, measuredCostUsd: -1 }, reviewer.privateKey)).rejects.toThrow('Invalid measured');
    await expect(signOutcome(bundle, measurement, Wallet.createRandom().privateKey)).rejects.toThrow('independent reviewer');
  });
  it('enforces review admission and budget before signing another run', async () => {
    await write('pipeline.json', { ...policy, maxPendingReviews: 1 }); await cycle(dir);
    input.services[0].costUsd = 700; await write('usage.json', input);
    await expect(cycle(dir)).rejects.toThrow('review capacity');
    await write('pipeline.json', { ...policy, maxDailyRuns: 1 });
    await expect(cycle(dir)).rejects.toThrow('budget');
    expect((await loadNode(dir)).runs.size).toBe(1);
  });
  it('abstains on no opportunities, and rejects stale, future or inconsistent observations', async () => {
    input.services[0].repeatedRequests = 0; await write('usage.json', input); expect((await cycle(dir)).status).toBe('abstained');
    input.observedAt = new Date(Date.now() - 2 * 86400000).toISOString(); await write('usage.json', input); await expect(cycle(dir)).rejects.toThrow('stale');
    input.observedAt = new Date(Date.now() + 120000).toISOString(); expect(() => discoverUsage(input, policy)).toThrow('future');
    input.services[0].repeatedRequests = 1001; expect(() => discoverUsage(input, policy)).toThrow('exceed');
  });
  it('does not admit work while paused or another pipeline owns the lock', async () => {
    await pauseNode(dir, true); await expect(cycle(dir)).rejects.toThrow('paused'); await pauseNode(dir, false);
    await writeFile(join(dir, 'pipeline.lock'), 'interrupted'); await expect(cycle(dir)).rejects.toThrow('interrupted');
  });
  it('recovers a committed run after interruption without repeating inference', async () => {
    const mission = discoverUsage(input, policy); const cycleId = digest({ mission, provider: null });
    await recordOperation(dir, { phase: 'reserved', cycle: cycleId, missionId: mission.id, reservedMicroUsd: 100000 });
    await runMission(dir, mission);
    expect((await cycle(dir)).status).toBe('replayed');
    expect(operationStatus(await loadNode(dir)).unresolved).toHaveLength(0);
    expect(operationStatus(await loadNode(dir)).dailyReservedMicroUsd).toBe(100000);
  });
  it('fails closed after interruption before the result commit', async () => {
    const mission = discoverUsage(input, policy);
    await recordOperation(dir, { phase: 'reserved', cycle: digest({ mission, provider: null }), missionId: mission.id, reservedMicroUsd: 100000 });
    await expect(cycle(dir)).rejects.toThrow('already attempted');
    input.services[0].costUsd = 600; await write('usage.json', input); await expect(cycle(dir)).rejects.toThrow('Unresolved');
  });
  it('retains reservations after a failed provider call and forbids silent retries', async () => {
    const config = JSON.parse(await readFile(join(dir, 'config.json'), 'utf8'));
    config.provider = { url: 'http://example.com', model: 'fixture', maxTokens: 1 }; await write('config.json', config);
    await expect(cycle(dir)).rejects.toThrow('HTTPS');
    const status = operationStatus(await loadNode(dir)); expect(status.dailyReservedMicroUsd).toBe(100000); expect(status.unresolved).toHaveLength(0);
    await expect(cycle(dir)).rejects.toThrow('already attempted');
  });
  it('rejects review substitution and preserves legacy ledgers', async () => {
    await runMission(dir, fixture); const out = await exportMission(dir, fixture.id, join(dir, 'out'));
    const signed = await signDetachedReview(JSON.parse(await readFile(out.evidence, 'utf8')), 'accepted', 'Checked fixture', reviewer.privateKey);
    signed.decision = 'rejected'; await expect(importDetachedReview(dir, signed)).rejects.toThrow('binding');
    expect((await loadNode(dir)).runs.get(fixture.id).review).toBe(null);
  });
});
describe('local operator boundary', () => {
  it('authenticates API access, rejects hostile origins and exposes no signing key or provider secret', async () => {
    const { server, token, url } = await operatorServer(dir);
    const base = url.split('/#')[0]; const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    try {
      expect((await fetch(`${base}/api/status`)).status).toBe(401);
      expect((await fetch(`${base}/api/status`, { headers: { ...headers, Origin: 'https://evil.example' } })).status).toBe(403);
      expect(await new Promise((resolve, reject) => { const req = request(`${base}/api/status`, { headers: { ...headers, Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); req.end(); })).toBe(403);
      const response = await fetch(`${base}/api/status`, { headers }); expect(response.status).toBe(200); const text = await response.text(); expect(text).not.toContain('privateKey'); expect(text).not.toContain('rpcUrl');
      const result = await fetch(`${base}/api/cycle`, { method: 'POST', headers, body: '{}' }); expect((await result.json()).status).toBe('awaiting-review');
      await fetch(`${base}/api/pause`, { method: 'POST', headers, body: '{}' }); expect((await loadNode(dir)).paused).toBe(true);
      expect((await fetch(`${base}/api/cycle`, { method: 'POST', headers, body: '{}' })).status).toBe(400);
      const page = await fetch(base); expect(page.headers.get('content-security-policy')).toContain("frame-ancestors 'none'"); expect(await page.text()).toContain('$AGIALPHA');
      expect((await fetch(`${base}/api/review`, { method: 'POST', headers, body: 'x'.repeat(13000) })).status).toBe(413);
    } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
  });
});
