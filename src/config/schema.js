import { z } from 'zod';
import {
  AGIALPHA_TOKEN_CHECKSUM_ADDRESS,
  AGIALPHA_TOKEN_DECIMALS,
  AGIALPHA_TOKEN_SYMBOL,
  assertCanonicalAgialphaAddress,
  normalizeTokenAddress
} from '../constants/token.js';

const addressRegex = /^0x[a-fA-F0-9]{40}$/;

const booleanFlag = z.union([
  z.boolean(),
  z.string().transform((value) => {
    const lower = value.toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(lower)) return true;
    if (['0', 'false', 'no', 'off', ''].includes(lower)) return false;
    throw new Error(`Cannot coerce boolean from "${value}"`);
  }),
  z.number().transform((value) => value !== 0)
]);

const privateKeyRegex = /^0x[a-fA-F0-9]{64}$/;

const basisPointsSchema = z.coerce.number().int().min(0).max(10_000);

function coerceRoleShareTargets(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(trimmed);
      return coerceRoleShareTargets(parsed);
    } catch {
      const entries = trimmed.split(',').map((chunk) => chunk.trim()).filter(Boolean);
      if (entries.length === 0) {
        return undefined;
      }
      const aggregated = {};
      for (const entry of entries) {
        const [role, share] = entry.split('=').map((part) => part.trim());
        if (!role || share === undefined) {
          throw new Error('ROLE_SHARE_TARGETS must use role=bps pairs when provided as CSV');
        }
        aggregated[role] = share;
      }
      return coerceRoleShareTargets(aggregated);
    }
  }
  if (typeof value !== 'object') {
    throw new Error('ROLE_SHARE_TARGETS must be an object, JSON string, or comma-separated role=bps list');
  }
  const normalized = {};
  for (const [role, share] of Object.entries(value)) {
    if (!role) {
      continue;
    }
    normalized[role] = basisPointsSchema.parse(share);
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export const configSchema = z
  .object({
    RPC_URL: z.string().url().default('https://rpc.ankr.com/eth'),
    ENS_PARENT_DOMAIN: z.string().min(3).default('alpha.node.agi.eth'),
    NODE_LABEL: z.string().min(1).optional(),
    OPERATOR_ADDRESS: z.string().regex(addressRegex).optional(),
    PLATFORM_INCENTIVES_ADDRESS: z.string().regex(addressRegex).optional(),
    STAKE_MANAGER_ADDRESS: z.string().regex(addressRegex).optional(),
    REWARD_ENGINE_ADDRESS: z.string().regex(addressRegex).optional(),
    METRICS_PORT: z.coerce.number().int().min(1024).max(65535).default(9464),
    API_PORT: z.coerce.number().int().min(1024).max(65535).default(8080),
    DRY_RUN: booleanFlag.optional().default(true),
    OPERATOR_PRIVATE_KEY: z
      .string()
      .regex(privateKeyRegex)
      .optional(),
    AUTO_STAKE: booleanFlag.optional().default(false),
    STAKE_AMOUNT: z
      .string()
      .optional()
      .transform((value) => {
        if (value === undefined || value === null) {
          return undefined;
        }
        const trimmed = value.trim();
        return trimmed.length ? trimmed : undefined;
      }),
    INTERACTIVE_STAKE: booleanFlag.optional().default(true),
    OFFLINE_SNAPSHOT_PATH: z
      .string()
      .optional()
      .transform((value) => {
        if (!value) return undefined;
        const trimmed = value.trim();
        return trimmed.length ? trimmed : undefined;
      }),
    AGIALPHA_TOKEN_ADDRESS: z
      .string()
      .regex(addressRegex)
      .default(AGIALPHA_TOKEN_CHECKSUM_ADDRESS)
      .transform((value) => normalizeTokenAddress(value))
      .superRefine((value, ctx) => {
        try {
          assertCanonicalAgialphaAddress(value);
        } catch (error) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: error instanceof Error ? error.message : 'Token must remain canonical'
          });
        }
      }),
    AGIALPHA_TOKEN_DECIMALS: z
      .coerce.number()
      .int()
      .positive()
      .default(AGIALPHA_TOKEN_DECIMALS)
      .refine((value) => value === AGIALPHA_TOKEN_DECIMALS, {
        message: `${AGIALPHA_TOKEN_SYMBOL} uses fixed decimals ${AGIALPHA_TOKEN_DECIMALS}`
      }),
    SYSTEM_PAUSE_ADDRESS: z.string().regex(addressRegex).optional(),
    DESIRED_MINIMUM_STAKE: z
      .union([z.string(), z.number(), z.bigint()])
      .optional()
      .transform((value) => {
        if (value === undefined || value === null) return undefined;
        const asString = value.toString().trim();
        if (!asString) return undefined;
        if (!/^\d+(\.\d+)?$/.test(asString)) {
          throw new Error('DESIRED_MINIMUM_STAKE must be a numeric value');
        }
        return asString;
      }),
    AUTO_RESUME: booleanFlag.optional().default(false),
    DESIRED_OPERATOR_SHARE_BPS: basisPointsSchema.optional(),
    DESIRED_VALIDATOR_SHARE_BPS: basisPointsSchema.optional(),
    DESIRED_TREASURY_SHARE_BPS: basisPointsSchema.optional(),
    ROLE_SHARE_TARGETS: z.any().optional().transform((value) => coerceRoleShareTargets(value)),
    OFFLINE_MODE: booleanFlag.optional().default(false),
    VAULT_ADDR: z.string().optional(),
    VAULT_TOKEN: z.string().optional(),
    VAULT_SECRET_PATH: z.string().optional(),
    VAULT_SECRET_KEY: z.string().optional()
  })
  .strict();

export function coerceConfig(input = {}) {
  return configSchema.parse(input);
}
