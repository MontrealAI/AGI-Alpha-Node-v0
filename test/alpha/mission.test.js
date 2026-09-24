import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { Wallet } from 'ethers';
import { analyzeMission, inferNarrative } from '../../src/alpha/mission.js';
import { initializeNode, runMission, loadNode, pauseNode, reviewMission, exportMission, settlementPlan, verifyIdentity, signDetachedReview, importDetachedReview } from '../../src/alpha/node.js';
const fixture = JSON.parse(await readFile('examples/alpha/opportunity-scan.json', 'utf8'));
let dir, reviewer;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'alpha-test-')); reviewer = Wallet.createRandom(); await initializeNode(dir, { ensName: 'test.alpha.node.agi.eth', reviewer: reviewer.address }); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe('standalone $AGIALPHA node', () => {
  it('executes, restarts, verifies, independently reviews and exports a signed deliverable', async () => {
    const run = await runMission(dir, fixture);
    expect(run.analysis.recommendation).toBe('cache');
    expect(run.analysis.rankings.find(r => r.id === 'expand').admitted).toBe(false);
    expect(run.identity.verified).toBe(false);
    expect((await loadNode(dir)).runs.get(fixture.id).hash).toBe(run.hash);
    await reviewMission(dir, fixture.id, 'accepted', 'Recomputed ranking; assumptions explicitly marked synthetic.', reviewer.privateKey);
    const loaded = await loadNode(dir);
    expect(loaded.runs.get(fixture.id).review.decision).toBe('accepted');
    const out = await exportMission(dir, fixture.id, join(dir, 'out'));
    expect(await readFile(out.report, 'utf8')).toContain('Cache repeated analysis');
    expect(JSON.parse(await readFile(out.evidence, 'utf8')).run.hash).toBe(run.hash);
  });
  it('reviews on a separate machine without exposing the node key', async () => {
    await runMission(dir, fixture); const out = await exportMission(dir, fixture.id, join(dir, 'out'));
    const bundle = JSON.parse(await readFile(out.evidence, 'utf8'));
    expect(JSON.stringify(bundle)).not.toContain('privateKey');
    const signed = await signDetachedReview(bundle, 'accepted', 'Reviewed source assumptions and recalculated ranking.', reviewer.privateKey);
    await importDetachedReview(dir, signed); expect((await loadNode(dir)).runs.get(fixture.id).review.decision).toBe('accepted');
    await expect(importDetachedReview(dir, signed)).rejects.toThrow('Stale');
  });
  it('replays identical input without creating new work or rewards', async () => {
    const first = await runMission(dir, fixture); const again = await runMission(dir, fixture);
    expect(again.hash).toBe(first.hash); expect(again.replay).toBe(true); expect((await loadNode(dir)).state.events).toHaveLength(1);
  });
  it('rejects input substitution under an existing mission ID', async () => {
    await runMission(dir, fixture); await expect(runMission(dir, { ...fixture, title: 'changed' })).rejects.toThrow('different inputs');
  });
  it('rejects tampered journals and corrupted outputs', async () => {
    await runMission(dir, fixture); const file = join(dir, 'state.json'); const s = JSON.parse(await readFile(file, 'utf8'));
    s.events[0].report = 'fabricated'; await writeFile(file, JSON.stringify(s)); await expect(loadNode(dir)).rejects.toThrow('integrity');
  });
  it('blocks paused execution and resumes explicitly', async () => {
    await pauseNode(dir, true); await expect(runMission(dir, fixture)).rejects.toThrow('paused'); await pauseNode(dir, false); expect((await runMission(dir, fixture)).status).toBe('awaiting-review');
  });
  it('requires the designated separate reviewer and rejects repeated review', async () => {
    await runMission(dir, fixture); const key = JSON.parse(await readFile(join(dir, 'identity.key.json'), 'utf8')).privateKey;
    await expect(reviewMission(dir, fixture.id, 'accepted', 'self', key)).rejects.toThrow('independent');
    await reviewMission(dir, fixture.id, 'rejected', 'Need measured evidence', reviewer.privateKey);
    await expect(reviewMission(dir, fixture.id, 'accepted', 'changed', reviewer.privateKey)).rejects.toThrow('already reviewed');
  });
  it('does not promote local evidence into live settlement', async () => {
    await runMission(dir, fixture); await reviewMission(dir, fixture.id, 'accepted', 'review', reviewer.privateKey);
    const n = await loadNode(dir); expect(() => settlementPlan(n.config, n.runs.get(fixture.id), reviewer.address)).toThrow('Live ENS');
  });
  it('fails closed on a writer lock instead of risking duplicate work', async () => {
    await writeFile(join(dir, 'writer.lock'), 'interrupted'); await expect(runMission(dir, fixture)).rejects.toThrow('Node busy');
  });
  it('rejects missing evidence, non-finite economics and duplicate IDs', () => {
    const m = structuredClone(fixture); m.opportunities[0].sourceIds = ['absent']; expect(() => analyzeMission(m)).toThrow('Unknown evidence');
    m.opportunities[0].sourceIds = ['S1']; m.opportunities[0].benefit = Infinity; expect(() => analyzeMission(m)).toThrow();
    m.opportunities[0].benefit = 1; m.sources.push(m.sources[0]); expect(() => analyzeMission(m)).toThrow('Duplicate');
  });
  it('abstains when no opportunity meets the risk policy', () => {
    const m = structuredClone(fixture); m.policy.maxCost = 0; expect(analyzeMission(m).recommendation).toBe(null);
  });
  it('rejects chain and ENS mismatches in live identity checks', async () => {
    const n = await loadNode(dir); const c = { ...n.config, mode: 'live' };
    await expect(verifyIdentity({ ...c, ensName: 'unrelated.eth' })).rejects.toThrow('direct subname');
    await expect(verifyIdentity(c, { provider: { getNetwork: async () => ({ chainId: 2n }) } })).rejects.toThrow('mainnet');
    await expect(verifyIdentity(c, { provider: { getNetwork: async () => ({ chainId: 1n }), resolveName: async () => reviewer.address } })).rejects.toThrow('ENS address');
  });
  it('prevents replacing an existing node identity', async () => {
    await expect(initializeNode(dir, { ensName: 'other.alpha.node.agi.eth' })).rejects.toThrow('already initialized');
  });
});

describe('bounded provider transport', () => {
  it('makes an actual HTTP request and records response provenance (fixture server, not a live model)', async () => {
    let request;
    const server = createServer(async (req, res) => { let raw = ''; for await (const chunk of req) raw += chunk; request = JSON.parse(raw); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ model: 'fixture', choices: [{ message: { content: 'S1 supports a caching experiment; savings need measurement.' }, finish_reason: 'stop' }], usage: { total_tokens: 30 } })); });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try {
      const result = await inferNarrative(fixture, analyzeMission(fixture), { url: `http://127.0.0.1:${server.address().port}`, model: 'fixture', maxTokens: 100 });
      expect(request.max_tokens).toBe(100); expect(result.model).toBe('fixture'); expect(result.text).toContain('S1');
    } finally { await new Promise(r => server.close(r)); }
  });
  it('rejects nonlocal plaintext, provider failure and empty results', async () => {
    const c = { url: 'http://example.com', model: 'm', maxTokens: 1 };
    await expect(inferNarrative(fixture, {}, c)).rejects.toThrow('HTTPS');
    c.url = 'https://example.com'; await expect(inferNarrative(fixture, {}, c, { fetchImpl: async () => new Response('', { status: 429 }) })).rejects.toThrow('429');
    await expect(inferNarrative(fixture, {}, c, { fetchImpl: async () => Response.json({ choices: [] }) })).rejects.toThrow('empty');
  });
});
