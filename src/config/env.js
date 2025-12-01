import { config as loadEnv } from 'dotenv';
import { DEFAULT_CONFIG } from './defaults.js';
import { coerceConfig } from './schema.js';

const SENSITIVE_DEFAULT_KEYS = new Set([
  'NODE_PRIVATE_KEY',
  'VALIDATOR_PRIVATE_KEY'
]);

let cachedConfig = null;

export function loadConfig(overrides = {}) {
  loadEnv();
  const defaults = { ...DEFAULT_CONFIG };

  for (const key of Object.keys(DEFAULT_CONFIG)) {
    if (SENSITIVE_DEFAULT_KEYS.has(key) && process.env[key] === undefined && overrides[key] === undefined) {
      delete defaults[key];
    }
  }

  const merged = { ...defaults, ...process.env, ...overrides };
  cachedConfig = coerceConfig(merged);
  return cachedConfig;
}

export function getConfig() {
  if (!cachedConfig) {
    return loadConfig();
  }
  return cachedConfig;
}
