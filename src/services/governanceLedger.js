import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getGlobalAlphaSummary, getJobAlphaSummary, getJobAlphaWU } from './metering.js';

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

const ALPHA_TRIGGER_METHODS = ['submit', 'stake', 'reward'];

function toNumber(value) {
  if (value === undefined || value === null) {
    return 0;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sanitizeBreakdown(source = {}) {
  return Object.fromEntries(
    Object.entries(source ?? {})
      .map(([label, value]) => [label, toNumber(value)])
      .sort(([a], [b]) => a.localeCompare(b))
  );
}

function sanitizeAlphaMeta(summary = null, { totalOverride = null } = {}) {
  if (!summary || typeof summary !== 'object') {
    return {
      total: toNumber(totalOverride),
      modelClassBreakdown: {},
      slaBreakdown: {}
    };
  }
  const normalizedTotal = totalOverride !== null && totalOverride !== undefined ? totalOverride : summary.total;
  return {
    total: toNumber(normalizedTotal),
    modelClassBreakdown: sanitizeBreakdown(summary.modelClassBreakdown),
    slaBreakdown: sanitizeBreakdown(summary.slaBreakdown)
  };
}

function shouldAttachAlpha(meta) {
  if (!meta || typeof meta !== 'object') {
    return false;
  }
  const method = typeof meta.method === 'string' ? meta.method.toLowerCase() : '';
  return ALPHA_TRIGGER_METHODS.some((needle) => method.includes(needle));
}

function extractJobId(meta) {
  if (!meta || typeof meta !== 'object') {
    return null;
  }
  const args = meta.args;
  const candidates = [];
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    candidates.push(args);
  } else if (Array.isArray(args)) {
    candidates.push(...args.filter((entry) => entry && typeof entry === 'object'));
  }
  for (const candidate of candidates) {
    for (const key of ['jobId', 'jobID', 'job']) {
      if (candidate[key] !== undefined && candidate[key] !== null) {
        return candidate[key];
      }
    }
  }
  return null;
}

function normalizeJobIdentifier(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'string') {
    return value.trim() ? value : null;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }
    return value.toString();
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'object') {
    if (value.jobId !== undefined && value.jobId !== null) {
      return normalizeJobIdentifier(value.jobId);
    }
    if (typeof value.toString === 'function') {
      const rendered = value.toString();
      return rendered ? rendered : null;
    }
  }
  return String(value);
}

function enrichMetaWithAlpha(meta) {
  if (!shouldAttachAlpha(meta)) {
    return meta;
  }
  const jobIdCandidate = normalizeJobIdentifier(extractJobId(meta));
  let rawSummary = null;
  if (jobIdCandidate) {
    try {
      rawSummary = getJobAlphaSummary(jobIdCandidate);
    } catch {
      rawSummary = null;
    }
  } else {
    try {
      rawSummary = getGlobalAlphaSummary();
    } catch {
      rawSummary = null;
    }
  }
  let totalOverride = null;
  if (jobIdCandidate) {
    try {
      totalOverride = getJobAlphaWU(jobIdCandidate);
    } catch {
      totalOverride = null;
    }
  }
  const alphaWU = sanitizeAlphaMeta(rawSummary, { totalOverride });
  return {
    ...meta,
    alphaWU
  };
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
  const decoratedMeta = enrichMetaWithAlpha(meta);
  const entry = {
    id: randomUUID(),
    recordedAt: new Date().toISOString(),
    payload: serialize(payload),
    meta: serialize(decoratedMeta),
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
