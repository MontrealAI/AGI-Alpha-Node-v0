import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtemp,
  readFile,
  rm,
  mkdir,
  writeFile,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Wallet } from 'ethers';
import { digest } from '../../src/alpha/mission.js';
import {
  assessMeasurement,
  verifyMeasurementArtifacts,
} from '../../src/alpha/measurement.js';
import {
  initializeNode,
  runMission,
  reviewMission,
  loadNode,
  exportMission,
  readJson,
  signOutcome,
  importOutcome,
  verifyEvidenceBundle,
  signDetachedReview,
} from '../../src/alpha/node.js';
import { planMission } from '../../src/alpha/runtime/planner.js';
import {
  measurementContract,
  measurementFixture,
} from './fixtures/measurement.js';
const fixture = {
  ...JSON.parse(await readFile('examples/alpha/opportunity-scan.json')),
  measurement: measurementContract,
};
let dir, reviewer, node, bundle;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'alpha-measured-'));
  reviewer = Wallet.createRandom();
  node = await initializeNode(dir, {
    ensName: 'measured.alpha.node.agi.eth',
    reviewer: reviewer.address,
  });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() - 200000);
  await runMission(dir, fixture);
  vi.useRealTimers();
  await reviewMission(
    dir,
    fixture.id,
    'accepted',
    'Synthetic fixture acceptance, not independent people.',
    reviewer.privateKey,
  );
  bundle = await readJson(
    (await exportMission(dir, fixture.id, join(dir, 'out'))).evidence,
  );
});
afterEach(async () => rm(dir, { recursive: true, force: true }));
it('derives fully costed benefit and losses from matched, signed observations', async () => {
  const m = measurementFixture();
  m.overhead.inferenceUsd = 3;
  const result = assessMeasurement(m, fixture);
  expect(result.netUsd).toBe(72);
  expect(result.measuredCostUsd).toBe(8);
  const signed = await signOutcome(bundle, m, reviewer.privateKey);
  expect(signed.type).toBe('outcome-attestation-v2');
  await importOutcome(dir, signed);
  const n = await loadNode(dir);
  expect(n.runs.get(fixture.id).outcome.assessment.netUsd).toBe(72);
  const verified = verifyEvidenceBundle(
    await readJson(
      (await exportMission(dir, fixture.id, join(dir, 'out'))).evidence,
    ),
  );
  expect(verified.reviewVerified && verified.outcomeVerified).toBe(true);
  const loss = assessMeasurement(
    measurementFixture(1, { baselineCost: 5, candidateCost: 20, overhead: 4 }),
    fixture,
  );
  expect(loss.measuredBenefitUsd).toBe(0);
  expect(loss.measuredCostUsd).toBe(19);
  expect(loss.netUsd).toBe(-19);
});
it('requires matching measurement contracts, windows, work units and all cost categories', () => {
  const cases = [
    (m) => {
      m.contract.workloadHash = digest('different workload');
    },
    (m) => {
      m.baseline.endedAt = m.baseline.startedAt;
    },
    (m) => {
      m.candidate.workUnits = 101;
    },
    (m) => {
      m.baseline.acceptedUnits = 101;
    },
    (m) => {
      delete m.overhead.reviewUsd;
    },
    (m) => {
      m.overhead.inferenceUsd = -1;
    },
    (m) => {
      m.observedAt = m.baseline.startedAt;
    },
    (m) => {
      m.artifacts.push(m.artifacts[0]);
    },
    (m) => {
      m.candidate.startedAt = m.baseline.startedAt;
      m.candidate.endedAt = m.baseline.endedAt;
    },
  ];
  for (const alter of cases) {
    const m = measurementFixture();
    alter(m);
    expect(() => assessMeasurement(m, fixture)).toThrow();
  }
  expect(() =>
    assessMeasurement(measurementFixture(), {
      ...fixture,
      measurement: undefined,
    }),
  ).toThrow('contract');
});
it('records quality failures and charges them as failed learning observations even when nominally profitable', async () => {
  const m = measurementFixture();
  m.candidate.acceptedUnits = 90;
  await importOutcome(dir, await signOutcome(bundle, m, reviewer.privateKey));
  const model = planMission(fixture, await loadNode(dir), {
    enabled: true,
  }).models.find((m) => m.recommendation === 'cache');
  expect(model.losses).toBe(1);
  expect(model.successes).toBe(0);
  expect(model.meanBenefitRatio).toBe(0);
});
it('rejects invented totals even when re-signed by the designated reviewer', async () => {
  const signed = await signOutcome(
    bundle,
    measurementFixture(),
    reviewer.privateKey,
  );
  const { hash, signature, ...body } = signed;
  body.measuredBenefitUsd = 999999;
  const h = digest(body);
  await expect(
    importOutcome(dir, {
      ...body,
      hash: h,
      signature: await reviewer.signMessage(h),
    }),
  ).rejects.toThrow('totals');
  body.measuredBenefitUsd = signed.measuredBenefitUsd;
  body.missionId = 'other';
  const changed = digest(body);
  await expect(
    importOutcome(dir, {
      ...body,
      hash: changed,
      signature: await reviewer.signMessage(changed),
    }),
  ).rejects.toThrow();
});
it('rejects future measurements and incorrect reviewer signatures', async () => {
  const m = measurementFixture();
  m.observedAt = new Date(Date.now() + 120000).toISOString();
  await expect(signOutcome(bundle, m, reviewer.privateKey)).rejects.toThrow(
    'future',
  );
  await expect(
    signOutcome(bundle, measurementFixture(), Wallet.createRandom().privateKey),
  ).rejects.toThrow('independent');
});
it('preserves legacy outcomes but excludes them and other cohorts from adaptation', async () => {
  await importOutcome(
    dir,
    await signOutcome(
      bundle,
      {
        measuredBenefitUsd: 1000,
        measuredCostUsd: 0,
        observedAt: new Date().toISOString(),
        evidence: 'Synthetic legacy record',
      },
      reviewer.privateKey,
    ),
  );
  const n = await loadNode(dir);
  const plan = planMission(fixture, n, { enabled: true });
  expect(plan.models.find((m) => m.recommendation === 'cache').samples).toBe(0);
  expect(
    plan.models.find((m) => m.recommendation === 'cache').excludedOutcomes,
  ).toBe(1);
  const run = n.runs.get(fixture.id);
  run.outcome = {
    type: 'outcome-attestation-v2',
    measurement: { evidenceClass: 'observed' },
  };
  expect(
    planMission(
      {
        ...fixture,
        measurement: { ...measurementContract, taskKey: 'unrelated' },
      },
      n,
    ).models.every((m) => m.samples === 0),
  ).toBe(true);
});
it('does not inflate sample counts with duplicate artifacts or overlapping observations', async () => {
  const m = measurementFixture();
  const signed = await signOutcome(bundle, m, reviewer.privateKey);
  await importOutcome(dir, signed);
  const n = await loadNode(dir);
  const run = n.runs.get(fixture.id);
  n.runs.set('duplicate', {
    ...run,
    hash: digest('second signed run fixture'),
  });
  n.runs.set('overlap', {
    ...run,
    hash: digest('third fixture'),
    outcome: {
      ...run.outcome,
      measurement: {
        ...m,
        artifacts: [
          {
            sha256: digest('different-artifact'),
            description: 'same observation window',
          },
        ],
      },
    },
  });
  const model = planMission(fixture, n, { enabled: true }).models.find(
    (m) => m.recommendation === 'cache',
  );
  expect(model.samples).toBe(1);
  expect(model.excludedOutcomes).toBe(2);
});
it('verifies expected parties and rejects a node-signed report containing false arithmetic before reviewer signing', async () => {
  expect(() =>
    verifyEvidenceBundle(bundle, {
      expectedNode: Wallet.createRandom().address,
    }),
  ).toThrow('expected party');
  expect(() =>
    verifyEvidenceBundle(bundle, {
      expectedReviewer: Wallet.createRandom().address,
    }),
  ).toThrow('expected party');
  const key = (await readJson(join(dir, 'identity.key.json'))).privateKey;
  const altered = structuredClone(bundle);
  const { hash, signature, review, outcome, ...body } = altered.run;
  body.analysis.rankings[0].expectedNet = 1000000;
  const h = digest(body);
  altered.run = {
    ...body,
    hash: h,
    signature: await new Wallet(key).signMessage(h),
    review: null,
  };
  await expect(
    signDetachedReview(
      altered,
      'accepted',
      'Should never sign incorrect arithmetic.',
      reviewer.privateKey,
    ),
  ).rejects.toThrow('computation');
  const forged = structuredClone(bundle);
  forged.run.review.notes = 'Changed after signature';
  expect(() => verifyEvidenceBundle(forged)).toThrow('review');
});
it('verifies actual artifact bytes and refuses substitutions, missing files and symbolic links', async () => {
  const path = join(dir, 'artifacts');
  await mkdir(path);
  const content = 'actual test file bytes';
  const hash = digest(content),
    file = join(path, `${hash.slice(2)}.bin`);
  const m = measurementFixture();
  m.artifacts = [
    { sha256: hash, description: 'Actual byte-integrity test file' },
  ];
  await writeFile(file, content);
  expect((await verifyMeasurementArtifacts(m, path)).bytes).toBe(
    Buffer.byteLength(content),
  );
  await writeFile(file, 'substituted');
  await expect(verifyMeasurementArtifacts(m, path)).rejects.toThrow('hash');
  await rm(file);
  await expect(verifyMeasurementArtifacts(m, path)).rejects.toThrow();
  await writeFile(join(dir, 'outside'), content);
  await symlink(join(dir, 'outside'), file);
  await expect(verifyMeasurementArtifacts(m, path)).rejects.toThrow();
});
it('rejects reviewer substitution and excludes explicitly modeled economic outcomes', async () => {
  const wrong = structuredClone(bundle);
  wrong.identity.reviewer = Wallet.createRandom().address;
  expect(() => verifyEvidenceBundle(wrong)).toThrow('signed node choice');
  const m = measurementFixture();
  m.evidenceClass = 'modeled';
  await importOutcome(dir, await signOutcome(bundle, m, reviewer.privateKey));
  const model = planMission(fixture, await loadNode(dir), {
    enabled: true,
  }).models.find((m) => m.recommendation === 'cache');
  expect(model.samples).toBe(0);
  expect(model.excludedOutcomes).toBe(1);
});
it('allows cost accounting for rejected work but forbids claiming accepted outputs', async () => {
  const rejected = { ...fixture, id: 'rejected-accounting' };
  await runMission(dir, rejected);
  await reviewMission(
    dir,
    rejected.id,
    'rejected',
    'Unusable output; account for its real cost.',
    reviewer.privateKey,
  );
  const b = await readJson(
    (await exportMission(dir, rejected.id, join(dir, 'rejected'))).evidence,
  );
  const m = measurementFixture();
  await expect(signOutcome(b, m, reviewer.privateKey)).rejects.toThrow(
    'accepted candidate',
  );
  m.candidate.acceptedUnits = 0;
  await importOutcome(dir, await signOutcome(b, m, reviewer.privateKey));
  expect(
    (await loadNode(dir)).runs.get(rejected.id).outcome.assessment
      .qualityPassed,
  ).toBe(false);
});
it('learns from rejected measured work and excludes pre-admission or future observations', async () => {
  const rejected = { ...fixture, id: 'rejected-learning' };
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() - 200000);
  await runMission(dir, rejected);
  vi.useRealTimers();
  await reviewMission(
    dir,
    rejected.id,
    'rejected',
    'Unusable output; retain this failure for learning.',
    reviewer.privateKey,
  );
  const b = await readJson(
      (await exportMission(dir, rejected.id, join(dir, 'rejected-learning')))
        .evidence,
    ),
    m = measurementFixture();
  m.candidate.acceptedUnits = 0;
  await importOutcome(dir, await signOutcome(b, m, reviewer.privateKey));
  const n = await loadNode(dir),
    model = () =>
      planMission(fixture, n, { enabled: true }).models.find(
        (m) => m.recommendation === 'cache',
      );
  expect(model().losses).toBe(1);
  expect(model().consecutiveLosses).toBe(1);
  const r = n.runs.get(rejected.id);
  r.at = new Date().toISOString();
  expect(model().samples).toBe(0);
  r.at = new Date(Date.now() - 200000).toISOString();
  r.outcome.observedAt = new Date(Date.now() + 60000).toISOString();
  expect(model().samples).toBe(0);
});
