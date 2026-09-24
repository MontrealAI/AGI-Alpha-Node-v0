import { it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { Wallet } from 'ethers';
import {
  initializeNode,
  loadNode,
  readJson,
  exportMission,
  signDetachedReview,
  importDetachedReview,
  verifyEvidenceBundle,
  recordRuntime,
} from '../../src/alpha/node.js';
import { digest } from '../../src/alpha/mission.js';
import {
  discoverMission,
  cycle,
  operationStatus,
} from '../../src/alpha/operations.js';
import { operate } from '../../src/alpha/runtime/engine.js';
import {
  specialistServer,
  coordinateSpecialist,
} from '../../src/alpha/runtime/specialists.js';
import {
  validateSynthesis,
  synthesizeEvidence,
  validateModelResult,
} from '../../src/alpha/runtime/synthesis.js';
import { validateSpecialistReceipt } from '../../src/alpha/runtime/specialist-protocol.js';
const fixture = JSON.parse(
  await readFile('examples/alpha/opportunity-scan.json'),
);
const policy = JSON.parse(await readFile('examples/alpha/pipeline.json'));
let dir, reviewer, servers, calls, content, node, peer, config;
const synthesis = () => ({
  summary: 'Cited analytical deliverable; forecasts remain assumptions.',
  abstain: false,
  findings: [
    {
      claim: 'The supplied source supports testing, not guaranteed savings.',
      citations: [
        {
          sourceId: fixture.sources[0].id,
          quote: fixture.sources[0].text.slice(0, 80),
        },
      ],
    },
  ],
  counterarguments: [
    {
      text: 'Input measurements may be unrepresentative.',
      sourceIds: [fixture.sources[0].id],
    },
  ],
  experiments: [
    {
      action: 'Compare held-out workloads.',
      successCriterion:
        'All outputs match with lower fully costed resource use.',
      sourceIds: [fixture.sources[0].id],
    },
  ],
});
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'alpha-intelligence-'));
  reviewer = Wallet.createRandom();
  servers = [];
  calls = [];
  node = await initializeNode(dir, {
    ensName: 'research.alpha.node.agi.eth',
    reviewer: reviewer.address,
  });
  content = synthesis();
});
afterEach(async () => {
  for (const s of servers) {
    s.closeAllConnections();
    await new Promise((r) => s.close(r));
  }
  await rm(dir, { recursive: true, force: true });
});
async function startPeer(extra = {}) {
  const model = createServer(async (req, res) => {
    let raw = '';
    for await (const b of req) raw += b;
    calls.push(JSON.parse(raw));
    res.end(
      JSON.stringify({
        model: 'fixture-model',
        choices: [
          {
            message: { content: JSON.stringify(content) },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      }),
    );
  });
  await new Promise((r) => model.listen(0, '127.0.0.1', r));
  servers.push(model);
  const peerDir = join(dir, 'peer');
  const identity = await initializeNode(peerDir, {
    ensName: 'specialist.alpha.node.agi.eth',
  });
  const c = await readJson(join(peerDir, 'config.json'));
  c.provider = {
    url: `http://127.0.0.1:${model.address().port}/v1/chat/completions`,
    model: 'fixture-model',
    maxTokens: 500,
  };
  await writeFile(join(peerDir, 'config.json'), JSON.stringify(c));
  config = {
    allowedCallers: [node.address],
    capabilities: ['research-synthesis', 'adversarial-review'],
    priceMicroUsd: 1,
    maxDailyRequests: 5,
    reserveMicroUsdPerRequest: 5,
    maxDailyReservedMicroUsd: 25,
    ...extra,
  };
  peer = await specialistServer(peerDir, config);
  servers.push(peer.server);
  return [{ address: identity.address, url: peer.url }];
}
it('admits general missions with policy intersection, fresh evidence and stable content IDs', () => {
  const source = {
    schema: 1,
    observedAt: new Date().toISOString(),
    mission: fixture,
  };
  const p = {
    ...policy,
    policy: {
      ...policy.policy,
      maxCost: 2,
      maxDownside: 1,
      minExpectedNet: 100,
      stressBenefitBps: 2000,
    },
  };
  const m = discoverMission(source, p);
  expect(m.policy).toEqual(p.policy);
  expect(m.objective).toBe(fixture.objective);
  expect(discoverMission(source, p).id).toBe(m.id);
  expect(() =>
    discoverMission({ ...source, observedAt: '2000-01-01T00:00:00Z' }, p),
  ).toThrow('stale');
  expect(() =>
    discoverMission(
      { ...source, observedAt: new Date(Date.now() + 120000).toISOString() },
      p,
    ),
  ).toThrow('future');
  expect(() =>
    discoverMission(
      {
        ...source,
        mission: {
          ...fixture,
          sources: [
            ...fixture.sources,
            { id: 'input-observation', title: 'collision', text: 'data' },
          ],
        },
      },
      p,
    ),
  ).toThrow('Duplicate');
});
it('runs general evidence through an authenticated model specialist, exports the actual result and verifies before review', async () => {
  const peers = await startPeer();
  await writeFile(
    join(dir, 'source.json'),
    JSON.stringify({
      schema: 1,
      observedAt: new Date().toISOString(),
      mission: fixture,
    }),
  );
  await writeFile(
    join(dir, 'pipeline.json'),
    JSON.stringify({
      ...policy,
      sourceKind: 'mission',
      source: 'source.json',
      policy: fixture.policy,
    }),
  );
  await writeFile(
    join(dir, 'engine.json'),
    JSON.stringify({
      schema: 1,
      peers,
      specialistCapabilities: ['research-synthesis'],
      maxSpecialistPriceMicroUsd: 1,
    }),
  );
  const result = await operate(dir);
  expect(result.discovery.status).toBe('awaiting-review');
  const out = await exportMission(
    dir,
    result.discovery.missionId,
    join(dir, 'export'),
  );
  const bundle = await readJson(out.evidence);
  expect(bundle.run.report).toContain(content.findings[0].claim);
  expect(
    verifyEvidenceBundle(bundle, {
      expectedNode: node.address,
      expectedReviewer: reviewer.address,
    }).specialistReceipts,
  ).toBe(1);
  expect(calls[0].response_format.type).toBe('json_schema');
  await importDetachedReview(
    dir,
    await signDetachedReview(
      bundle,
      'accepted',
      'Synthetic role-separated fixture review.',
      reviewer.privateKey,
    ),
  );
  expect((await operate(dir)).discovery.status).toBe('replayed');
  expect(calls).toHaveLength(1);
  expect(operationStatus(await loadNode(dir)).dailyRuns).toBe(1);
});
it('reserves model cost before inference and never silently retries a failed citation check', async () => {
  const peers = await startPeer();
  content.findings[0].citations[0].quote =
    'fabricated quote absent from all supplied evidence';
  await expect(
    coordinateSpecialist(dir, fixture, 'research-synthesis', peers, 1),
  ).rejects.toThrow('400');
  content = synthesis();
  await expect(
    coordinateSpecialist(dir, fixture, 'research-synthesis', peers, 1),
  ).rejects.toThrow('400');
  expect(calls).toHaveLength(1);
  const n = await loadNode(join(dir, 'peer'));
  expect(
    [...n.runtime.values()].find((e) => e.id.endsWith(':reserved')).data
      .reservedMicroUsd,
  ).toBe(5);
});
it('enforces specialist inference budgets and replays only completed results', async () => {
  const peers = await startPeer({ maxDailyReservedMicroUsd: 5 });
  const a = await coordinateSpecialist(
    dir,
    fixture,
    'adversarial-review',
    peers,
    1,
  );
  expect(
    (await coordinateSpecialist(dir, fixture, 'adversarial-review', peers, 1))
      .hash,
  ).toBe(a.hash);
  await expect(
    coordinateSpecialist(
      dir,
      { ...fixture, id: 'second' },
      'adversarial-review',
      peers,
      1,
    ),
  ).rejects.toThrow('400');
  expect(calls).toHaveLength(1);
  expect(() =>
    validateSpecialistReceipt(
      a,
      { ...fixture, id: 'substitution' },
      node.address,
    ),
  ).toThrow('binding');
});
it('rejects an interrupted specialist reservation even with sufficient remaining budget', async () => {
  const peers = await startPeer();
  const id = digest({
    sender: node.address.toLowerCase(),
    recipient: peers[0].address.toLowerCase(),
    capability: 'research-synthesis',
    mission: fixture,
  });
  await recordRuntime(
    join(dir, 'peer'),
    'specialist',
    `specialist:${id}:reserved`,
    {
      requestId: id,
      capability: 'research-synthesis',
      caller: node.address.toLowerCase(),
      reservedMicroUsd: 5,
    },
  );
  await expect(
    coordinateSpecialist(dir, fixture, 'research-synthesis', peers, 1),
  ).rejects.toThrow('400');
  expect(calls).toHaveLength(0);
});
it('rejects missing providers, zero reservations and concurrent specialist process locks', async () => {
  const peers = await startPeer({ reserveMicroUsdPerRequest: 0 });
  await expect(
    coordinateSpecialist(dir, fixture, 'research-synthesis', peers, 1),
  ).rejects.toThrow('400');
  await writeFile(join(dir, 'peer', 'specialist.lock'), 'interrupted');
  await expect(
    coordinateSpecialist(dir, fixture, 'research-synthesis', peers, 1),
  ).rejects.toThrow('400');
  expect(calls).toHaveLength(0);
});
it('rejects invented citations, unknown fields, unsafe instructions as capabilities, and missing provenance', async () => {
  expect(() =>
    validateSynthesis(
      { ...synthesis(), shell: 'dangerous instruction' },
      fixture,
    ),
  ).toThrow();
  const x = synthesis();
  x.counterarguments[0].sourceIds = ['absent'];
  expect(() => validateSynthesis(x, fixture)).toThrow('Unknown');
  const empty = { ...synthesis(), findings: [] };
  expect(() => validateSynthesis(empty, fixture)).toThrow('cited');
  expect(validateSynthesis({ ...empty, abstain: true }, fixture).abstain).toBe(
    true,
  );
  await expect(synthesizeEvidence('shell', fixture, {})).rejects.toThrow(
    'capability',
  );
  await expect(
    synthesizeEvidence('research-synthesis', fixture, null),
  ).rejects.toThrow('provider');
  expect(() =>
    validateModelResult(
      {
        inputDigest: digest(fixture),
        capability: 'research-synthesis',
        validation: 'schema-and-exact-source-quotes',
        synthesis: synthesis(),
      },
      fixture,
      'research-synthesis',
    ),
  ).toThrow('provenance');
  expect(() => validateModelResult({}, fixture, 'research-synthesis')).toThrow(
    'binding',
  );
});
it('checks live identity before contacting any paid specialist', async () => {
  await writeFile(
    join(dir, 'source.json'),
    JSON.stringify({
      schema: 1,
      observedAt: new Date().toISOString(),
      mission: fixture,
    }),
  );
  await writeFile(
    join(dir, 'pipeline.json'),
    JSON.stringify({ ...policy, sourceKind: 'mission', source: 'source.json' }),
  );
  const c = await readJson(join(dir, 'config.json'));
  c.mode = 'live';
  await writeFile(join(dir, 'config.json'), JSON.stringify(c));
  let called = false;
  await expect(
    cycle(dir, join(dir, 'pipeline.json'), {
      afterReserved: () => {
        called = true;
      },
      identityProvider: { getNetwork: async () => ({ chainId: 2n }) },
    }),
  ).rejects.toThrow('mainnet');
  expect(called).toBe(false);
});
it('enforces qualification for new work without creating reservations', async () => {
  await writeFile(join(dir, 'pipeline.json'), JSON.stringify(policy));
  await writeFile(
    join(dir, 'engine.json'),
    JSON.stringify({ schema: 1, requireQualifiedAdmission: true }),
  );
  const result = await operate(dir);
  expect(result.status).toBe('qualification-blocked');
  expect(
    result.qualification.checks.find((c) => c.id === 'assurance-security')
      .passed,
  ).toBe(false);
  expect(operationStatus(await loadNode(dir)).dailyRuns).toBe(0);
});
it('constrains generated citations to source-bound excerpts including long inputs', async () => {
  const { quotationCatalog, synthesisJsonSchema } =
    await import('../../src/alpha/runtime/synthesis.js');
  const m = {
    sources: [
      { id: 'long', text: 'Long source sentence repeated. '.repeat(300) },
      { id: 'short', text: 'x' },
    ],
  };
  const catalog = quotationCatalog(m);
  expect(catalog).toHaveLength(1);
  expect(catalog[0].quotes.length).toBeLessThanOrEqual(6);
  for (const quote of catalog[0].quotes)
    expect(m.sources[0].text.includes(quote)).toBe(true);
  const schema = synthesisJsonSchema(m);
  expect(schema.additionalProperties).toBe(false);
  expect(
    schema.properties.findings.items.properties.citations.items.anyOf[0]
      .properties.sourceId.enum,
  ).toEqual(['long']);
  expect(() =>
    synthesisJsonSchema({ sources: [{ id: 'x', text: 'x' }] }),
  ).toThrow('eight');
  const { requestInference } = await import('../../src/alpha/mission.js');
  await expect(
    requestInference([], {
      url: 'https://example.com',
      model: 'test',
      maxTokens: 5,
      timeoutMs: 180001,
    }),
  ).rejects.toThrow('timeout');
});
