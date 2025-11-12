import { configSchema, coerceConfig } from '../src/config/schema.js';
import { createHealthGate } from '../src/services/healthGate.js';

const REQUIRED_PATTERNS = [
  '*.agent.agi.eth',
  '*.alpha.agent.agi.eth',
  '*.node.agi.eth',
  '*.alpha.node.agi.eth',
  '*.alpha.club.agi.eth',
  '*.club.agi.eth'
];

async function main() {
  const allowedKeys = new Set(Object.keys(configSchema.shape));
  const filtered = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => allowedKeys.has(key))
  );
  const config = coerceConfig(filtered);
  const gate = createHealthGate({ allowlist: config.HEALTH_GATE_ALLOWLIST });
  const allowlist = gate.getAllowlist();

  const missingPatterns = REQUIRED_PATTERNS.filter((pattern) => !allowlist.includes(pattern));
  if (missingPatterns.length) {
    console.error('Health gate allowlist missing required ENS patterns:', missingPatterns.join(', '));
    process.exit(1);
  }

  const nodeName = config.NODE_LABEL && config.ENS_PARENT_DOMAIN
    ? `${config.NODE_LABEL}.${config.ENS_PARENT_DOMAIN}`
    : null;

  if (nodeName && !gate.matchesAllowlist(nodeName)) {
    console.error(`Configured node name ${nodeName} is not permitted by the health gate allowlist.`);
    process.exit(1);
  }

  if (config.HEALTH_GATE_OVERRIDE_ENS && !gate.matchesAllowlist(config.HEALTH_GATE_OVERRIDE_ENS)) {
    console.error(
      `HEALTH_GATE_OVERRIDE_ENS ${config.HEALTH_GATE_OVERRIDE_ENS} is not covered by the active allowlist.`
    );
    process.exit(1);
  }

  console.log('Health gate allowlist verified. Active patterns:', allowlist.join(', '));
}

main().catch((error) => {
  console.error('Health gate verification failed:', error);
  process.exit(1);
});
