import { Contract, JsonRpcProvider, getAddress, namehash } from 'ethers';
import type { EnsResolver } from 'ethers';
import { loadEnsConfig, type EnsConfig, type EnsConfigInit } from './config.js';

export interface EnsPubkey {
  readonly x: string;
  readonly y: string;
}

export interface NameWrapperData {
  readonly owner: string;
  readonly fuses: number;
  readonly expiry: bigint;
}

export interface EnsClientInit extends EnsConfigInit {
  readonly provider?: JsonRpcProvider;
}

const PUBKEY_ABI = ['function pubkey(bytes32 node) view returns (bytes32 x, bytes32 y)'];
const NAME_WRAPPER_ABI = [
  'function getData(bytes32 node) view returns (uint32 fuses, uint64 expiry, address owner)'
];

export class EnsResolutionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'EnsResolutionError';
    if (options?.cause !== undefined) {
      // @ts-expect-error cause is supported in modern runtimes
      this.cause = options.cause;
    }
  }
}

export class EnsClient {
  readonly config: EnsConfig;
  readonly provider: JsonRpcProvider;

  constructor(config: EnsConfig, provider?: JsonRpcProvider) {
    this.config = config;
    this.provider = provider ?? new JsonRpcProvider(config.rpcUrl, config.chainId);
  }

  async getResolver(name: string): Promise<string | null> {
    const resolver = await this.provider.getResolver(name);
    return resolver?.address ?? null;
  }

  async getPubkey(name: string): Promise<EnsPubkey | null> {
    const resolver = await this.#requireResolver(name);
    const contract = new Contract(resolver.address, PUBKEY_ABI, this.provider);
    const [xRaw, yRaw] = (await contract.pubkey(namehash(name))) as readonly [string, string];

    if (this.#isZeroBytes(xRaw) && this.#isZeroBytes(yRaw)) {
      return null;
    }

    return {
      x: xRaw,
      y: yRaw
    } satisfies EnsPubkey;
  }

  async getTextRecord(name: string, key: string): Promise<string | null> {
    const resolver = await this.#requireResolver(name);
    return resolver.getText(key);
  }

  async getContenthash(name: string): Promise<string | null> {
    const resolver = await this.#requireResolver(name);
    try {
      return await resolver.getContentHash();
    } catch (error) {
      if (this.#isRecordMissingError(error)) {
        return null;
      }
      throw error;
    }
  }

  async getNameWrapperData(name: string): Promise<NameWrapperData | null> {
    if (!this.config.nameWrapper) {
      return null;
    }

    const contract = new Contract(this.config.nameWrapper, NAME_WRAPPER_ABI, this.provider);
    try {
      const [fusesRaw, expiryRaw, ownerRaw] = (await contract.getData(namehash(name))) as readonly [
        bigint,
        bigint,
        string
      ];

      return {
        owner: getAddress(ownerRaw),
        fuses: Number(fusesRaw),
        expiry: BigInt(expiryRaw)
      } satisfies NameWrapperData;
    } catch (error) {
      if (this.#isRecordMissingError(error)) {
        return null;
      }
      throw error;
    }
  }

  async #requireResolver(name: string): Promise<EnsResolver> {
    const resolver = await this.provider.getResolver(name);
    if (!resolver) {
      throw new EnsResolutionError(`Resolver not configured for ${name}`);
    }
    return resolver;
  }

  #isZeroBytes(value: string): boolean {
    return /^0x0+$/i.test(value);
  }

  #isRecordMissingError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();
    if (message.includes('name is not wrapped')) {
      return true;
    }
    if (message.includes('missing revert data') || message.includes('execution reverted')) {
      return true;
    }

    // ethers v6 uses a custom error shape
    if (typeof (error as { code?: unknown }).code === 'string') {
      const code = (error as { code: string }).code.toLowerCase();
      if (code === 'call_exception' || code === 'resolver_missing') {
        return true;
      }
    }

    return false;
  }
}

let cachedClient: EnsClient | null = null;

export function getEnsClient(init: EnsClientInit = {}): EnsClient {
  const { provider, forceReload, overrides, config } = init;

  if (!provider && !forceReload && !overrides && cachedClient) {
    return cachedClient;
  }

  const ensConfig = loadEnsConfig({ overrides, config, forceReload });
  const effectiveProvider = provider ?? new JsonRpcProvider(ensConfig.rpcUrl, ensConfig.chainId);
  const client = new EnsClient(ensConfig, effectiveProvider);

  if (!provider && !forceReload && !overrides) {
    cachedClient = client;
  }

  return client;
}

export function clearEnsClientCache(): void {
  cachedClient = null;
}
