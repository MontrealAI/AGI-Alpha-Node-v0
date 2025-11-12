import process from 'node:process';
import { configSchema, coerceConfig } from '../src/config/schema.js';
import { createHealthGate } from '../src/services/healthGate.js';

const CRITICAL_PREFIXES = ['deploy/', 'release/', 'hotfix/'];

function resolveBranchName() {
  const candidates = [
    process.env.GITHUB_HEAD_REF,
    process.env.GITHUB_REF_NAME,
    process.env.BRANCH_NAME,
    process.env.GITHUB_REF
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

function extractEnsFromBranch(branchName) {
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

async function main() {
  const branchName = resolveBranchName();
  if (!branchName) {
    console.log('Branch name not detected; skipping branch gate verification.');
    return;
  }

  const ensCandidate = extractEnsFromBranch(branchName);
  if (!ensCandidate) {
    console.log(`Branch "${branchName}" is not marked as merge-critical; no ENS gate enforcement required.`);
    return;
  }

  const allowedKeys = new Set(Object.keys(configSchema.shape));
  const envSubset = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => allowedKeys.has(key))
  );
  const config = coerceConfig(envSubset);
  const healthGate = createHealthGate({ allowlist: config.HEALTH_GATE_ALLOWLIST });

  if (!healthGate.matchesAllowlist(ensCandidate)) {
    console.error(
      `Branch "${branchName}" is tagged as merge-critical but ENS handle "${ensCandidate}" is not allowlisted.`
    );
    console.error('Allowed ENS patterns:', healthGate.getAllowlist().join(', '));
    process.exit(1);
  }

  console.log(
    `Branch "${branchName}" authorized via ENS handle "${ensCandidate}".`
  );
}

main().catch((error) => {
  console.error('Branch gate verification failed:', error);
  process.exit(1);
});
