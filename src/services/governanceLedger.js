import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const LEDGER_ROOT = '.governance-ledger';
const LEDGER_VERSION = 'v1';

function ensureLedgerDirectory(rootDir = process.cwd()) {
  const target = path.join(rootDir, LEDGER_ROOT, LEDGER_VERSION);
  fs.mkdirSync(target, { recursive: true });
  return target;
}

function serialize(value) {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => serialize(entry));
  }
  if (value && typeof value === 'object') {
    const clone = {};
    for (const [key, entry] of Object.entries(value)) {
      clone[key] = serialize(entry);
    }
    return clone;
  }
  return value;
}

export function recordGovernanceAction({
  payload,
  meta,
  signature = null,
  operator = null,
  tags = [],
  rootDir = process.cwd()
}) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('payload must be an object');
  }
  if (!meta || typeof meta !== 'object') {
    throw new Error('meta must be provided to record governance actions');
  }
  const ledgerDir = ensureLedgerDirectory(rootDir);
  const entry = {
    id: randomUUID(),
    recordedAt: new Date().toISOString(),
    payload: serialize(payload),
    meta: serialize(meta),
    signature: signature ?? null,
    operator,
    tags
  };
  const fileName = `${entry.recordedAt.replace(/[:.]/g, '-')}_${entry.id}.json`;
  const filePath = path.join(ledgerDir, fileName);
  fs.writeFileSync(filePath, `${JSON.stringify(entry, null, 2)}\n`, 'utf8');
  return { entry, filePath };
}

export function listGovernanceActions(rootDir = process.cwd()) {
  const ledgerDir = ensureLedgerDirectory(rootDir);
  const files = fs.readdirSync(ledgerDir).filter((file) => file.endsWith('.json'));
  return files.map((file) => {
    const fullPath = path.join(ledgerDir, file);
    const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    return { ...parsed, filePath: fullPath };
  });
}

export function clearGovernanceLedger(rootDir = process.cwd()) {
  const ledgerDir = ensureLedgerDirectory(rootDir);
  fs.readdirSync(ledgerDir).forEach((file) => {
    fs.unlinkSync(path.join(ledgerDir, file));
  });
}

export { LEDGER_ROOT, LEDGER_VERSION };
