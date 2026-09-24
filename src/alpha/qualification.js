import { readFile, readdir, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Wallet, verifyMessage, getAddress } from 'ethers';
import { z } from 'zod';
import { digest } from './mission.js';
import { loadNode, readJson, verifyIdentity } from './node.js';
import { operationStatus } from './operations.js';
import { auditPaidClaim } from './runtime/claim-audit.js';

const address = (x) => getAddress(x).toLowerCase();
const hash = z.string().regex(/^0x[a-f0-9]{64}$/);
const roles = ['security', 'recovery', 'operations', 'reviewer-independence'];
export const qualificationPolicySchema = z
  .object({
    schema: z.literal(1).default(1),
    lookbackDays: z.number().int().min(1).max(365).default(30),
    minMeasuredMissions: z.number().int().min(1).max(10000).default(5),
    minNetUsd: z.number().finite().nonnegative().max(1e9).default(0),
    maxLossFraction: z.number().min(0).max(1).default(0.2),
    maxHumanMinutesPerUsefulResult: z
      .number()
      .finite()
      .nonnegative()
      .max(1e6)
      .default(15),
    maxReviewAgeHours: z.number().min(1).max(720).default(72),
    requireLiveIdentity: z.boolean().default(true),
    minConfirmedClaims: z.number().int().min(0).max(5).default(1),
    assessors: z
      .record(
        z.enum(roles),
        z.string().refine((x) => {
          try {
            getAddress(x);
            return true;
          } catch {
            return false;
          }
        }),
      )
      .default({}),
  })
  .strict();
const assuranceSchema = z
  .object({
    type: z.literal('agialpha-assurance-v1'),
    node: z.string(),
    role: z.enum(roles),
    softwareDigest: hash,
    configurationDigest: hash,
    issuedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    artifactHash: hash,
    statement: z
      .string()
      .min(20)
      .max(4000)
      .refine(
        (s) => !s.includes('REPLACE_WITH_'),
        'Replace the assessment placeholder',
      ),
  })
  .strict();
export async function softwareFingerprint() {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const files = {};
  async function walk(path) {
    const info = await lstat(join(root, path));
    if (info.isSymbolicLink())
      throw new Error('Software fingerprint refuses symbolic links');
    if (info.isDirectory())
      for (const name of (await readdir(join(root, path))).sort())
        await walk(`${path}/${name}`);
    else if (info.isFile())
      files[path] = digest(
        (await readFile(join(root, path))).toString('base64'),
      );
  }
  for (const name of ['src', 'contracts', 'package.json', 'package-lock.json'])
    await walk(name);
  return { digest: digest(files), files: Object.keys(files).length };
}
async function optionalJson(path, fallback) {
  try {
    return await readJson(path, 100000);
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
}
export async function assuranceContext(dir) {
  const node = await loadNode(dir);
  const policy = qualificationPolicySchema.parse(
    await optionalJson(join(dir, 'qualification.json'), {}),
  );
  const pipeline = await optionalJson(join(dir, 'pipeline.json'), null);
  const engine = await optionalJson(join(dir, 'engine.json'), null);
  const software = await softwareFingerprint();
  return {
    node,
    policy,
    softwareDigest: software.digest,
    configurationDigest: digest({
      config: node.config,
      pipeline,
      engine,
      policy,
    }),
  };
}
export async function signAssurance(input, privateKey) {
  const body = assuranceSchema.parse(input);
  const wallet = new Wallet(privateKey);
  if (address(wallet.address) === address(body.node))
    throw new Error('Assessor must differ from node');
  validateAssuranceDates(body);
  const hash = digest(body);
  return { ...body, hash, signature: await wallet.signMessage(hash) };
}
function validateAssuranceDates(body, now = Date.now()) {
  const issued = Date.parse(body.issuedAt),
    expiry = Date.parse(body.expiresAt);
  if (
    issued > now + 60000 ||
    expiry <= now ||
    expiry <= issued ||
    expiry - issued > 90 * 86400000
  )
    throw new Error(
      'Assurance must be current, at most 90 days, and not future dated',
    );
}
export function verifyAssurance(input, context, now = Date.now()) {
  const { hash, signature, ...raw } = input;
  const body = assuranceSchema.parse(raw);
  if (
    digest(body) !== hash ||
    body.softwareDigest !== context.softwareDigest ||
    body.configurationDigest !== context.configurationDigest ||
    address(body.node) !== address(context.node.config.address)
  )
    throw new Error('Assurance scope or signature hash mismatch');
  const signer = address(verifyMessage(hash, signature));
  const expected = context.policy.assessors[body.role];
  if (
    !expected ||
    signer !== address(expected) ||
    signer === address(body.node) ||
    (body.role === 'reviewer-independence' &&
      signer === address(context.node.config.reviewer))
  )
    throw new Error('Assessor is not authorized for this role');
  validateAssuranceDates(body, now);
  return {
    role: body.role,
    signer,
    hash,
    artifactHash: body.artifactHash,
    expiresAt: body.expiresAt,
  };
}

export function qualificationSummary(
  node,
  policy = {},
  {
    now = Date.now(),
    identity = null,
    assurances = [],
    softwareDigest = null,
    configurationDigest = null,
    paidClaims = [],
  } = {},
) {
  const p = qualificationPolicySchema.parse(policy);
  const start = now - p.lookbackDays * 86400000;
  const runs = [...node.runs.values()];
  const candidates = runs
    .filter(
      (r) =>
        !!r.review &&
        r.outcome?.type === 'outcome-attestation-v2' &&
        r.outcome.measurement.evidenceClass === 'observed' &&
        Date.parse(r.outcome.observedAt) >= start &&
        Date.parse(r.outcome.observedAt) <= now &&
        Date.parse(r.outcome.measurement.candidate.startedAt) >=
          Date.parse(r.at),
    )
    .sort(
      (a, b) =>
        a.outcome.measurement.candidate.startedAt.localeCompare(
          b.outcome.measurement.candidate.startedAt,
        ) || a.hash.localeCompare(b.hash),
    );
  const cohortEnds = new Map(),
    artifacts = new Set();
  const measured = candidates.filter((r) => {
    const m = r.outcome.measurement,
      key = r.outcome.assessment.contractHash;
    const artifactKey = digest(m.artifacts.map((a) => a.sha256).sort());
    if (
      Date.parse(m.candidate.startedAt) < (cohortEnds.get(key) ?? -Infinity) ||
      artifacts.has(artifactKey)
    )
      return false;
    cohortEnds.set(key, Date.parse(m.candidate.endedAt));
    artifacts.add(artifactKey);
    return true;
  });
  const useful = measured.filter(
    (r) =>
      r.review.decision === 'accepted' &&
      r.outcome.assessment.qualityPassed &&
      r.outcome.assessment.netUsd > 0,
  );
  const losses = measured.filter(
    (r) =>
      r.outcome.assessment.netUsd < 0 || !r.outcome.assessment.qualityPassed,
  );
  const operations = operationStatus(node, now);
  const expenses = [...(node.expenses?.values() ?? [])].filter(
    (e) => Date.parse(e.observedAt) >= start && Date.parse(e.observedAt) <= now,
  );
  const measuredHashes = new Set(measured.map((r) => r.hash));
  const uncoveredRuns = runs.filter(
    (r) =>
      (Date.parse(r.at) >= start ||
        Date.parse(r.outcome?.observedAt) >= start) &&
      !measuredHashes.has(r.hash),
  );
  const expenseCycles = new Set(expenses.map((e) => e.cycle));
  const uncoveredFailures = operations.failedAttempts.filter(
    (e) => Date.parse(e.at) >= start && !expenseCycles.has(e.cycle),
  );
  const completeCosts =
    uncoveredRuns.length === 0 &&
    uncoveredFailures.length === 0 &&
    operations.unresolved.length === 0;
  const failedAttemptCostUsd = expenses.reduce((s, e) => s + e.costUsd, 0);
  const netUsd =
    measured.reduce(
      (s, r) =>
        s +
        (r.outcome.assessment.qualityPassed
          ? r.outcome.assessment.netUsd
          : -r.outcome.assessment.measuredCostUsd),
      0,
    ) - failedAttemptCostUsd;
  const humanMinutes = measured.reduce(
    (s, r) => s + r.outcome.assessment.humanMinutes,
    expenses.reduce((s, e) => s + e.humanMinutes, 0),
  );
  const humanPerUseful = useful.length ? humanMinutes / useful.length : null;
  const failedResults = losses.length + expenses.length;
  const accountedAttempts = measured.length + expenses.length;
  const events = [...node.runtime.values()];
  const unresolvedTransactions = events.filter(
    (e) =>
      e.topic === 'transaction-prepared' &&
      !node.runtime.has(e.id.replace(/:prepared$/, ':result')),
  ).length;
  const usefulHashes = new Set(useful.map((r) => r.hash));
  const claims = new Set(
    paidClaims.filter((c) => usefulHashes.has(c.runHash)).map((c) => c.runHash),
  ).size;
  const staleReviews = runs.filter(
    (r) => !r.review && now - Date.parse(r.at) > p.maxReviewAgeHours * 3600000,
  ).length;
  const context = { node, policy: p, softwareDigest, configurationDigest };
  const verified = [],
    rejected = [];
  for (const a of assurances) {
    try {
      verified.push(verifyAssurance(a, context, now));
    } catch (e) {
      rejected.push({ role: a.role ?? 'unknown', reason: e.message });
    }
  }
  const checks = [
    {
      id: 'live-identity',
      passed: !p.requireLiveIdentity || identity?.verified === true,
      detail: identity?.verified
        ? 'Fresh ENS/token identity check passed'
        : 'Live identity not freshly verified',
    },
    {
      id: 'measured-work',
      passed: measured.length >= p.minMeasuredMissions,
      detail: `${measured.length}/${p.minMeasuredMissions} comparable post-admission measurements`,
    },
    {
      id: 'cost-coverage',
      passed: completeCosts,
      detail: `${uncoveredRuns.length} runs without eligible observed measurements; ${uncoveredFailures.length} failed attempts without expenses; ${operations.unresolved.length} unresolved attempts`,
    },
    {
      id: 'net-value',
      passed: completeCosts && measured.length > 0 && netUsd >= p.minNetUsd,
      detail: `${netUsd} USD reviewer-attested net, including declared overhead and failed-attempt expenses; complete coverage: ${completeCosts}`,
    },
    {
      id: 'loss-rate',
      passed:
        completeCosts &&
        accountedAttempts > 0 &&
        failedResults / accountedAttempts <= p.maxLossFraction,
      detail: `${failedResults}/${accountedAttempts} loss, quality-failure or failed attempts`,
    },
    {
      id: 'human-effort',
      passed:
        humanPerUseful !== null &&
        humanPerUseful <= p.maxHumanMinutesPerUsefulResult,
      detail:
        humanPerUseful === null
          ? 'No useful measured result'
          : `${humanPerUseful} human minutes per useful result`,
    },
    {
      id: 'review-capacity',
      passed: staleReviews === 0,
      detail: `${staleReviews} reviews exceed the owner deadline`,
    },
    {
      id: 'recovery',
      passed:
        operations.unresolved.length === 0 && unresolvedTransactions === 0,
      detail: `${operations.unresolved.length} interrupted operations; ${unresolvedTransactions} unresolved transactions`,
    },
    {
      id: 'settlement',
      passed: claims >= p.minConfirmedClaims,
      detail: `${claims}/${p.minConfirmedClaims} freshly audited finalized claims for useful measured work`,
    },
    ...roles.map((role) => ({
      id: `assurance-${role}`,
      passed: verified.some((a) => a.role === role),
      detail: `Current owner-allowlisted ${role} assessment bound to this software and configuration`,
    })),
  ];
  return {
    schema: 1,
    scope: p.requireLiveIdentity
      ? 'live-owner-policy-evidence'
      : 'local-owner-policy-evidence',
    gatePassed: checks.every((c) => c.passed),
    observedAt: new Date(now).toISOString(),
    ledgerHead: node.head,
    softwareDigest,
    configurationDigest,
    policy: p,
    checks,
    verifiedAssurances: verified,
    rejectedAssurances: rejected,
    paidClaims,
    metrics: {
      measuredMissions: measured.length,
      excludedMeasurements:
        runs.filter((r) => r.outcome).length - measured.length,
      usefulResults: useful.length,
      losses: losses.length,
      failedAttempts: expenses.length,
      failedAttemptCostUsd,
      costCoverageComplete: completeCosts,
      uncoveredRuns: uncoveredRuns.length,
      uncoveredFailedAttempts: uncoveredFailures.length,
      netUsd,
      humanMinutes,
      humanMinutesPerUsefulResult: humanPerUseful,
      confirmedClaims: claims,
    },
    evidence: measured.map((r) => ({
      missionId: r.mission.id,
      runHash: r.hash,
      outcomeHash: r.outcome.hash,
      contractHash: r.outcome.assessment.contractHash,
    })),
    expenseEvidence: expenses.map((e) => ({
      cycle: e.cycle,
      expenseHash: e.hash,
      evidenceHash: e.evidenceHash,
    })),
    limitations: [
      'This is a configurable evidence admission gate, not certification of general intelligence, profitability or complete project fulfillment.',
      'Assessor signatures identify authorized keys. Their assertions, organizational independence and artifact contents require external verification.',
      'Cost completeness and measurement truth remain reviewer attestations. Matched windows do not prove causality.',
      'Legacy, pre-admission, future, duplicate and overlapping measurements do not count. RPC agreement does not establish independent provider operators.',
    ],
  };
}
export async function qualifyNode(dir) {
  const context = await assuranceContext(dir);
  let identity = null;
  try {
    identity = await verifyIdentity(context.node.config);
  } catch {
    /* Explicit missing live identity check below. */
  }
  let names = [];
  try {
    names = await readdir(join(dir, 'assurances'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  if (names.length > 100) throw new Error('Too many assurance files');
  const assurances = [];
  for (const name of names.filter((n) => n.endsWith('.json')).sort())
    assurances.push(await readJson(join(dir, 'assurances', name), 12000));
  const paidClaims = [];
  if (context.policy.minConfirmedClaims > 0 && identity?.verified) {
    const engine = await optionalJson(join(dir, 'engine.json'), {});
    const preliminary = qualificationSummary(context.node, context.policy, {
      ...context,
      identity,
      assurances,
    });
    const useful = preliminary.evidence.filter(
      (e) =>
        context.node.runs.get(e.missionId).outcome.assessment.qualityPassed &&
        context.node.runs.get(e.missionId).outcome.assessment.netUsd > 0,
    );
    const claimCandidates = useful.filter(
      (e) =>
        context.node.runtime.get(`tx:${e.runHash}:claim:result`)?.data
          .status === 'confirmed',
    );
    for (const e of claimCandidates.slice(-5)) {
      const run = context.node.runs.get(e.missionId),
        receipt = context.node.runtime.get(`tx:${run.hash}:claim:result`);
      if (receipt?.data.status !== 'confirmed' || !engine.transactions)
        continue;
      try {
        paidClaims.push(
          await auditPaidClaim(
            context.node.config,
            run,
            receipt.data.transactionHash,
            engine.transactions,
            [process.env.ALPHA_RPC_URL, process.env.ALPHA_SECOND_RPC_URL],
          ),
        );
      } catch {
        /* Missing or divergent chain proof leaves settlement gate open. */
      }
      if (paidClaims.length >= context.policy.minConfirmedClaims) break;
    }
  }
  return qualificationSummary(context.node, context.policy, {
    ...context,
    identity,
    assurances,
    paidClaims,
  });
}
