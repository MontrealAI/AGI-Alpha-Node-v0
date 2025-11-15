import pino from 'pino';

class IdentityModuleError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'IdentityModuleError';
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

let tsxLoaderPromise = null;

async function ensureTsxLoader(logger) {
  if (!tsxLoaderPromise) {
    tsxLoaderPromise = import('tsx/esm').catch((error) => {
      tsxLoaderPromise = null;
      logger?.error?.(error, 'Failed to initialize tsx runtime for TypeScript modules');
      throw new IdentityModuleError('Unable to load TypeScript runtime via tsx/esm', { cause: error });
    });
  }
  await tsxLoaderPromise;
}

function createCachedImporter(specifier) {
  let modulePromise = null;
  return async (logger) => {
    if (!modulePromise) {
      modulePromise = ensureTsxLoader(logger)
        .then(() => import(specifier))
        .catch((error) => {
          modulePromise = null;
          throw error;
        });
    }
    return modulePromise;
  };
}

// The ENS identity sources are TypeScript modules; ensure we point the loader at the
// `.ts` files so the tsx runtime can transpile them at import time.
const importIdentityLoader = createCachedImporter(new URL('./loader.ts', import.meta.url).href);
const importIdentityKeys = createCachedImporter(new URL('./keys.ts', import.meta.url).href);

function resolveLogger(logger) {
  if (logger) {
    return logger;
  }
  return pino({ level: 'info', name: 'identity-bootstrap' });
}

export async function loadNodeIdentityRecord(ensName, { metadataKeys, logger } = {}) {
  const effectiveLogger = resolveLogger(logger);
  if (typeof ensName !== 'string' || !ensName.trim()) {
    throw new IdentityModuleError('ENS name is required to hydrate node identity');
  }
  const normalizedName = ensName.trim();
  const module = await importIdentityLoader(effectiveLogger);
  return module.loadNodeIdentity(normalizedName, { metadataKeys, logger: effectiveLogger });
}

export async function loadNodeKeypairFromSource(options = {}) {
  const effectiveLogger = resolveLogger(options.logger);
  const module = await importIdentityKeys(effectiveLogger);
  return module.loadNodeKeypair({ ...options, logger: effectiveLogger });
}

export async function validateKeypairAgainstEnsRecord(nodeIdentity, keypair, options = {}) {
  const effectiveLogger = resolveLogger(options.logger);
  const module = await importIdentityKeys(effectiveLogger);
  return module.validateKeypairAgainstENS(nodeIdentity, keypair, { logger: effectiveLogger });
}

export async function hydrateNodeIdentityAndKeys(ensName, { metadataKeys, logger, keyOptions } = {}) {
  const effectiveLogger = resolveLogger(logger);
  const [identity, keyModule] = await Promise.all([
    loadNodeIdentityRecord(ensName, { metadataKeys, logger: effectiveLogger }),
    importIdentityKeys(effectiveLogger)
  ]);
  const keypair = keyModule.loadNodeKeypair({ ...(keyOptions ?? {}), logger: effectiveLogger });
  keyModule.validateKeypairAgainstENS(identity, keypair, { logger: effectiveLogger });
  return { identity, keypair };
}

export { IdentityModuleError };
