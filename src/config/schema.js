import { z } from 'zod';
import {
  AGIALPHA_TOKEN_CHECKSUM_ADDRESS,
  AGIALPHA_TOKEN_DECIMALS,
  AGIALPHA_TOKEN_SYMBOL,
  assertCanonicalAgialphaAddress,
  normalizeTokenAddress
} from '../constants/token.js';
import {
  MODEL_CLASS_WEIGHTS,
  VRAM_TIER_WEIGHTS,
  SLA_WEIGHTS,
  BENCHMARK_WEIGHTS,
  cloneDefaultWorkUnitConfig
} from '../constants/workUnits.js';
import { DEFAULT_ALPHA_WB_CONFIG } from '../services/alphaBenchmark.js';

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

function optionalAddress(fieldName) {
  return z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value === null) {
        return undefined;
      }

      const trimmed = String(value).trim();
      if (!trimmed) {
        return undefined;
      }

      if (!addressRegex.test(trimmed)) {
        throw new Error(`${fieldName} must be a 0x-prefixed 20-byte address`);
      }

      return trimmed;
    });
}

function optionalSecret(fieldName, minimumLength = 0) {
  return z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value === null) {
        return undefined;
      }

      const trimmed = String(value).trim();
      if (!trimmed) {
        return undefined;
      }

      if (minimumLength > 0 && trimmed.length < minimumLength) {
        throw new Error(`${fieldName} must contain at least ${minimumLength} characters when provided`);
      }

      return trimmed;
    });
}

const NODE_ROLES = ['orchestrator', 'executor', 'validator', 'mixed'];

const nodeRoleSchema = z
  .string()
  .optional()
  .transform((value) => {
    if (!value) {
      return 'mixed';
    }
    const normalized = value.toLowerCase().trim();
    if (!NODE_ROLES.includes(normalized)) {
      throw new Error(`NODE_ROLE must be one of ${NODE_ROLES.join(', ')}`);
    }
    return normalized;
  });

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

function coerceEnsAllowlist(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    const entries = value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : String(entry)))
      .filter((entry) => entry && entry.length > 0);
    return entries.length ? entries : undefined;
  }
  const stringValue = String(value).trim();
  if (!stringValue) {
    return undefined;
  }
  if (stringValue.startsWith('[')) {
    try {
      const parsed = JSON.parse(stringValue);
      return coerceEnsAllowlist(parsed);
    } catch (error) {
      throw new Error(`Unable to parse HEALTH_GATE_ALLOWLIST JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const splitEntries = stringValue
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return splitEntries.length ? splitEntries : undefined;
}

function parseProfileSpec(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'object') {
    return value;
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`Unable to parse JOB_PROFILE_SPEC: ${error.message}`);
  }
}

function parseJsonLike(value, description) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    try {
      return JSON.parse(trimmed);
    } catch (error) {
      throw new Error(`Unable to parse ${description}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return value;
}

function coerceNumeric(value, { label, positive = false, integer = false }) {
  if (value === undefined || value === null) {
    throw new Error(`${label} must be provided`);
  }
  const numeric = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(numeric)) {
    throw new Error(`${label} must be numeric`);
  }
  if (positive && numeric <= 0) {
    throw new Error(`${label} must be greater than zero`);
  }
  if (!positive && numeric < 0) {
    throw new Error(`${label} cannot be negative`);
  }
  if (integer) {
    if (!Number.isInteger(numeric)) {
      throw new Error(`${label} must be an integer`);
    }
  }
  return numeric;
}

function coerceWeightOverrides(raw, defaults, label) {
  if (raw === undefined || raw === null) {
    return { ...defaults };
  }

  const parsed = parseJsonLike(raw, `workUnits.weights.${label}`);
  if (parsed === undefined) {
    return { ...defaults };
  }

  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`workUnits.weights.${label} must be an object or JSON map`);
  }

  const normalized = { ...defaults };
  for (const [key, weight] of Object.entries(parsed)) {
    if (!(key in defaults)) {
      throw new Error(`workUnits.weights.${label} contains unknown key "${key}"`);
    }
    const numeric = coerceNumeric(weight, {
      label: `workUnits.weights.${label}.${key}`,
      positive: false,
      integer: false
    });
    normalized[key] = numeric;
  }
  return normalized;
}

function coerceWorkUnitsConfig(rawValue) {
  if (rawValue === undefined || rawValue === null) {
    return cloneDefaultWorkUnitConfig();
  }

  const parsed = parseJsonLike(rawValue, 'WORK_UNITS');
  if (parsed === undefined) {
    return cloneDefaultWorkUnitConfig();
  }

  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('WORK_UNITS must be an object or JSON specification');
  }

  const config = cloneDefaultWorkUnitConfig();

  if (parsed.baseUnit !== undefined) {
    config.baseUnit = coerceNumeric(parsed.baseUnit, { label: 'workUnits.baseUnit', positive: true });
  }

  if (parsed.epochDurationSeconds !== undefined) {
    config.epochDurationSeconds = coerceNumeric(parsed.epochDurationSeconds, {
      label: 'workUnits.epochDurationSeconds',
      positive: true,
      integer: true
    });
  }

  if (parsed.weights !== undefined) {
    if (typeof parsed.weights !== 'object' || Array.isArray(parsed.weights)) {
      throw new Error('workUnits.weights must be an object or JSON specification');
    }

    config.weights.modelClass = coerceWeightOverrides(parsed.weights.modelClass, MODEL_CLASS_WEIGHTS, 'modelClass');
    config.weights.vramTier = coerceWeightOverrides(parsed.weights.vramTier, VRAM_TIER_WEIGHTS, 'vramTier');
    config.weights.slaProfile = coerceWeightOverrides(parsed.weights.slaProfile, SLA_WEIGHTS, 'slaProfile');

    if (parsed.weights.benchmark !== undefined || Object.keys(BENCHMARK_WEIGHTS).length > 0) {
      config.weights.benchmark = coerceWeightOverrides(
        parsed.weights.benchmark,
        BENCHMARK_WEIGHTS,
        'benchmark'
      );
    }
  }

  return config;
}

const workUnitsSchema = z.union([z.undefined(), z.any()]).transform((value, ctx) => {
  try {
    return coerceWorkUnitsConfig(value);
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : String(error)
    });
    return z.NEVER;
  }
});

function coerceAlphaWbConfig(value) {
  const parsed = parseJsonLike(value, 'ALPHA_WB') ?? {};
  const config = { ...DEFAULT_ALPHA_WB_CONFIG };

  const assign = (field, { positive = false, integer = false } = {}) => {
    if (parsed[field] !== undefined) {
      config[field] = coerceNumeric(parsed[field], {
        label: `ALPHA_WB.${field}`,
        positive,
        integer
      });
    }
  };

  assign('baselineEnergyCostPerKwh', { positive: true });
  assign('baselineEnergyPerAlphaWU', { positive: true });
  assign('baselineQuality', { positive: true });
  assign('baselineConsensus', { positive: true });
  assign('energyAdjustmentFloor', { positive: true });
  assign('energyAdjustmentCap', { positive: true });
  assign('qualityAdjustmentFloor', { positive: true });
  assign('qualityAdjustmentCap', { positive: true });
  assign('consensusAdjustmentFloor', { positive: true });
  assign('consensusAdjustmentCap', { positive: true });
  assign('rebalanceCap', { positive: true });
  assign('rebalanceFloor', { positive: true });
  assign('smoothingWindowDays', { positive: true, integer: true });
  assign('baseDivisor', { positive: true, integer: true });

  if (config.energyAdjustmentFloor > config.energyAdjustmentCap) {
    throw new Error('ALPHA_WB.energyAdjustmentFloor must be <= energyAdjustmentCap');
  }
  if (config.qualityAdjustmentFloor > config.qualityAdjustmentCap) {
    throw new Error('ALPHA_WB.qualityAdjustmentFloor must be <= qualityAdjustmentCap');
  }
  if (config.consensusAdjustmentFloor > config.consensusAdjustmentCap) {
    throw new Error('ALPHA_WB.consensusAdjustmentFloor must be <= consensusAdjustmentCap');
  }
  if (config.rebalanceFloor > config.rebalanceCap) {
    throw new Error('ALPHA_WB.rebalanceFloor must be <= rebalanceCap');
  }
  if (config.baselineConsensus > 1.5) {
    throw new Error('ALPHA_WB.baselineConsensus must be realistic (<= 1.5)');
  }

  return config;
}

const alphaWbSchema = z.union([z.undefined(), z.any()]).transform((value, ctx) => {
  try {
    return coerceAlphaWbConfig(value);
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : String(error)
    });
    return z.NEVER;
  }
});

export const configSchema = z
  .object({
    RPC_URL: z.string().url().default('https://rpc.ankr.com/eth'),
    NODE_ROLE: nodeRoleSchema,
    ENS_PARENT_DOMAIN: z.string().min(3).default('alpha.node.agi.eth'),
    NODE_LABEL: z.string().min(1).optional(),
    NODE_ENS_NAME: z
      .string()
      .optional()
      .transform((value) => {
        if (!value) return undefined;
        const normalized = value.trim().toLowerCase();
        return normalized.length ? normalized : undefined;
      }),
    ENS_RPC_URL: z
      .string()
      .optional()
      .transform((value) => {
        if (!value) return undefined;
        const trimmed = value.trim();
        return trimmed.length ? trimmed : undefined;
      })
      .pipe(z.string().url().optional()),
    ENS_CHAIN_ID: z
      .union([z.string(), z.number()])
      .optional()
      .transform((value) => {
        if (value === undefined || value === null) return undefined;
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
          throw new Error('ENS_CHAIN_ID must be numeric');
        }
        const int = Math.trunc(numeric);
        if (int <= 0) {
          throw new Error('ENS_CHAIN_ID must be greater than zero');
        }
        return int;
      }),
    OPERATOR_ADDRESS: optionalAddress('OPERATOR_ADDRESS'),
    PLATFORM_INCENTIVES_ADDRESS: optionalAddress('PLATFORM_INCENTIVES_ADDRESS'),
    NODE_PAYOUT_ETH_ADDRESS: optionalAddress('NODE_PAYOUT_ETH_ADDRESS'),
    NODE_PAYOUT_AGIALPHA_ADDRESS: optionalAddress('NODE_PAYOUT_AGIALPHA_ADDRESS'),
    STAKE_MANAGER_ADDRESS: optionalAddress('STAKE_MANAGER_ADDRESS'),
    REWARD_ENGINE_ADDRESS: optionalAddress('REWARD_ENGINE_ADDRESS'),
    JOB_REGISTRY_ADDRESS: optionalAddress('JOB_REGISTRY_ADDRESS'),
    IDENTITY_REGISTRY_ADDRESS: optionalAddress('IDENTITY_REGISTRY_ADDRESS'),
    DESIRED_JOB_REGISTRY_ADDRESS: optionalAddress('DESIRED_JOB_REGISTRY_ADDRESS'),
    DESIRED_IDENTITY_REGISTRY_ADDRESS: optionalAddress('DESIRED_IDENTITY_REGISTRY_ADDRESS'),
    DESIRED_VALIDATION_MODULE_ADDRESS: optionalAddress('DESIRED_VALIDATION_MODULE_ADDRESS'),
    DESIRED_REPUTATION_MODULE_ADDRESS: optionalAddress('DESIRED_REPUTATION_MODULE_ADDRESS'),
    DESIRED_DISPUTE_MODULE_ADDRESS: optionalAddress('DESIRED_DISPUTE_MODULE_ADDRESS'),
    JOB_DISCOVERY_BLOCK_RANGE: z
      .coerce.number()
      .int()
      .positive()
      .max(500_000)
      .default(4_800),
    JOB_APPLICATION_PROOF: z
      .string()
      .optional()
      .transform((value) => {
        if (value === undefined || value === null) {
          return undefined;
        }
        const trimmed = value.trim();
        return trimmed.length ? trimmed : undefined;
      }),
    JOB_REGISTRY_PROFILE: z.string().optional().default('v0'),
    JOB_PROFILE_SPEC: z.any().optional().transform((value) => parseProfileSpec(value)),
    METRICS_PORT: z.coerce.number().int().min(1024).max(65535).default(9464),
    HEALTHCHECK_TIMEOUT: z.coerce.number().int().min(250).max(120_000).default(5000),
    VERIFIER_PORT: z.coerce.number().int().min(1024).max(65535).default(8787),
    VERIFIER_PUBLIC_BASE_URL: z
      .string()
      .optional()
      .transform((value) => {
        if (!value) return undefined;
        const trimmed = value.trim();
        if (!trimmed) return undefined;
        try {
          return new URL(trimmed).toString().replace(/\/$/, '');
        } catch (error) {
          throw new Error(`VERIFIER_PUBLIC_BASE_URL must be a valid URL: ${error.message}`);
        }
      }),
    METRICS_ALPHA_WU_PER_JOB: booleanFlag.optional().default(false),
    TELEMETRY_ENABLED: booleanFlag.optional().default(true),
    TELEMETRY_HASH_ALGO: z
      .string()
      .trim()
      .min(1)
      .default('sha256'),
    API_PORT: z.coerce.number().int().min(1024).max(65535).default(8080),
    DRY_RUN: booleanFlag.optional().default(true),
    NODE_PRIVATE_KEY: z
      .string()
      .regex(privateKeyRegex)
      .optional(),
    OPERATOR_PRIVATE_KEY: z
      .string()
      .regex(privateKeyRegex)
      .optional(),
    VALIDATOR_PRIVATE_KEY: z
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
    NODE_PRIMARY_MODEL: z
      .string()
      .optional()
      .transform((value) => {
        if (!value) return undefined;
        const trimmed = value.trim();
        return trimmed.length ? trimmed : undefined;
      }),
    SYSTEM_PAUSE_ADDRESS: optionalAddress('SYSTEM_PAUSE_ADDRESS'),
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
    VAULT_SECRET_KEY: z.string().optional(),
    GOVERNANCE_API_TOKEN: optionalSecret('GOVERNANCE_API_TOKEN', 8),
    GOVERNANCE_LEDGER_ROOT: z
      .string()
      .optional()
      .transform((value) => {
        if (!value) return undefined;
        const trimmed = value.trim();
        return trimmed.length ? trimmed : undefined;
      }),
    HEALTH_GATE_ALLOWLIST: z.any().optional().transform((value) => coerceEnsAllowlist(value)),
    HEALTH_GATE_INITIAL_STATE: booleanFlag.optional().default(false),
    HEALTH_GATE_OVERRIDE_ENS: z
      .string()
      .optional()
      .transform((value) => {
        if (!value) return undefined;
        const trimmed = value.trim();
        return trimmed.length ? trimmed : undefined;
      }),
    WORK_UNITS: workUnitsSchema,
    ALPHA_WB: alphaWbSchema,
    VALIDATION_MINIMUM_VOTES: z.coerce.number().int().min(1).default(3),
    VALIDATION_QUORUM_BPS: z.coerce.number().int().min(1).max(10_000).default(6_667),
    VALIDATOR_SOURCE_TYPE: z.string().optional().default('memory'),
    VALIDATOR_SOURCE_PATH: z
      .string()
      .optional()
      .transform((value) => {
        if (!value) return undefined;
        const trimmed = value.trim();
        return trimmed.length ? trimmed : undefined;
      }),
    VALIDATOR_SINK_TYPE: z.string().optional().default('memory'),
    LIFECYCLE_LOG_DIR: z
      .string()
      .optional()
      .transform((value) => {
        if (value === undefined || value === null) {
          return '.agi/lifecycle';
        }
        const trimmed = value.trim();
        return trimmed.length ? trimmed : '.agi/lifecycle';
      })
  })
  .strip();

export function coerceConfig(input = {}) {
  return configSchema.parse(input);
}
