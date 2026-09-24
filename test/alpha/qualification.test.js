import { it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Wallet } from 'ethers';
import { digest } from '../../src/alpha/mission.js';
import { initializeNode, loadNode, atomicJson } from '../../src/alpha/node.js';
import {
  qualificationSummary,
  signAssurance,
  verifyAssurance,
  assuranceContext,
  qualifyNode,
} from '../../src/alpha/qualification.js';
import { assessMeasurement } from '../../src/alpha/measurement.js';
import {
  measurementContract,
  measurementFixture,
} from './fixtures/measurement.js';
let dir, node, assessor, context, now, policy;
const roles = ['security', 'recovery', 'operations', 'reviewer-independence'];
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'alpha-qual-'));
  now = Date.now();
  assessor = Wallet.createRandom();
  await initializeNode(dir, {
    ensName: 'qualification.alpha.node.agi.eth',
    reviewer: Wallet.createRandom().address,
  });
  node = await loadNode(dir);
  policy = {
    requireLiveIdentity: false,
    minConfirmedClaims: 0,
    minMeasuredMissions: 1,
    assessors: Object.fromEntries(roles.map((r) => [r, assessor.address])),
  };
  context = {
    node,
    policy,
    softwareDigest: digest('fixture-software'),
    configurationDigest: digest('fixture-config'),
  };
});
afterEach(async () => rm(dir, { recursive: true, force: true }));
const body = (role) => ({
  type: 'agialpha-assurance-v1',
  node: node.config.address,
  role,
  softwareDigest: context.softwareDigest,
  configurationDigest: context.configurationDigest,
  issuedAt: new Date(now).toISOString(),
  expiresAt: new Date(now + 86400000).toISOString(),
  artifactHash: digest('explicit synthetic assessment artifact'),
  statement: 'Synthetic test role, not an actual independent assessment.',
});
function addMeasuredRun(i = 0) {
  const measurement = measurementFixture(i, { now });
  const run = {
    at: new Date(now - 200000).toISOString(),
    hash: digest(`fixture-run-${i}`),
    mission: { id: `fixture-${i}`, measurement: measurementContract },
    review: { decision: 'accepted' },
    outcome: {
      type: 'outcome-attestation-v2',
      hash: digest(`fixture-outcome-${i}`),
      observedAt: measurement.observedAt,
      measurement,
      assessment: assessMeasurement(measurement, {
        measurement: measurementContract,
      }),
    },
  };
  node.runs.set(run.mission.id, run);
  return run;
}
it('blocks incomplete cost coverage and includes failed-attempt costs and effort once accounted', () => {
  addMeasuredRun();
  const cycle = digest('unaccounted attempt');
  node.state.events.push({
    type: 'operation',
    phase: 'failed',
    cycle,
    missionId: 'failed',
    at: new Date(now - 1000).toISOString(),
    reservedMicroUsd: 0,
  });
  let r = qualificationSummary(node, policy, { now });
  expect(r.metrics.costCoverageComplete).toBe(false);
  expect(r.checks.find((c) => c.id === 'net-value').passed).toBe(false);
  node.expenses.set(cycle, {
    cycle,
    hash: digest('expense'),
    evidenceHash: digest('invoice'),
    costUsd: 80,
    humanMinutes: 40,
    observedAt: new Date(now).toISOString(),
  });
  r = qualificationSummary(node, policy, { now });
  expect(r.metrics.costCoverageComplete).toBe(true);
  expect(r.metrics.netUsd).toBe(-5);
  expect(r.metrics.humanMinutesPerUsefulResult).toBe(42);
  expect(r.checks.find((c) => c.id === 'loss-rate').passed).toBe(false);
  node.runs.set('unmeasured', {
    at: new Date(now).toISOString(),
    hash: digest('unmeasured'),
    mission: { id: 'unmeasured' },
  });
  expect(
    qualificationSummary(node, policy, { now }).metrics.uncoveredRuns,
  ).toBe(1);
});
it('accounts rejected work without giving credit for its nominal benefit', () => {
  const run = addMeasuredRun();
  run.review.decision = 'rejected';
  run.outcome.measurement.candidate.acceptedUnits = 0;
  run.outcome.assessment = assessMeasurement(
    run.outcome.measurement,
    run.mission,
  );
  const r = qualificationSummary(node, policy, { now });
  expect(r.metrics.costCoverageComplete).toBe(true);
  expect(r.metrics.netUsd).toBe(-5);
  expect(r.metrics.usefulResults).toBe(0);
  expect(r.metrics.losses).toBe(1);
});
it('blocks an empty local node and names the missing evidence without exposing private configuration', async () => {
  const r = await qualifyNode(dir);
  expect(r.gatePassed).toBe(false);
  expect(r.metrics.measuredMissions).toBe(0);
  expect(r.checks.find((c) => c.id === 'live-identity').passed).toBe(false);
  expect(r.verifiedAssurances).toHaveLength(0);
  expect(JSON.stringify(r)).not.toContain('rpcUrl');
  expect(JSON.stringify(r)).not.toContain('privateKey');
});
it('accepts only current allowlisted role signatures bound to software, configuration and node', async () => {
  const signed = await signAssurance(body('security'), assessor.privateKey);
  expect(verifyAssurance(signed, context).signer).toBe(
    assessor.address.toLowerCase(),
  );
  for (const changed of [
    { softwareDigest: digest('updated') },
    { configurationDigest: digest('new-authority') },
    { policy: { assessors: {} } },
  ])
    expect(() => verifyAssurance(signed, { ...context, ...changed })).toThrow();
  expect(() => verifyAssurance(signed, context, now + 2 * 86400000)).toThrow(
    'current',
  );
  expect(() =>
    verifyAssurance(
      {
        ...signed,
        statement: 'Tampered assessment statement after signature.',
      },
      context,
    ),
  ).toThrow('hash');
  const self = { ...body('security'), node: assessor.address };
  await expect(signAssurance(self, assessor.privateKey)).rejects.toThrow(
    'differ',
  );
  await expect(
    signAssurance(
      {
        ...body('security'),
        expiresAt: new Date(now + 100 * 86400000).toISOString(),
      },
      assessor.privateKey,
    ),
  ).rejects.toThrow('90 days');
});
it('never treats the reviewer as an independent assessor of their own independence', async () => {
  const reviewer = Wallet.createRandom();
  node.config.reviewer = reviewer.address;
  context.policy.assessors['reviewer-independence'] = reviewer.address;
  const signed = await signAssurance(
    body('reviewer-independence'),
    reviewer.privateKey,
  );
  expect(() => verifyAssurance(signed, context)).toThrow('authorized');
});
it('can satisfy explicit local evidence gates with synthetic fixtures without claiming live commissioning', async () => {
  addMeasuredRun();
  const assurances = await Promise.all(
    roles.map((r) => signAssurance(body(r), assessor.privateKey)),
  );
  const r = qualificationSummary(node, policy, { ...context, assurances, now });
  expect(r.gatePassed).toBe(true);
  expect(r.scope).toBe('local-owner-policy-evidence');
  expect(r.metrics.netUsd).toBe(75);
  expect(r.metrics.humanMinutesPerUsefulResult).toBe(2);
  expect(r.verifiedAssurances).toHaveLength(4);
  const live = qualificationSummary(
    node,
    { ...policy, requireLiveIdentity: true },
    { ...context, assurances, now },
  );
  expect(live.gatePassed).toBe(false);
});
it('excludes legacy, historical, duplicate, overlapping and future measurements from admission', () => {
  const a = addMeasuredRun();
  node.runs.set('dup', { ...a, hash: digest('duplicate') });
  node.runs.set('legacy', {
    ...a,
    outcome: { type: 'outcome-attestation-v1' },
  });
  const future = structuredClone(a);
  future.outcome.observedAt = new Date(now + 10000).toISOString();
  node.runs.set('future', future);
  const early = structuredClone(a);
  early.at = new Date(now).toISOString();
  node.runs.set('pre-admission', early);
  const r = qualificationSummary(node, policy, { now });
  expect(r.metrics.measuredMissions).toBe(1);
  expect(r.metrics.excludedMeasurements).toBe(4);
});
it('fails on measured losses, excess human effort, old reviews and interrupted obligations', () => {
  const a = addMeasuredRun();
  a.outcome.assessment.netUsd = -5;
  a.outcome.assessment.humanMinutes = 100;
  node.runs.set('old', { at: new Date(now - 80 * 3600000).toISOString() });
  node.state.events.push({
    type: 'operation',
    phase: 'reserved',
    at: new Date(now).toISOString(),
    cycle: 'unfinished',
    missionId: 'x',
    reservedMicroUsd: 1,
  });
  node.runtime.set('tx:prepared', {
    topic: 'transaction-prepared',
    id: 'tx:prepared',
    at: new Date(now).toISOString(),
    data: {},
  });
  const r = qualificationSummary(node, policy, { now });
  for (const id of [
    'net-value',
    'loss-rate',
    'human-effort',
    'review-capacity',
    'recovery',
  ])
    expect(r.checks.find((c) => c.id === id).passed).toBe(false);
});
it('checks filesystem assessments against current source and settings and reports rejected scope changes', async () => {
  await atomicJson(join(dir, 'qualification.json'), policy);
  context = await assuranceContext(dir);
  const signed = await signAssurance(body('security'), assessor.privateKey);
  await mkdir(join(dir, 'assurances'));
  await atomicJson(join(dir, 'assurances', 'security.json'), signed);
  expect((await qualifyNode(dir)).verifiedAssurances).toHaveLength(1);
  await atomicJson(join(dir, 'engine.json'), { schema: 1, maxDailyActions: 2 });
  const r = await qualifyNode(dir);
  expect(r.verifiedAssurances).toHaveLength(0);
  expect(r.rejectedAssurances[0].reason).toContain('scope');
  await writeFile(join(dir, 'assurances', 'broken.json'), '{}');
  expect((await qualifyNode(dir)).rejectedAssurances.length).toBe(2);
});
