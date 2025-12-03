import { existsSync, statSync } from 'node:fs';
import { config as loadEnv } from 'dotenv';
import { DEFAULT_CONFIG } from './defaults.js';
import { coerceConfig } from './schema.js';
import { isAbsolute, join } from 'node:path';

const SENSITIVE_DEFAULT_KEYS = new Set([
  'NODE_PRIVATE_KEY',
  'VALIDATOR_PRIVATE_KEY'
]);

let cachedBaseConfig = null;
let cachedConfigPath;
let cachedConfigMtime;
const cachedOverrideConfigs = new Map();

function getConfigMtime(configPath) {
  try {
    return statSync(configPath).mtimeMs;
  } catch {
    return null;
  }
}

function resolveConfigPath(configPath, workingDir) {
  const baseDir = workingDir ?? process.cwd();
  if (!configPath) {
    return join(baseDir, '.env');
  }
  if (isAbsolute(configPath)) {
    return configPath;
  }
  return join(baseDir, configPath);
}

function hydrateEnv(configPath, explicitConfigProvided, logger) {
  const configExists = existsSync(configPath);

  if (!configExists && explicitConfigProvided) {
    const error = new Error(`Configuration file not found at ${configPath}`);
    error.code = 'CONFIG_FILE_NOT_FOUND';
    throw error;
  }

  if (!configExists) {
    if (logger?.warn) {
      logger.warn(
        `Configuration file not found at ${configPath}; proceeding with in-memory environment variables only.`,
        { configPath }
      );
    }
    return configPath;
  }

  const result = loadEnv({ path: configPath, override: explicitConfigProvided });

  if (result?.error && explicitConfigProvided) {
    throw result.error;
  }

  return configPath;
}

export function loadConfig(overrides = {}, options = {}) {
  const workingDir = options.workingDir;
  const requestedConfigPath = options.configPath ?? overrides.CONFIG_PATH ?? process.env.CONFIG_PATH ?? null;
  const explicitConfigProvided =
    options.configPath !== undefined || overrides.CONFIG_PATH !== undefined || process.env.CONFIG_PATH !== undefined;
  const effectiveConfigPath = resolveConfigPath(requestedConfigPath, workingDir);
  const configMtime = getConfigMtime(effectiveConfigPath);
  const cacheOverrides = options.cacheOverrides ?? true;
  const logger = options.logger;

  if (cachedConfigPath === undefined || effectiveConfigPath !== cachedConfigPath || cachedConfigMtime !== configMtime) {
    hydrateEnv(effectiveConfigPath, explicitConfigProvided, logger);
    cachedConfigPath = effectiveConfigPath;
    cachedConfigMtime = configMtime;
    cachedBaseConfig = null;
    cachedOverrideConfigs.clear();
  }

  const overrideKeys = Object.keys(overrides).filter((key) => key !== 'CONFIG_PATH');
  const hasEffectiveOverrides = overrideKeys.length > 0;

  if (!hasEffectiveOverrides && cachedBaseConfig) {
    return cachedBaseConfig;
  }

  let overrideCacheKey;

  if (hasEffectiveOverrides && cacheOverrides) {
    const serialisedOverrides = overrideKeys
      .filter((key) => overrides[key] !== undefined)
      .sort()
      .map((key) => [key, overrides[key]]);
    overrideCacheKey = `${effectiveConfigPath}:${JSON.stringify(serialisedOverrides)}`;

    if (cachedOverrideConfigs.has(overrideCacheKey)) {
      return cachedOverrideConfigs.get(overrideCacheKey);
    }
  }

  const defaults = { ...DEFAULT_CONFIG };

  for (const key of Object.keys(DEFAULT_CONFIG)) {
    if (SENSITIVE_DEFAULT_KEYS.has(key) && process.env[key] === undefined && overrides[key] === undefined) {
      delete defaults[key];
    }
  }

  const baseMerged = { ...defaults, ...process.env };
  delete baseMerged.CONFIG_PATH;

  const merged = hasEffectiveOverrides ? { ...baseMerged, ...overrides } : baseMerged;

  const coerced = coerceConfig(merged);

  if (!hasEffectiveOverrides) {
    cachedBaseConfig = coerced;
  } else if (cacheOverrides && overrideCacheKey) {
    cachedOverrideConfigs.set(overrideCacheKey, coerced);
    cachedBaseConfig = coerced;
  }

  return coerced;
}

export function getConfig() {
  return loadConfig();
}

export function resetConfigCache() {
  cachedBaseConfig = null;
  cachedConfigPath = undefined;
  cachedConfigMtime = undefined;
  cachedOverrideConfigs.clear();
}
