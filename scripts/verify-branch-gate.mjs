import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { resolve as pathResolve } from 'node:path';
import { configSchema, coerceConfig } from '../src/config/schema.js';
import { createHealthGate } from '../src/services/healthGate.js';

export const CRITICAL_PREFIXES = ['deploy/', 'release/', 'hotfix/'];

export function resolveBranchName(env = process.env) {
  const candidates = [
    env.GITHUB_HEAD_REF,
    env.GITHUB_REF_NAME,
    env.BRANCH_NAME,
    env.GITHUB_REF
  ].filter(Boolean);

  if (!candidates.length) {
    return null;
  }

  const ref = candidates[0];
  if (ref.startsWith('refs/heads/')) {
    return ref.slice('refs/heads/'.length);
  }
  if (ref.startsWith('refs/pull/')) {
    return ref;
  }
  return ref;
}

export function extractEnsFromBranch(branchName) {
  if (!branchName) {
    return null;
  }
  const match = CRITICAL_PREFIXES.find((prefix) => branchName.startsWith(prefix));
  if (!match) {
    return null;
  }
  const remainder = branchName.slice(match.length);
  const parts = remainder.split('/').filter(Boolean);
  if (!parts.length) {
    return null;
  }
  const candidate = parts[0]
    .replace(/__/g, '_')
    .replace(/--/g, '-')
    .replace(/_/g, '.')
    .toLowerCase();
  return candidate;
}

export function verifyBranchGate({ env = process.env, logger = console } = {}) {
  const branchName = resolveBranchName(env);
  if (!branchName) {
    logger?.log?.('Branch name not detected; skipping branch gate verification.');
    return { authorized: true, branchName: null, reason: 'no-branch' };
  }

  const ensCandidate = extractEnsFromBranch(branchName);
  if (!ensCandidate) {
    logger?.log?.(
      `Branch "${branchName}" is not marked as merge-critical; no ENS gate enforcement required.`
    );
    return { authorized: true, branchName, reason: 'non-critical' };
  }

  const allowedKeys = new Set(Object.keys(configSchema.shape));
  const envSubset = Object.fromEntries(
    Object.entries(env).filter(([key]) => allowedKeys.has(key))
  );
  const config = coerceConfig(envSubset);
  const healthGate = createHealthGate({ allowlist: config.HEALTH_GATE_ALLOWLIST });

  if (!healthGate.matchesAllowlist(ensCandidate)) {
    const message =
      `Branch "${branchName}" is tagged as merge-critical but ENS handle "${ensCandidate}" is not allowlisted.`;
    logger?.error?.(message);
    logger?.error?.('Allowed ENS patterns:', healthGate.getAllowlist().join(', '));
    const error = new Error(message);
    error.code = 'ENS_NOT_ALLOWLISTED';
    throw error;
  }

  logger?.log?.(`Branch "${branchName}" authorized via ENS handle "${ensCandidate}".`);
  return { authorized: true, branchName, ens: ensCandidate };
}

async function runCli() {
  verifyBranchGate();
}

const isDirectExecution = Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(pathResolve(process.argv[1])).href;

if (isDirectExecution) {
  runCli().catch((error) => {
    console.error('Branch gate verification failed:', error);
    process.exit(1);
  });
}
