import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Buffer } from 'node:buffer';
import {
  deriveEnvelopeBasename,
  loadKeyMaterial,
  persistEnvelope,
  planEnvelopeOutputs
} from '../../src/treasury/signingSupport.js';
import type { SignedIntentEnvelope } from '../../src/treasury/pqEnvelope.js';

const digest = '0x9f37d7f203d6c7ac8324bfefce1e65bf04d6c6d1f3ad91d9ad70589158f2abcd';

function sampleEnvelope(): SignedIntentEnvelope {
  return {
    version: 1,
    algorithm: 'dilithium',
    parameterSet: 2,
    digest,
    publicKey: Buffer.alloc(10, 1).toString('base64'),
    signature: Buffer.alloc(32, 2).toString('base64'),
    metadata: { guardianId: 'guardian-alpha', issuedAt: '2024-07-01T00:00:00.000Z' }
  };
}

describe('signing support toolkit', () => {
  it('loads key material from inline hex and base64', () => {
    const hexKey = '0x11223344aabbccdd';
    const hexBytes = loadKeyMaterial(hexKey, { encoding: 'hex' });
    expect(hexBytes).toHaveLength(8);

    const base64 = Buffer.from('guardian', 'utf8').toString('base64');
    const base64Bytes = loadKeyMaterial(base64, { encoding: 'base64' });
    expect(Buffer.from(base64Bytes).toString('utf8')).toBe('guardian');
  });

  it('loads key material from a filesystem path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'guardian-key-'));
    const filePath = join(dir, 'pk.bin');
    writeFileSync(filePath, Buffer.from('feedcafe', 'hex'));
    const bytes = loadKeyMaterial(filePath);
    expect(Buffer.from(bytes).toString('hex')).toBe('feedcafe');
  });

  it('derives stable basenames and plans outputs', () => {
    const base = deriveEnvelopeBasename(digest, 'Guardian-01');
    expect(base).toMatch(/^[0-9a-f]+-guardian-01$/);
    const plan = planEnvelopeOutputs({ digest, guardianId: 'Guardian-01', directory: '/tmp/out', emitJson: true });
    expect(plan.cborPath).toContain('/tmp/out');
    expect(plan.cborPath.endsWith('.cbor')).toBe(true);
    expect(plan.jsonPath?.endsWith('.json')).toBe(true);
  });

  it('persists CBOR and JSON envelopes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'guardian-envelope-'));
    const envelope = sampleEnvelope();
    const cborPath = join(dir, 'sample.cbor');
    persistEnvelope(envelope, cborPath, 'cbor');
    const cborBytes = readFileSync(cborPath);
    expect(cborBytes.length).toBeGreaterThan(0);

    const jsonPath = join(dir, 'sample.json');
    persistEnvelope(envelope, jsonPath, 'json');
    const parsed = JSON.parse(readFileSync(jsonPath, 'utf8')) as SignedIntentEnvelope;
    expect(parsed.digest).toBe(digest);
    expect(parsed.metadata?.guardianId).toBe('guardian-alpha');
  });
});
