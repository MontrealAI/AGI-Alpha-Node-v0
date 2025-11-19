import type { HexData } from './intentTypes.js';
import type { SignedIntentEnvelope } from './pqEnvelope.js';
import { verifySignedEnvelope } from './pqEnvelope.js';
import type { GuardianRecord } from './guardianRegistry.js';
import { GuardianRegistry } from './guardianRegistry.js';

export interface AggregationReport {
  digest: HexData;
  threshold: number;
  approvals: VerifiedApproval[];
  invalid: InvalidEnvelopeReport[];
  pendingGuardians: GuardianRecord[];
  thresholdMet: boolean;
}

export interface VerifiedApproval {
  guardian: GuardianRecord;
  envelope: SignedIntentEnvelope;
}

export interface InvalidEnvelopeReport {
  envelope: SignedIntentEnvelope;
  reason: string;
}

export interface AggregationOptions {
  digest: HexData;
  threshold: number;
  registry: GuardianRegistry;
}

export async function aggregateGuardianEnvelopes(
  envelopes: SignedIntentEnvelope[],
  options: AggregationOptions
): Promise<AggregationReport> {
  const approvals: VerifiedApproval[] = [];
  const invalid: InvalidEnvelopeReport[] = [];
  const claimedGuardians = new Set<string>();

  for (const envelope of envelopes) {
    const guardian = options.registry.findByEnvelope(envelope);
    if (!guardian) {
      invalid.push({ envelope, reason: 'Unknown guardian' });
      continue;
    }
    if (guardian.parameterSet !== envelope.parameterSet) {
      invalid.push({ envelope, reason: 'Parameter set mismatch' });
      continue;
    }
    if (claimedGuardians.has(guardian.id)) {
      invalid.push({ envelope, reason: 'Duplicate guardian signature' });
      continue;
    }
    const verification = await verifySignedEnvelope(envelope, options.digest);
    if (!verification.valid) {
      invalid.push({ envelope, reason: verification.reason ?? 'Invalid signature' });
      continue;
    }
    claimedGuardians.add(guardian.id);
    approvals.push({ guardian, envelope });
  }

  const pendingGuardians = options.registry
    .list()
    .filter((guardian) => !claimedGuardians.has(guardian.id));

  return {
    digest: options.digest,
    threshold: options.threshold,
    approvals,
    invalid,
    pendingGuardians,
    thresholdMet: approvals.length >= options.threshold
  } satisfies AggregationReport;
}
