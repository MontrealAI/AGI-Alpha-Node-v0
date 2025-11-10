import { config as loadEnv } from 'dotenv';
import { coerceConfig } from './schema.js';

let cachedConfig = null;

export function loadConfig(overrides = {}) {
  loadEnv();
  const merged = { ...process.env, ...overrides };
  cachedConfig = coerceConfig(merged);
  return cachedConfig;
}

export function getConfig() {
  if (!cachedConfig) {
    return loadConfig();
  }
  return cachedConfig;
}
