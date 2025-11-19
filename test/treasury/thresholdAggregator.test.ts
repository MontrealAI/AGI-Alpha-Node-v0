import { describe, it, expect } from 'vitest';
import { Buffer } from 'node:buffer';
import { aggregateGuardianEnvelopes } from '../../src/treasury/thresholdAggregator.js';
import { GuardianRegistry, type GuardianRecord } from '../../src/treasury/guardianRegistry.js';
import { signIntentDigest, getDilithiumInstance } from '../../src/treasury/pqEnvelope.js';

const digest = `0x${'11'.repeat(32)}`;

describe('Guardian threshold aggregation', () => {
  it('approves only unique, valid Dilithium signatures', async () => {
    const dilithium = await getDilithiumInstance();
    const keyPairs = [dilithium.generateKeys(2), dilithium.generateKeys(2), dilithium.generateKeys(2)];

    const guardians: GuardianRecord[] = keyPairs.map((pair, index) => ({
      id: `guardian-${index + 1}`,
      publicKey: Buffer.from(pair.publicKey).toString('base64'),
      parameterSet: 2
    }));
    const registry = new GuardianRegistry(guardians);

    const envelopeA = await signIntentDigest({
      digest,
      privateKey: keyPairs[0].privateKey,
      publicKey: keyPairs[0].publicKey,
      metadata: { guardianId: 'guardian-1' }
    });
    const envelopeB = await signIntentDigest({
      digest,
      privateKey: keyPairs[1].privateKey,
      publicKey: keyPairs[1].publicKey,
      metadata: { guardianId: 'guardian-2' }
    });
    const tampered = { ...envelopeA, digest: '0x1234' };

    const report = await aggregateGuardianEnvelopes([envelopeA, envelopeB, tampered], {
      digest,
      threshold: 2,
      registry
    });

    expect(report.approvals).toHaveLength(2);
    expect(report.invalid).toHaveLength(1);
    expect(report.invalid[0].reason).toMatch(/duplicate/i);
    expect(report.thresholdMet).toBe(true);
    expect(report.pendingGuardians.map((g) => g.id)).toContain('guardian-3');
  });
});
