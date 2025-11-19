import { describe, it, expect } from 'vitest';
import { signIntentWithKeys, computeFunctionSelector } from '../../src/treasury/signingTools.js';
import type { TreasuryIntentV1 } from '../../src/treasury/intentTypes.js';
import { digestTreasuryIntent } from '../../src/treasury/intentEncoding.js';
import { getDilithiumInstance } from '../../src/treasury/pqEnvelope.js';

describe('Treasury signing helpers', () => {
  it('produces the same digest as Solidity ABI encoding when given an intent', async () => {
    const dilithium = await getDilithiumInstance();
    const { publicKey, privateKey } = dilithium.generateKeys(2);
    const intent: TreasuryIntentV1 = {
      to: '0x0000000000000000000000000000000000000abc',
      value: 123456789n,
      data: '0xdeadbeef'
    };
    const domain = {
      chainId: 11155111n,
      contractAddress: '0x0000000000000000000000000000000000000def',
      version: 2,
      functionSelector: computeFunctionSelector('executeTransaction(address,uint256,bytes)'),
      includeSelector: true
    } as const;

    const result = await signIntentWithKeys({
      intent,
      domain,
      metadata: { guardianId: 'guardian-x' },
      parameterSet: 2,
      privateKey,
      publicKey
    });

    const expectedDigest = digestTreasuryIntent(intent, { domain });
    expect(result.digest.toLowerCase()).toBe(expectedDigest.toLowerCase());
    expect(result.envelope.metadata?.guardianId).toBe('guardian-x');
  });

  it('accepts a precomputed digest without requiring the intent payload', async () => {
    const dilithium = await getDilithiumInstance();
    const { publicKey, privateKey } = dilithium.generateKeys(2);
    const digest = `0x${'42'.repeat(32)}`;

    const result = await signIntentWithKeys({
      digest,
      privateKey,
      publicKey,
      parameterSet: 2,
      metadata: { note: 'prehashed' }
    });

    expect(result.digest).toBe(digest);
    expect(result.intent).toBeUndefined();
  });
});
