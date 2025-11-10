import { z } from 'zod';
import {
  AGIALPHA_TOKEN_CHECKSUM_ADDRESS,
  AGIALPHA_TOKEN_DECIMALS,
  AGIALPHA_TOKEN_SYMBOL,
  assertCanonicalAgialphaAddress,
  normalizeTokenAddress
} from '../constants/token.js';

const addressRegex = /^0x[a-fA-F0-9]{40}$/;

const booleanCoercion = z
  .union([
    z.boolean(),
    z.string().transform((value) => {
      const lower = value.toLowerCase();
      if (['1', 'true', 'yes', 'on'].includes(lower)) return true;
      if (['0', 'false', 'no', 'off', ''].includes(lower)) return false;
      throw new Error(`Cannot coerce boolean from "${value}"`);
    }),
    z.number().transform((value) => value !== 0)
  ])
  .default(true);

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
    DRY_RUN: booleanCoercion,
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
      })
  })
  .strict();

export function coerceConfig(input = {}) {
  return configSchema.parse(input);
}
