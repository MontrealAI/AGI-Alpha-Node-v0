import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getConfig, loadConfig } from '../config/env.js';

function safeGetConfig(explicitConfig) {
  if (explicitConfig) {
    return explicitConfig;
  }
  try {
    return getConfig();
  } catch (error) {
    try {
      return loadConfig();
    } catch {
      return null;
    }
  }
}

function safeTrim(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
}

function applyOverride(target, key, value) {
  const trimmed = safeTrim(value);
  if (!trimmed) {
    return;
  }
  target[key] = trimmed;
}

export function applyEnsRecordOverrides(baseConfig, overrides = {}) {
  const merged = { ...(baseConfig ?? {}) };

  const hasExplicitEnsName = Boolean(safeTrim(overrides.ensName));

  applyOverride(merged, 'NODE_ENS_NAME', overrides.ensName);
  applyOverride(merged, 'NODE_LABEL', overrides.label);
  applyOverride(merged, 'ENS_PARENT_DOMAIN', overrides.parent);
  applyOverride(merged, 'NODE_PAYOUT_ETH_ADDRESS', overrides.payoutEth);
  applyOverride(merged, 'NODE_PAYOUT_AGIALPHA_ADDRESS', overrides.payoutAgialpha);
  applyOverride(merged, 'VERIFIER_PUBLIC_BASE_URL', overrides.verifierUrl);
  applyOverride(merged, 'NODE_PRIMARY_MODEL', overrides.primaryModel);

  if (!hasExplicitEnsName && (overrides.label || overrides.parent)) {
    const label = safeTrim(merged.NODE_LABEL);
    const parent = safeTrim(merged.ENS_PARENT_DOMAIN);
    if (label && parent) {
      merged.NODE_ENS_NAME = `${label}.${parent}`.toLowerCase();
    }
  }

  return merged;
}

function deriveEnsName(config, env = process.env) {
  if (!config) {
    const envLabel = safeTrim(env.NODE_LABEL);
    const envParent = safeTrim(env.ENS_PARENT_DOMAIN);
    if (envLabel && envParent) {
      return `${envLabel}.${envParent}`.toLowerCase();
    }
    return null;
  }

  const label = safeTrim(config.NODE_LABEL ?? process.env.NODE_LABEL);
  const parent = safeTrim(config.ENS_PARENT_DOMAIN ?? process.env.ENS_PARENT_DOMAIN);
  if (label && parent) {
    return `${label}.${parent}`.toLowerCase();
  }
  return null;
}

export function getNodeEnsName({ config = null, fallbackToDerived = true } = {}) {
  const resolvedConfig = safeGetConfig(config);
  const env = process.env;

  const directValue = safeTrim(resolvedConfig?.NODE_ENS_NAME ?? env.NODE_ENS_NAME);
  if (directValue) {
    return directValue.toLowerCase();
  }

  if (!fallbackToDerived) {
    return null;
  }

  const override = safeTrim(resolvedConfig?.HEALTH_GATE_OVERRIDE_ENS ?? env.HEALTH_GATE_OVERRIDE_ENS);
  if (override) {
    return override.toLowerCase();
  }

  return deriveEnsName(resolvedConfig, env);
}

function normalizeAddress(address) {
  const trimmed = safeTrim(address);
  if (!trimmed) {
    return null;
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function getNodePayoutAddresses({ config = null } = {}) {
  const resolvedConfig = safeGetConfig(config);
  const env = process.env;

  const ethAddress =
    normalizeAddress(resolvedConfig?.NODE_PAYOUT_ETH_ADDRESS) ??
    normalizeAddress(env.NODE_PAYOUT_ETH_ADDRESS) ??
    normalizeAddress(resolvedConfig?.OPERATOR_ADDRESS) ??
    normalizeAddress(env.OPERATOR_ADDRESS);

  const agialphaAddress =
    normalizeAddress(resolvedConfig?.NODE_PAYOUT_AGIALPHA_ADDRESS) ??
    normalizeAddress(env.NODE_PAYOUT_AGIALPHA_ADDRESS) ??
    ethAddress;

  return {
    eth: ethAddress,
    agialpha: agialphaAddress
  };
}

function resolvePackageInfo() {
  try {
    const packagePath = fileURLToPath(new URL('../../package.json', import.meta.url));
    const raw = readFileSync(packagePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { version: '0.0.0-dev' };
  }
}

function resolveCommitHash() {
  const envHash =
    safeTrim(process.env.GIT_COMMIT_HASH) ||
    safeTrim(process.env.GITHUB_SHA) ||
    safeTrim(process.env.COMMIT_REF);
  if (envHash) {
    return envHash;
  }
  try {
    const output = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    return output || null;
  } catch {
    return null;
  }
}

function resolveVerifierBaseUrl(config) {
  const base = safeTrim(config?.VERIFIER_PUBLIC_BASE_URL ?? process.env.VERIFIER_PUBLIC_BASE_URL);
  if (!base) {
    return null;
  }
  try {
    const url = new URL(base);
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function buildHealthUrl(baseUrl) {
  if (!baseUrl) {
    return null;
  }
  try {
    const url = new URL(baseUrl);
    url.pathname = path.posix.join(url.pathname || '/', 'verifier/health');
    return url.toString();
  } catch {
    try {
      const url = new URL('verifier/health', baseUrl);
      return url.toString();
    } catch {
      return null;
    }
  }
}

export function buildEnsRecordTemplate({ config = null, commitHash = null } = {}) {
  const resolvedConfig = safeGetConfig(config);
  const nodeEnsName = getNodeEnsName({ config: resolvedConfig });
  const payout = getNodePayoutAddresses({ config: resolvedConfig });
  const pkg = resolvePackageInfo();
  const baseUrl = resolveVerifierBaseUrl(resolvedConfig);
  const healthUrl = buildHealthUrl(baseUrl);
  const resolvedCommit = commitHash ?? resolveCommitHash();
  const model =
    safeTrim(resolvedConfig?.NODE_PRIMARY_MODEL ?? process.env.NODE_PRIMARY_MODEL) ||
    'agi-alpha-node-v0';

  const textRecords = {};
  if (baseUrl) {
    textRecords.agialpha_verifier = baseUrl;
  }
  if (healthUrl) {
    textRecords.agialpha_health = healthUrl;
  }
  if (model) {
    textRecords.agialpha_model = model;
  }
  if (resolvedCommit) {
    textRecords.agialpha_commit = resolvedCommit;
  }

  const coinRecords = {};
  if (payout.eth) {
    coinRecords.ETH = payout.eth;
  }
  if (payout.agialpha) {
    coinRecords.AGIALPHA = payout.agialpha;
  }

  return {
    ens_name: nodeEnsName,
    version: pkg.version ?? '0.0.0-dev',
    text_records: textRecords,
    coin_addresses: coinRecords
  };
}
