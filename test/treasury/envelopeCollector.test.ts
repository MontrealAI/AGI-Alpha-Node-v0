import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  encodeEnvelopeToCbor,
  getDilithiumInstance,
  signIntentDigest
} from '../../src/treasury/pqEnvelope.js';
import { loadEnvelopesFromDirectory } from '../../src/treasury/envelopeCollector.js';

const digest = `0x${'aa'.repeat(32)}`;

describe('Envelope collector', () => {
  it('loads CBOR and JSON envelopes while reporting failures', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'envelopes-'));
    const dilithium = await getDilithiumInstance();
    const { privateKey, publicKey } = dilithium.generateKeys(2);

    const envelope = await signIntentDigest({
      digest,
      privateKey,
      publicKey,
      metadata: { guardianId: 'guardian-1' }
    });
    const cborPath = join(workspace, 'envelope.cbor');
    const jsonPath = join(workspace, 'envelope.json');
    const junkPath = join(workspace, 'junk.txt');
    const emptyPath = join(workspace, 'empty.cbor');

    writeFileSync(cborPath, encodeEnvelopeToCbor(envelope));
    writeFileSync(jsonPath, JSON.stringify(envelope));
    writeFileSync(junkPath, 'not-an-envelope');
    writeFileSync(emptyPath, '');

    const result = loadEnvelopesFromDirectory(workspace);

    expect(result.envelopes).toHaveLength(2);
    const filesParsed = result.reports.filter((r) => r.status === 'parsed').map((r) => r.file);
    expect(filesParsed).toContain(cborPath);
    expect(filesParsed).toContain(jsonPath);

    const failedReasons = result.reports.filter((r) => r.status === 'skipped').map((r) => r.reason ?? '');
    expect(failedReasons.some((reason) => /empty payload/i.test(reason))).toBe(true);
    expect(failedReasons.some((reason) => reason.length > 0 && !/empty payload/i.test(reason))).toBe(true);

    rmSync(workspace, { recursive: true, force: true });
  });
});
