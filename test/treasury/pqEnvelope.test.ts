import { describe, it, expect } from 'vitest';
import { encodeEnvelopeToCbor, decodeEnvelopeFromCbor, signIntentDigest, verifySignedEnvelope, getDilithiumInstance } from '../../src/treasury/pqEnvelope.js';

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
});
