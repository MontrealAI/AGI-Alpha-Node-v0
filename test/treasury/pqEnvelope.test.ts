import { Buffer } from 'node:buffer';
import { describe, it, expect } from 'vitest';
import type { SignedIntentEnvelope } from '../../src/treasury/pqEnvelope.js';
import {
  encodeEnvelopeToCbor,
  decodeEnvelopeFromCbor,
  signIntentDigest,
  verifySignedEnvelope,
  getDilithiumInstance,
  generateGuardianKeyPair
} from '../../src/treasury/pqEnvelope.js';

const digest = '0x5f9c3a7cb9dd80a8a90ecf4aaf1b6f651c3d98c2cb5c2aefcda5f48e66e5d9c8';

describe('PQ envelope signing', () => {
  it('signs, encodes, decodes, and verifies Dilithium envelopes', async () => {
    const dilithium = await getDilithiumInstance();
    const { publicKey, privateKey } = dilithium.generateKeys(2);
    const envelope = await signIntentDigest({
      digest,
      privateKey,
      publicKey,
      parameterSet: 2,
      metadata: { guardianId: 'guardian-a', issuedAt: new Date().toISOString() }
    });
    const encoded = encodeEnvelopeToCbor(envelope);
    const decoded = decodeEnvelopeFromCbor(encoded);
    expect(decoded.digest).toBe(digest);
    const verification = await verifySignedEnvelope(decoded, digest);
    expect(verification.valid).toBe(true);
  });

  it('generates deterministic guardian key pairs when seeded', async () => {
    const seed = '0x' + '11'.repeat(32);
    const pairA = await generateGuardianKeyPair(2, seed);
    const pairB = await generateGuardianKeyPair(2, seed);
    expect(pairA.parameterSet).toBe(2);
    expect(pairB.parameterSet).toBe(2);
    expect(Buffer.from(pairA.publicKey).toString('hex')).toBe(Buffer.from(pairB.publicKey).toString('hex'));
    expect(Buffer.from(pairA.privateKey).toString('hex')).toBe(Buffer.from(pairB.privateKey).toString('hex'));
  });

  it('rejects malformed envelopes without throwing', async () => {
    const malformedEnvelope = {
      version: 1,
      algorithm: 'dilithium' as const,
      parameterSet: 99,
      digest,
      publicKey: '',
      signature: ''
    } satisfies Partial<SignedIntentEnvelope>;

    const verification = await verifySignedEnvelope(malformedEnvelope as any, digest);

    expect(verification.valid).toBe(false);
    expect(verification.reason).toMatch(/parameter set|signature|public key/i);
  });

  it('returns a clear reason when signature material is missing', async () => {
    const dilithium = await getDilithiumInstance();
    const { publicKey } = dilithium.generateKeys(2);

    const incompleteEnvelope = {
      version: 1,
      algorithm: 'dilithium' as const,
      parameterSet: 2,
      digest,
      publicKey: Buffer.from(publicKey).toString('base64'),
      signature: ''
    };

    const verification = await verifySignedEnvelope(incompleteEnvelope as any, digest);

    expect(verification.valid).toBe(false);
    expect(verification.reason).toMatch(/signature/i);
  });
});
