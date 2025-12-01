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
    const duplicate = { ...envelopeA };
    const tampered = { ...envelopeA, digest: '0x1234' };

    const report = await aggregateGuardianEnvelopes([envelopeA, envelopeB, duplicate, tampered], {
      digest,
      threshold: 2,
      registry
    });

    expect(report.approvals).toHaveLength(2);
    expect(report.invalid).toHaveLength(2);
    expect(report.invalid.map((item) => item.reason?.toLowerCase())).toEqual(
      expect.arrayContaining(['duplicate guardian signature', 'digest mismatch'])
    );
    expect(report.replayDetected).toBe(false);
    expect(report.shortfall).toBe(0);
    expect(report.thresholdMet).toBe(true);
    expect(report.pendingGuardians.map((g) => g.id)).toContain('guardian-3');
  });

  it('rejects envelopes whose guardianId does not match the registered public key', async () => {
    const dilithium = await getDilithiumInstance();
    const keyPairs = [dilithium.generateKeys(2), dilithium.generateKeys(2)];

    const guardians: GuardianRecord[] = keyPairs.map((pair, index) => ({
      id: `guardian-${index + 1}`,
      publicKey: Buffer.from(pair.publicKey).toString('base64'),
      parameterSet: 2
    }));

    const registry = new GuardianRegistry(guardians);
    const rogueKeys = dilithium.generateKeys(2);
    const forgedEnvelope = await signIntentDigest({
      digest,
      privateKey: rogueKeys.privateKey,
      publicKey: rogueKeys.publicKey,
      metadata: { guardianId: 'guardian-1' }
    });

    const report = await aggregateGuardianEnvelopes([forgedEnvelope], {
      digest,
      threshold: 1,
      registry
    });

    expect(report.approvals).toHaveLength(0);
    expect(report.invalid).toHaveLength(1);
    expect(report.invalid[0].reason).toMatch(/unknown guardian/i);
    expect(report.shortfall).toBe(1);
    expect(report.replayDetected).toBe(false);
    expect(report.thresholdMet).toBe(false);
  });

  it('fails validation when the Dilithium parameter set differs from the registry', async () => {
    const dilithium = await getDilithiumInstance();
    const [pairA, pairB] = [dilithium.generateKeys(1), dilithium.generateKeys(2)];

    const guardians: GuardianRecord[] = [
      { id: 'guardian-1', publicKey: Buffer.from(pairA.publicKey).toString('base64'), parameterSet: 2 },
      { id: 'guardian-2', publicKey: Buffer.from(pairB.publicKey).toString('base64'), parameterSet: 2 }
    ];

    const registry = new GuardianRegistry(guardians);
    const envelope = await signIntentDigest({
      digest,
      privateKey: pairA.privateKey,
      publicKey: pairA.publicKey,
      parameterSet: 1,
      metadata: { guardianId: 'guardian-1' }
    });

    const report = await aggregateGuardianEnvelopes([envelope], {
      digest,
      threshold: 1,
      registry
    });

    expect(report.approvals).toHaveLength(0);
    expect(report.invalid[0].reason).toMatch(/parameter set mismatch/i);
    expect(report.pendingGuardians.map((g) => g.id)).toEqual(['guardian-1', 'guardian-2']);
    expect(report.shortfall).toBe(1);
    expect(report.replayDetected).toBe(false);
    expect(report.thresholdMet).toBe(false);
  });

  it('flags digest mismatches and keeps the registry inventory intact', async () => {
    const dilithium = await getDilithiumInstance();
    const [pairA, pairB] = [dilithium.generateKeys(2), dilithium.generateKeys(2)];
    const guardians: GuardianRecord[] = [pairA, pairB].map((pair, index) => ({
      id: `guardian-${index + 1}`,
      publicKey: Buffer.from(pair.publicKey).toString('base64'),
      parameterSet: 2
    }));

    const registry = new GuardianRegistry(guardians);
    const mismatchedDigest = `0x${'22'.repeat(32)}`;
    const envelope = await signIntentDigest({
      digest: mismatchedDigest,
      privateKey: pairA.privateKey,
      publicKey: pairA.publicKey,
      metadata: { guardianId: 'guardian-1' }
    });

    const report = await aggregateGuardianEnvelopes([envelope], {
      digest,
      threshold: 2,
      registry
    });

    expect(report.approvals).toHaveLength(0);
    expect(report.invalid[0].reason).toMatch(/digest mismatch/i);
    expect(report.pendingGuardians).toHaveLength(2);
    expect(report.shortfall).toBe(2);
    expect(report.replayDetected).toBe(false);
    expect(report.thresholdMet).toBe(false);
  });

  it('tracks shortfall when approvals are below the threshold', async () => {
    const dilithium = await getDilithiumInstance();
    const keyPairs = [dilithium.generateKeys(2), dilithium.generateKeys(2)];
    const guardians: GuardianRecord[] = keyPairs.map((pair, index) => ({
      id: `guardian-${index + 1}`,
      publicKey: Buffer.from(pair.publicKey).toString('base64'),
      parameterSet: 2
    }));

    const registry = new GuardianRegistry(guardians);
    const envelope = await signIntentDigest({
      digest,
      privateKey: keyPairs[0].privateKey,
      publicKey: keyPairs[0].publicKey,
      metadata: { guardianId: 'guardian-1' }
    });

    const report = await aggregateGuardianEnvelopes([envelope], {
      digest,
      threshold: 2,
      registry
    });

    expect(report.approvals).toHaveLength(1);
    expect(report.shortfall).toBe(1);
    expect(report.thresholdMet).toBe(false);
    expect(report.pendingGuardians.map((g) => g.id)).toEqual(['guardian-2']);
  });

  it('honors guardian weights when computing thresholds', async () => {
    const dilithium = await getDilithiumInstance();
    const heavy = dilithium.generateKeys(2);
    const light = dilithium.generateKeys(2);

    const registry = new GuardianRegistry([
      { id: 'guardian-heavy', publicKey: Buffer.from(heavy.publicKey).toString('base64'), parameterSet: 2, weight: 2 },
      { id: 'guardian-light', publicKey: Buffer.from(light.publicKey).toString('base64'), parameterSet: 2, weight: 1 }
    ]);

    const heavyApproval = await signIntentDigest({
      digest,
      privateKey: heavy.privateKey,
      publicKey: heavy.publicKey,
      metadata: { guardianId: 'guardian-heavy' }
    });

    const lightApproval = await signIntentDigest({
      digest,
      privateKey: light.privateKey,
      publicKey: light.publicKey,
      metadata: { guardianId: 'guardian-light' }
    });

    const weightedReport = await aggregateGuardianEnvelopes([heavyApproval], {
      digest,
      threshold: 2,
      registry
    });

    expect(weightedReport.approvalWeight).toBe(2);
    expect(weightedReport.thresholdMet).toBe(true);
    expect(weightedReport.shortfall).toBe(0);
    expect(weightedReport.pendingGuardians.map((g) => g.id)).toEqual(['guardian-light']);

    const shortfallReport = await aggregateGuardianEnvelopes([lightApproval], {
      digest,
      threshold: 2,
      registry
    });

    expect(shortfallReport.approvalWeight).toBe(1);
    expect(shortfallReport.thresholdMet).toBe(false);
    expect(shortfallReport.shortfall).toBe(1);
  });

  it('rejects guardian entries with non-positive weights', () => {
    expect(
      () =>
        new GuardianRegistry([
          { id: 'bad-weight', publicKey: Buffer.from('bad').toString('base64'), parameterSet: 2, weight: 0 }
        ])
    ).toThrow(/positive number/);
  });

  it('marks reports when the digest was already executed in the ledger', async () => {
    const dilithium = await getDilithiumInstance();
    const keyPairs = [dilithium.generateKeys(2)];
    const guardians: GuardianRecord[] = [
      { id: 'guardian-1', publicKey: Buffer.from(keyPairs[0].publicKey).toString('base64'), parameterSet: 2 }
    ];
    const registry = new GuardianRegistry(guardians);
    const envelope = await signIntentDigest({
      digest,
      privateKey: keyPairs[0].privateKey,
      publicKey: keyPairs[0].publicKey,
      metadata: { guardianId: 'guardian-1' }
    });

    const report = await aggregateGuardianEnvelopes([envelope], {
      digest,
      threshold: 1,
      registry,
      executedCheck: () => ({ digest, at: new Date().toISOString(), txHash: '0xbeef', approvals: ['guardian-1'] })
    });

    expect(report.approvals).toHaveLength(1);
    expect(report.replayDetected).toBe(true);
    expect(report.executedRecord?.txHash).toBe('0xbeef');
    expect(report.thresholdMet).toBe(false);
    expect(report.shortfall).toBe(0);
  });
});
