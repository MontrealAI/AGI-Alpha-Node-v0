import { config as loadEnv } from 'dotenv';
import { DEFAULT_CONFIG } from './defaults.js';
import { coerceConfig } from './schema.js';
import { join } from 'node:path';

const SENSITIVE_DEFAULT_KEYS = new Set([
  'NODE_PRIVATE_KEY',
  'VALIDATOR_PRIVATE_KEY'
]);

let cachedConfig = null;
let cachedConfigPath;

function hydrateEnv(configPath, workingDir, explicitConfigProvided) {
  const defaultPath = join(workingDir ?? process.cwd(), '.env');
  const dotenvPath = configPath ?? process.env.CONFIG_PATH ?? defaultPath;
  const result = loadEnv({ path: dotenvPath, override: explicitConfigProvided });

  if (result?.error && explicitConfigProvided) {
    throw result.error;
  }

  return dotenvPath;
}

export function loadConfig(overrides = {}, options = {}) {
  const workingDir = options.workingDir;
  const requestedConfigPath = options.configPath ?? overrides.CONFIG_PATH ?? process.env.CONFIG_PATH ?? null;
  const explicitConfigProvided =
    options.configPath !== undefined || overrides.CONFIG_PATH !== undefined || process.env.CONFIG_PATH !== undefined;
  const effectiveConfigPath = requestedConfigPath ?? join(workingDir ?? process.cwd(), '.env');

  if (cachedConfigPath === undefined || effectiveConfigPath !== cachedConfigPath) {
    hydrateEnv(requestedConfigPath, workingDir, explicitConfigProvided);
    cachedConfigPath = effectiveConfigPath;
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
  cachedConfigPath = undefined;
}
