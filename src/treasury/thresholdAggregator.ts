import type { HexData } from './intentTypes.js';
import type { SignedIntentEnvelope } from './pqEnvelope.js';
import { verifySignedEnvelope } from './pqEnvelope.js';
import type { GuardianRecord } from './guardianRegistry.js';
import { GuardianRegistry } from './guardianRegistry.js';
import type { IntentExecutionRecord } from './intentLedger.js';

export interface AggregationReport {
  digest: HexData;
  threshold: number;
  approvals: VerifiedApproval[];
  approvalWeight: number;
  invalid: InvalidEnvelopeReport[];
  pendingGuardians: GuardianRecord[];
  shortfall: number;
  replayDetected: boolean;
  executedRecord?: IntentExecutionRecord;
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
  executedCheck?: ExecutedCheck;
}

export type ExecutedCheck = (digest: HexData) => boolean | IntentExecutionRecord | undefined;

export async function aggregateGuardianEnvelopes(
  envelopes: SignedIntentEnvelope[],
  options: AggregationOptions
): Promise<AggregationReport> {
  const executedResult = options.executedCheck?.(options.digest);
  const executedRecord = executedResult && typeof executedResult === 'object' ? executedResult : undefined;
  const replayDetected = Boolean(executedResult);

  const approvals: VerifiedApproval[] = [];
  let approvalWeight = 0;
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
    const verification = await verifySignedEnvelope(envelope, options.digest);
    if (!verification.valid) {
      invalid.push({ envelope, reason: verification.reason ?? 'Invalid signature' });
      continue;
    }
    if (claimedGuardians.has(guardian.id)) {
      invalid.push({ envelope, reason: 'Duplicate guardian signature' });
      continue;
    }
    claimedGuardians.add(guardian.id);
    approvalWeight += guardian.weight ?? 1;
    approvals.push({ guardian, envelope });
  }

  const pendingGuardians = options.registry
    .list()
    .filter((guardian) => !claimedGuardians.has(guardian.id));

  const thresholdMet = approvalWeight >= options.threshold && !replayDetected;
  const shortfall = Math.max(0, options.threshold - approvalWeight);

  return {
    digest: options.digest,
    threshold: options.threshold,
    approvals,
    approvalWeight,
    invalid,
    pendingGuardians,
    shortfall,
    replayDetected,
    executedRecord,
    thresholdMet
  } satisfies AggregationReport;
}
