import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { resolve as pathResolve } from 'node:path';
import { configSchema, configSchemaBase, coerceConfig } from '../src/config/schema.js';
import { createHealthGate } from '../src/services/healthGate.js';

export const REQUIRED_PATTERNS = [
  '*.agent.agi.eth',
  '*.alpha.agent.agi.eth',
  '*.node.agi.eth',
  '*.alpha.node.agi.eth',
  '*.alpha.club.agi.eth',
  '*.club.agi.eth'
];

export function verifyHealthGate({ env = process.env, logger = console } = {}) {
  const allowedKeys = new Set(Object.keys(configSchemaBase.shape));
  const filtered = Object.fromEntries(
    Object.entries(env).filter(([key]) => allowedKeys.has(key))
  );
  const config = coerceConfig(filtered);
  const gate = createHealthGate({ allowlist: config.HEALTH_GATE_ALLOWLIST });
  const allowlist = gate.getAllowlist();

  const missingPatterns = REQUIRED_PATTERNS.filter((pattern) => !allowlist.includes(pattern));
  if (missingPatterns.length) {
    const message = `Health gate allowlist missing required ENS patterns: ${missingPatterns.join(', ')}`;
    logger?.error?.(message);
    const error = new Error(message);
    error.code = 'ENS_PATTERNS_MISSING';
    throw error;
  }

  const nodeName = config.NODE_LABEL && config.ENS_PARENT_DOMAIN
    ? `${config.NODE_LABEL}.${config.ENS_PARENT_DOMAIN}`
    : null;

  if (nodeName && !gate.matchesAllowlist(nodeName)) {
    const message = `Configured node name ${nodeName} is not permitted by the health gate allowlist.`;
    logger?.error?.(message);
    const error = new Error(message);
    error.code = 'NODE_NOT_ALLOWLISTED';
    throw error;
  }

  if (config.HEALTH_GATE_OVERRIDE_ENS && !gate.matchesAllowlist(config.HEALTH_GATE_OVERRIDE_ENS)) {
    const message =
      `HEALTH_GATE_OVERRIDE_ENS ${config.HEALTH_GATE_OVERRIDE_ENS} is not covered by the active allowlist.`;
    logger?.error?.(message);
    const error = new Error(message);
    error.code = 'OVERRIDE_NOT_ALLOWLISTED';
    throw error;
  }

  logger?.log?.('Health gate allowlist verified. Active patterns:', allowlist.join(', '));
  return { allowlist, nodeName, override: config.HEALTH_GATE_OVERRIDE_ENS ?? null };
}

async function runCli() {
  verifyHealthGate();
}

const isDirectExecution = Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(pathResolve(process.argv[1])).href;

if (isDirectExecution) {
  runCli().catch((error) => {
    console.error('Health gate verification failed:', error);
    process.exit(1);
  });
}
