import { DEFAULT_CONFIG } from '../config/defaults.js';
import { getConfig, loadConfig } from '../config/env.js';
import { getAddress } from 'ethers';
import { z } from 'zod';

export interface EnsNetworkPreset {
  readonly ensRegistry: string;
  readonly nameWrapper?: string | null;
  readonly publicResolver?: string | null;
}

export interface EnsConfigOverrides {
  readonly chainId?: number | string;
  readonly rpcUrl?: string;
  readonly ensRegistry?: string;
  readonly nameWrapper?: string | null;
  readonly publicResolver?: string | null;
}

export interface EnsConfigInit {
  readonly overrides?: EnsConfigOverrides;
  readonly config?: Record<string, unknown> | null;
  readonly forceReload?: boolean;
}

export interface EnsConfig {
  readonly chainId: number;
  readonly rpcUrl: string;
  readonly ensRegistry: string;
  readonly nameWrapper: string | null;
  readonly publicResolver: string | null;
}

const DEFAULT_CHAIN_ID = 1;
const EIP_55_ERROR = 'Expected EIP-55 address';

function checksumAddress(value: string): string {
  return getAddress(value);
}

const addressSchema = z.string().trim().transform((value, ctx) => {
  try {
    return checksumAddress(value);
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: EIP_55_ERROR });
    return z.NEVER;
  }
});

const configSchema = z.object({
  chainId: z
    .number()
    .int()
    .positive({ message: 'chainId must be a positive integer' }),
  rpcUrl: z.string().trim().url({ message: 'rpcUrl must be a valid URL' }),
  ensRegistry: addressSchema,
  nameWrapper: addressSchema.nullable(),
  publicResolver: addressSchema.nullable()
});

function normalizePreset(preset: EnsNetworkPreset): EnsNetworkPreset {
  return Object.freeze({
    ensRegistry: checksumAddress(preset.ensRegistry),
    nameWrapper: preset.nameWrapper ? checksumAddress(preset.nameWrapper) : null,
    publicResolver: preset.publicResolver ? checksumAddress(preset.publicResolver) : null
  });
}

const PRESET_NETWORKS: Readonly<Record<number, EnsNetworkPreset>> = Object.freeze({
  1: normalizePreset({
    ensRegistry: '0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e',
    nameWrapper: '0xd4416b13d2b3a9abae7acd5d6c2bbdbe25686401',
    publicResolver: '0x231b0ee14048e9dccd1d247744d114a4eb5e8e63'
  }),
  11155111: normalizePreset({
    ensRegistry: '0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e',
    nameWrapper: '0x0635513f179d50a207757e05759cbd106d7dfce8',
    publicResolver: '0xe99638b40e4fff0129d56f03b55b6bbc4bbe49b5'
  })
});

let cachedConfig: EnsConfig | null = null;

function safeGetBaseConfig(explicit: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (explicit) {
    return explicit;
  }

  try {
    return getConfig();
  } catch (error) {
    try {
      return loadConfig();
    } catch {
      return {};
    }
  }
}

function pickFirstDefined(keys: readonly string[], sources: readonly Record<string, unknown>[]): unknown {
  for (const source of sources) {
    for (const key of keys) {
      const value = source[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return value;
      }
    }
  }
  return undefined;
}

function normalizeChainId(value: unknown): number {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_CHAIN_ID;
  }

  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`Invalid chainId: ${value}`);
    }
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return DEFAULT_CHAIN_ID;
    }

    const parsed = trimmed.startsWith('0x') ? Number.parseInt(trimmed, 16) : Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(`Invalid chainId: ${value}`);
    }
    return parsed;
  }

  throw new Error(`Unsupported chainId value type: ${typeof value}`);
}

function normalizeOptionalAddress(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error('Address overrides must be strings');
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return addressSchema.parse(trimmed);
}

function resolvePreset(chainId: number): EnsNetworkPreset | null {
  return PRESET_NETWORKS[chainId] ?? null;
}

export function loadEnsConfig(init: EnsConfigInit = {}): EnsConfig {
  const { overrides, config, forceReload } = init;

  if (!forceReload && !overrides && cachedConfig) {
    return cachedConfig;
  }

  const baseConfig = safeGetBaseConfig(config);
  const mergedSources: Record<string, unknown>[] = [
    overrides ?? {},
    process.env as Record<string, unknown>,
    baseConfig,
    DEFAULT_CONFIG as Record<string, unknown>
  ];

  const chainId = normalizeChainId(
    pickFirstDefined(['chainId', 'CHAIN_ID', 'ALPHA_NODE_CHAIN_ID'], mergedSources)
  );

  const preset = resolvePreset(chainId);

  const rpcUrlRaw =
    pickFirstDefined(['rpcUrl', 'ALPHA_NODE_RPC_URL', 'RPC_URL'], mergedSources) ?? DEFAULT_CONFIG.RPC_URL;
  const ensRegistryRaw =
    pickFirstDefined(
      ['ensRegistry', 'ALPHA_NODE_ENS_REGISTRY', 'ENS_REGISTRY', 'ENS_REGISTRY_ADDRESS'],
      mergedSources
    ) ?? preset?.ensRegistry;
  const nameWrapperRaw =
    pickFirstDefined(['nameWrapper', 'ALPHA_NODE_NAME_WRAPPER', 'NAME_WRAPPER'], mergedSources) ??
    preset?.nameWrapper ??
    null;
  const publicResolverRaw =
    pickFirstDefined(['publicResolver', 'ALPHA_NODE_PUBLIC_RESOLVER', 'PUBLIC_RESOLVER'], mergedSources) ??
    preset?.publicResolver ??
    null;

  if (!ensRegistryRaw) {
    throw new Error('ENS registry address must be provided via overrides, environment variables, or presets.');
  }

  const candidateConfig = {
    chainId,
    rpcUrl: String(rpcUrlRaw).trim(),
    ensRegistry: addressSchema.parse(String(ensRegistryRaw).trim()),
    nameWrapper: normalizeOptionalAddress(nameWrapperRaw),
    publicResolver: normalizeOptionalAddress(publicResolverRaw)
  } satisfies EnsConfig;

  const parsed = configSchema.parse(candidateConfig);

  if (!forceReload && !overrides) {
    cachedConfig = Object.freeze(parsed);
  }

  return parsed;
}

export function clearEnsConfigCache(): void {
  cachedConfig = null;
}

export { PRESET_NETWORKS };
