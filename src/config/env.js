import { config as loadEnv } from 'dotenv';
import { DEFAULT_CONFIG } from './defaults.js';
import { coerceConfig } from './schema.js';

const SENSITIVE_DEFAULT_KEYS = new Set([
  'NODE_PRIVATE_KEY',
  'VALIDATOR_PRIVATE_KEY'
]);

let cachedConfig = null;
let cachedConfigPath = null;

function hydrateEnv(configPath) {
  const dotenvPath = configPath ?? process.env.CONFIG_PATH;
  const result = dotenvPath ? loadEnv({ path: dotenvPath, override: true }) : loadEnv();

  if (result?.error) {
    if (dotenvPath) {
      throw result.error;
    }
  }

  return dotenvPath ?? '.env';
}

export function loadConfig(overrides = {}, options = {}) {
  const requestedConfigPath = options.configPath ?? overrides.CONFIG_PATH ?? process.env.CONFIG_PATH ?? null;
  if (requestedConfigPath !== cachedConfigPath) {
    hydrateEnv(requestedConfigPath);
    cachedConfigPath = requestedConfigPath ?? null;
    cachedConfig = null;
  }

  const overrideKeys = Object.keys(overrides).filter((key) => key !== 'CONFIG_PATH');
  const hasEffectiveOverrides = overrideKeys.length > 0;

  if (cachedConfig && !hasEffectiveOverrides) {
    return cachedConfig;
  }

  const defaults = { ...DEFAULT_CONFIG };

  for (const key of Object.keys(DEFAULT_CONFIG)) {
    if (SENSITIVE_DEFAULT_KEYS.has(key) && process.env[key] === undefined && overrides[key] === undefined) {
      delete defaults[key];
    }
  }

  const merged = { ...defaults, ...process.env, ...overrides };
  delete merged.CONFIG_PATH;

  cachedConfig = coerceConfig(merged);
  return cachedConfig;
}

export function getConfig() {
  return loadConfig();
}

export function resetConfigCache() {
  cachedConfig = null;
  cachedConfigPath = null;
}
