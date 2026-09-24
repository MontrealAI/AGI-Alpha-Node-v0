import { it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Wallet } from 'ethers';
import {
  workSchema,
  executeWork,
  makeWorkMission,
  workCsv,
  verifyWorkFiles,
  workDigest,
} from '../../src/alpha/work.js';
import {
  inferWorkBrief,
  validateWorkBrief,
} from '../../src/alpha/work-brief.js';
import {
  initializeNode,
  loadNode,
  exportMission,
  readJson,
  atomicJson,
  signDetachedReview,
  importDetachedReview,
  verifyEvidenceBundle,
  runMission,
} from '../../src/alpha/node.js';
import { operate } from '../../src/alpha/runtime/engine.js';
import { measurementContract } from './fixtures/measurement.js';
import { operatorServer } from '../../src/alpha/operator.js';
import {
  reviewAdmission,
  operationStatus,
} from '../../src/alpha/operations.js';
const samples = Object.fromEntries(
  await Promise.all(
    ['invoices', 'allocation', 'quality'].map(async (name) => [
      name,
      JSON.parse(await readFile(`examples/alpha/work-${name}.json`)),
    ]),
  ),
);
const pipeline = JSON.parse(await readFile('examples/alpha/pipeline.json'));
let dir, reviewer;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'alpha-work-'));
  reviewer = Wallet.createRandom();
  await initializeNode(dir, {
    ensName: 'work.alpha.node.agi.eth',
    reviewer: reviewer.address,
  });
});
afterEach(async () => rm(dir, { recursive: true, force: true }));
it('reconciles quantities, exact monetary discrepancies, missing rates and repeated references without double-counting alerts', () => {
  const w = structuredClone(samples.invoices.work),
    r = executeWork(w);
  expect(r.summary.knownRateOverbillingMicroUsd).toBe('11000000');
  expect(r.summary.duplicateInvoiceReferences).toEqual(['invoice-1-line-2']);
  expect(
    r.rows.find((r) => r.serviceId === 'storage').priceMismatchLineIds,
  ).toEqual(['i2', 'i3']);
  w.invoices.push({
    id: 'unknown',
    reference: 'unknown',
    serviceId: 'missing',
    units: '1',
    amountMicroUsd: '999',
  });
  expect(executeWork(w).summary.unknownRateServices).toEqual(['missing']);
  w.rates[0].unitPriceMicroUsd = '9007199254740993';
  w.usage[0].units = '2';
  w.invoices[0].units = '2';
  w.invoices[0].amountMicroUsd = '18014398509481987';
  expect(
    executeWork(w).rows.find((r) => r.serviceId === 'compute').varianceMicroUsd,
  ).toBe('1');
});
it('finds the exact bounded allocation, rejects greedy choices and treats reviewer time as a binding resource', () => {
  const w = structuredClone(samples.allocation.work);
  expect(executeWork(w).summary.selectedIds).toEqual(['b', 'c']);
  w.capacity.reviewMinutes = 10;
  expect(executeWork(w).summary.selectedIds).toEqual(['b']);
  w.capacity.reviewMinutes = 0;
  expect(executeWork(w).summary.selectedIds).toEqual([]);
});
it('agrees with a separate dynamic-programming oracle across generated multi-resource allocations', async () => {
  const records = [];
  let seed = 77;
  const random = (n) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % n;
  };
  for (let trial = 0; trial < 80; trial++) {
    const rows = Array.from({ length: 7 }, (_, i) => ({
      id: `c${i}`,
      benefitMicroUsd: String(random(30)),
      costMicroUsd: String(random(8)),
      riskReserveMicroUsd: String(random(3)),
      computeUnits: random(5),
      reviewMinutes: random(4),
    }));
    let states = new Map([['0,0,0', 0]]);
    for (const r of rows) {
      const next = new Map(states);
      for (const [key, value] of states) {
        const [a, b, c] = key.split(',').map(Number),
          cost = Number(r.costMicroUsd) + Number(r.riskReserveMicroUsd),
          target = [a + cost, b + r.computeUnits, c + r.reviewMinutes];
        if (target[0] <= 15 && target[1] <= 8 && target[2] <= 7) {
          const k = target.join(','),
            v = value + Number(r.benefitMicroUsd) - cost;
          next.set(k, Math.max(next.get(k) ?? -Infinity, v));
        }
      }
      states = next;
    }
    const result = executeWork({
      kind: 'resource-allocation',
      capacity: { capitalMicroUsd: '15', computeUnits: 8, reviewMinutes: 7 },
      candidates: rows,
    });
    expect(Number(result.summary.declaredNetMicroUsd)).toBe(
      Math.max(...states.values()),
    );
    expect(result.summary.examinedSubsets).toBe(128);
    records.push({
      trial,
      candidates: rows,
      capacity: { capitalMicroUsd: '15', computeUnits: 8, reviewMinutes: 7 },
      expectedNetMicroUsd: String(Math.max(...states.values())),
      actual: result.summary,
    });
  }
  if (process.env.ALPHA_ALLOCATION_OUTPUT)
    await writeFile(
      process.env.ALPHA_ALLOCATION_OUTPUT,
      JSON.stringify(
        {
          schema: 1,
          synthetic: true,
          seed: 77,
          reference:
            'Independent dynamic-programming implementation in test/alpha/work.test.js',
          cases: records,
        },
        null,
        2,
      ) + '\n',
    );
});
it('audits explicit rules and keeps absent fields distinct from inherited object properties', () => {
  const w = structuredClone(samples.quality.work);
  expect(executeWork(w).summary).toEqual({
    inputRows: 3,
    rules: 4,
    violations: 4,
    affectedRows: 2,
    passingRows: 1,
  });
  w.rules.push({ id: 'own-field', kind: 'required', field: 'constructor' });
  expect(
    executeWork(w).rows.filter((r) => r.ruleId === 'own-field'),
  ).toHaveLength(3);
  w.rows[1].values.quantity = '7';
  expect(executeWork(w).rows.some((r) => r.ruleId === 'quantity-range')).toBe(
    true,
  );
});
it('bounds work, rejects ambiguous IDs and protects CSV consumers from formula injection', () => {
  const w = structuredClone(samples.allocation.work);
  w.candidates.push(w.candidates[0]);
  expect(() => workSchema.parse(w)).toThrow('Duplicate');
  const q = structuredClone(samples.quality.work);
  q.rules[2].min = 1001;
  expect(() => executeWork(q)).toThrow('range');
  const invoice = structuredClone(samples.invoices.work);
  invoice.invoices[0].amountMicroUsd = '1.2';
  expect(() => executeWork(invoice)).toThrow();
  expect(
    workCsv({
      rows: [
        { value: '=HYPERLINK("https://example.invalid")', other: '\t+cmd' },
      ],
    }),
  ).toContain('TEXT: =HYPERLINK');
  expect(workCsv({ rows: [{ value: '@SUM(1)' }] })).toContain('TEXT: @SUM');
  expect(workCsv({ rows: [{ value: '＝1+1' }] })).toContain('TEXT: ＝1+1');
});
it('does not let callers mutate cached computations and evaluates the maximum finite candidate set', () => {
  const work = structuredClone(samples.allocation.work),
    first = executeWork(work);
  first.summary.selectedIds.push('fabricated');
  first.facts[0].text = 'fabricated';
  expect(executeWork(work).summary.selectedIds).toEqual(['b', 'c']);
  expect(executeWork(work).facts[0].text).not.toBe('fabricated');
  work.candidates = Array.from({ length: 16 }, (_, i) => ({
    id: `c${i}`,
    benefitMicroUsd: '2',
    costMicroUsd: '1',
    riskReserveMicroUsd: '0',
    computeUnits: 1,
    reviewMinutes: 1,
  }));
  work.capacity = { capitalMicroUsd: '8', computeUnits: 8, reviewMinutes: 8 };
  const result = executeWork(work);
  expect(result.summary.examinedSubsets).toBe(65536);
  expect(result.summary.declaredNetMicroUsd).toBe('8');
});
it('allows model prioritization only through existing computed facts and rejects fabricated prose', async () => {
  const result = executeWork(samples.invoices.work);
  const request = async () => ({
    text: JSON.stringify({ factIds: ['total', 'duplicates'] }),
    model: 'fixture',
    kind: 'provider-response',
  });
  const brief = await inferWorkBrief(result, {}, request, {});
  expect(brief.text).toContain('11000000');
  expect(validateWorkBrief(brief, result)).toBe(brief);
  expect(() =>
    validateWorkBrief({ ...brief, text: 'Guaranteed profit' }, result),
  ).toThrow('unsupported');
  for (const value of [
    { factIds: ['invented'] },
    { factIds: ['total', 'total'] },
    { factIds: ['total'], claims: 'invented profit' },
  ])
    await expect(
      inferWorkBrief(
        result,
        {},
        async () => ({ text: JSON.stringify(value) }),
        {},
      ),
    ).rejects.toThrow();
  expect(
    (
      await inferWorkBrief(
        result,
        {},
        async () => ({ text: '{"factIds":[]}' }),
        {},
      )
    ).text,
  ).toContain('abstained');
});
it.each(['invoices', 'allocation', 'quality'])(
  'runs %s through admission, signed review, independent recomputation, exports and replay',
  async (name) => {
    const source = { ...samples[name], observedAt: new Date().toISOString() };
    if (name === 'invoices') source.measurement = measurementContract;
    await atomicJson(join(dir, 'source.json'), source);
    await atomicJson(join(dir, 'pipeline.json'), {
      ...pipeline,
      source: 'source.json',
      sourceKind: 'work',
      policy: { ...pipeline.policy, minExpectedNet: 0 },
    });
    await atomicJson(join(dir, 'engine.json'), { schema: 1 });
    const first = await operate(dir),
      id = first.discovery.missionId;
    expect(first.discovery.status).toBe('awaiting-review');
    const out = await exportMission(dir, id, join(dir, 'out')),
      bundle = await readJson(out.evidence);
    expect(bundle.run.analysis.work).toEqual(executeWork(source.work));
    expect(
      (await verifyWorkFiles(join(dir, 'out'), bundle.run.analysis.work))
        .verified,
    ).toBe(true);
    expect(verifyEvidenceBundle(bundle).verified).toBe(true);
    await importDetachedReview(
      dir,
      await signDetachedReview(
        bundle,
        'accepted',
        'Controlled fixture review of recomputed analytical results.',
        reviewer.privateKey,
      ),
    );
    expect((await operate(dir)).discovery.status).toBe('replayed');
    expect(
      operationStatus(await loadNode(dir)).dailyReservedReviewMinutes,
    ).toBe(15);
    await writeFile(out.workCsv, 'substitution');
    await expect(
      verifyWorkFiles(join(dir, 'out'), bundle.run.analysis.work),
    ).rejects.toThrow('differ');
  },
);
it('exposes authenticated work downloads without keys and rejects artifact symlinks', async () => {
  const mission = makeWorkMission({
    ...samples.quality,
    observedAt: new Date().toISOString(),
  });
  await runMission(dir, mission);
  const out = await exportMission(dir, mission.id, join(dir, 'out')),
    bundle = await readJson(out.evidence);
  const { server, url, token } = await operatorServer(dir);
  try {
    const base = new URL(url).origin;
    expect((await fetch(`${base}/api/work?id=${mission.id}`)).status).toBe(401);
    const r = await fetch(`${base}/api/work?id=${mission.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      data = await r.json();
    expect(data.result).toEqual(bundle.run.analysis.work);
    expect(data.csv).toBe(workCsv(data.result));
    expect(JSON.stringify(data)).not.toContain('privateKey');
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
  await rm(out.workCsv);
  await symlink(out.report, out.workCsv);
  await expect(
    verifyWorkFiles(join(dir, 'out'), bundle.run.analysis.work),
  ).rejects.toThrow();
});
it('blocks autonomous work before inference when review minutes or deadlines are exhausted', async () => {
  const n = await loadNode(dir),
    now = Date.now();
  n.runs.set('pending', {
    at: new Date(now).toISOString(),
    mission: { id: 'pending' },
    review: null,
  });
  expect(() =>
    reviewAdmission(n, { ...pipeline, maxPendingReviewMinutes: 20 }, now),
  ).toThrow('capacity');
  n.runs.get('pending').at = new Date(now - 73 * 3600000).toISOString();
  expect(() => reviewAdmission(n, pipeline, now)).toThrow('Overdue');
  n.runs.clear();
  n.state.events.push({
    type: 'operation',
    phase: 'reserved',
    cycle: workDigest('failed'),
    missionId: 'failed',
    at: new Date(now).toISOString(),
    reservedMicroUsd: 0,
    reservedReviewMinutes: 120,
  });
  n.state.events.push({
    type: 'operation',
    phase: 'failed',
    cycle: workDigest('failed'),
    missionId: 'failed',
    at: new Date(now).toISOString(),
    reservedMicroUsd: 0,
  });
  expect(() =>
    reviewAdmission(n, { ...pipeline, maxDailyReviewMinutes: 120 }, now),
  ).toThrow('reviewer-time');
});
