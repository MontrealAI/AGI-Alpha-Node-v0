import { config as loadEnv } from 'dotenv';
import { DEFAULT_CONFIG } from './defaults.js';
import { coerceConfig } from './schema.js';

let cachedConfig = null;

export function loadConfig(overrides = {}) {
  loadEnv();
  for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
    if (process.env[key] === undefined && overrides[key] === undefined) {
      process.env[key] = typeof value === 'string' ? value : String(value);
    }
  }
  const merged = { ...DEFAULT_CONFIG, ...process.env, ...overrides };
  cachedConfig = coerceConfig(merged);
  return cachedConfig;
}

export function getConfig() {
  if (!cachedConfig) {
    return loadConfig();
  }
  return cachedConfig;
}
