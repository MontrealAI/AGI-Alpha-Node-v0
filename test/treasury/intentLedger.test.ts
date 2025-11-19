import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { IntentLedger } from '../../src/treasury/intentLedger.js';

const digest = `0x${'aa'.repeat(32)}`;

function buildTempLedgerPath(filename = 'intent-ledger.json') {
  const dir = mkdtempSync(join(tmpdir(), 'intent-ledger-'));
  return join(dir, filename);
}

describe('IntentLedger', () => {
  it('records executions, enforces replay prevention, and persists to disk', () => {
    const path = buildTempLedgerPath();
    const ledger = new IntentLedger(path);
    expect(ledger.isExecuted(digest)).toBe(false);

    ledger.recordExecution(digest, { txHash: '0xabc', approvals: ['g1', 'g2'] });
    expect(ledger.isExecuted(digest)).toBe(true);
    const record = ledger.getRecord(digest);
    expect(record?.txHash).toBe('0xabc');
    expect(record?.approvals).toEqual(['g1', 'g2']);

    const reloaded = new IntentLedger(path);
    expect(reloaded.isExecuted(digest)).toBe(true);
    expect(reloaded.getRecord(digest)?.txHash).toBe('0xabc');
    expect(reloaded.listExecuted()).toHaveLength(1);
  });

  it('ignores malformed on-disk data without blocking new writes', () => {
    const path = buildTempLedgerPath();
    writeFileSync(path, '{"executed":[{"digest":"0x123"}] }', 'utf8');
    const ledger = new IntentLedger(path);

    expect(ledger.isExecuted(digest)).toBe(false);
    ledger.recordExecution(digest, { note: 'fresh-run' });
    expect(ledger.getRecord(digest)?.note).toBe('fresh-run');
  });
});
