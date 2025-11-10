import pino from 'pino';

const DEFAULT_SECRET_KEY = 'operatorPrivateKey';
const DEFAULT_TIMEOUT_MS = 5000;

function normalizeVaultUrl(addr, path) {
  const base = addr.endsWith('/') ? addr : `${addr}/`;
  const normalizedPath = path.replace(/^\//, '');
  return new URL(`v1/${normalizedPath}`, base).toString();
}

function extractSecretKey(payload, key) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  if (payload[key]) {
    return payload[key];
  }
  if (payload.data && typeof payload.data === 'object') {
    return extractSecretKey(payload.data, key);
  }
  return null;
}

export async function fetchVaultSecret({
  addr,
  token,
  path,
  key = DEFAULT_SECRET_KEY,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  logger = pino({ level: 'info', name: 'vault-secret-manager' })
}) {
  if (!addr || !token || !path) {
    throw new Error('addr, token, and path are required to fetch Vault secrets');
  }

  const url = normalizeVaultUrl(addr, path);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Vault-Token': token,
        Accept: 'application/json'
      },
      signal: controller.signal
    });

    if (!response.ok) {
      const error = new Error(`Vault responded with status ${response.status}`);
      error.status = response.status;
      throw error;
    }

    const payload = await response.json();
    const secret = extractSecretKey(payload, key);
    if (typeof secret !== 'string' || secret.trim().length === 0) {
      throw new Error(`Secret key "${key}" not found in Vault response`);
    }
    return secret.trim();
  } catch (error) {
    logger.error(
      {
        error: error.message,
        url,
        timeoutMs
      },
      'Failed to fetch secret from Vault'
    );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function hydrateOperatorPrivateKey(config, {
  logger = pino({ level: 'info', name: 'vault-secret-manager' })
} = {}) {
  if (!config) {
    throw new Error('config is required to hydrate secrets');
  }

  if (config.OPERATOR_PRIVATE_KEY) {
    return config;
  }

  const addr = config.VAULT_ADDR;
  const token = config.VAULT_TOKEN;
  const path = config.VAULT_SECRET_PATH;
  const key = config.VAULT_SECRET_KEY || DEFAULT_SECRET_KEY;

  if (!addr || !token || !path) {
    logger.debug('Vault configuration incomplete – skipping secret hydration.');
    return config;
  }

  try {
    const secret = await fetchVaultSecret({ addr, token, path, key, logger });
    config.OPERATOR_PRIVATE_KEY = secret;
    logger.info({ path, key }, 'Operator private key hydrated from Vault');
  } catch (error) {
    logger.warn(
      {
        path,
        key,
        error: error.message
      },
      'Unable to hydrate operator private key from Vault'
    );
  }

  return config;
}
