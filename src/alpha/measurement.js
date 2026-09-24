import { z } from 'zod';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../utils/canonicalize.js';
import { open, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';

const fingerprint = (x) =>
  '0x' + createHash('sha256').update(canonicalJson(x)).digest('hex');
const money = z.number().finite().nonnegative().max(1e12);
const hash = z.string().regex(/^0x[a-f0-9]{64}$/);
export const measurementContractSchema = z
  .object({
    taskKey: z.string().min(1).max(100),
    method: z.literal('paired-value-v1'),
    unit: z.literal('USD'),
    periodSeconds: z.number().int().min(1).max(31536000),
    workloadHash: hash,
    acceptanceHash: hash,
  })
  .strict();
const windowSchema = z
  .object({
    startedAt: z.string().datetime(),
    endedAt: z.string().datetime(),
    workUnits: z.number().int().min(1).max(1e12),
    acceptedUnits: z.number().int().nonnegative().max(1e12),
    grossValueUsd: money,
    operatingCostUsd: money,
  })
  .strict();
export const pairedMeasurementSchema = z
  .object({
    kind: z.literal('paired-value-v1'),
    evidenceClass: z.enum(['observed', 'modeled', 'fixture']),
    contract: measurementContractSchema,
    baseline: windowSchema,
    candidate: windowSchema,
    overhead: z
      .object({
        inferenceUsd: money,
        executionUsd: money,
        reviewUsd: money,
        infrastructureUsd: money,
        settlementUsd: money,
        otherUsd: money,
      })
      .strict(),
    humanMinutes: z.number().finite().nonnegative().max(1e7),
    artifacts: z
      .array(
        z
          .object({ sha256: hash, description: z.string().min(1).max(500) })
          .strict(),
      )
      .min(1)
      .max(30),
    observedAt: z.string().datetime(),
    evidence: z.string().min(1).max(10000),
  })
  .strict();

export function assessMeasurement(input, mission) {
  const m = pairedMeasurementSchema.parse(input);
  if (
    !mission.measurement ||
    fingerprint(m.contract) !== fingerprint(mission.measurement)
  )
    throw new Error('Measurement contract does not match the signed mission');
  for (const w of [m.baseline, m.candidate]) {
    if (
      Date.parse(w.endedAt) - Date.parse(w.startedAt) !==
      m.contract.periodSeconds * 1000
    )
      throw new Error('Measurement windows must match the contracted period');
    if (w.acceptedUnits > w.workUnits)
      throw new Error('Accepted units exceed work units');
  }
  if (
    m.baseline.workUnits !== m.candidate.workUnits ||
    Date.parse(m.baseline.endedAt) > Date.parse(m.candidate.startedAt)
  )
    throw new Error(
      'Comparable work units and nonoverlapping ordered windows required',
    );
  if (Date.parse(m.observedAt) < Date.parse(m.candidate.endedAt))
    throw new Error('Outcome predates measurement completion');
  if (new Set(m.artifacts.map((a) => a.sha256)).size !== m.artifacts.length)
    throw new Error('Duplicate measurement artifacts');
  const operatingImprovement =
    m.candidate.grossValueUsd -
    m.baseline.grossValueUsd +
    m.baseline.operatingCostUsd -
    m.candidate.operatingCostUsd;
  const overheadUsd = Object.values(m.overhead).reduce((a, b) => a + b, 0);
  const measuredBenefitUsd = Math.max(0, operatingImprovement);
  const measuredCostUsd = overheadUsd + Math.max(0, -operatingImprovement);
  if (measuredBenefitUsd > 1e12 || measuredCostUsd > 1e12)
    throw new Error('Measured totals exceed limits');
  return {
    contractHash: fingerprint(m.contract),
    measuredBenefitUsd,
    measuredCostUsd,
    netUsd: measuredBenefitUsd - measuredCostUsd,
    overheadUsd,
    humanMinutes: m.humanMinutes,
    qualityPassed:
      m.candidate.acceptedUnits === m.candidate.workUnits &&
      m.baseline.acceptedUnits === m.baseline.workUnits,
    limitation:
      'Reviewer-attested paired observations. Matching scope and hashes do not prove causality, source truth or independent people.',
  };
}

export function comparableOutcome(run, mission) {
  return !!(
    mission?.measurement &&
    run.mission.measurement &&
    run.outcome?.type === 'outcome-attestation-v2' &&
    run.outcome.measurement.evidenceClass === 'observed' &&
    fingerprint(mission.measurement) === fingerprint(run.mission.measurement)
  );
}

export async function verifyMeasurementArtifacts(measurement, directory) {
  const m = pairedMeasurementSchema.parse(measurement);
  if (!(await lstat(directory)).isDirectory())
    throw new Error('Artifact directory must be a real directory');
  let bytes = 0;
  const verified = [];
  for (const artifact of m.artifacts) {
    const file = join(directory, `${artifact.sha256.slice(2)}.bin`);
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await handle.stat();
      if (!info.isFile()) throw new Error('Artifact must be a regular file');
      const h = createHash('sha256');
      for await (const chunk of handle.createReadStream({ autoClose: false })) {
        bytes += chunk.length;
        if (bytes > 64 * 1024 * 1024)
          throw new Error('Artifact verification exceeds 64 MiB');
        h.update(chunk);
      }
      if (`0x${h.digest('hex')}` !== artifact.sha256)
        throw new Error('Measurement artifact content hash mismatch');
      verified.push(artifact.sha256);
    } finally {
      await handle.close();
    }
  }
  return {
    verified,
    bytes,
    limitation:
      'Content hashes verified; authenticity, interpretation and measurement truth require review.',
  };
}
