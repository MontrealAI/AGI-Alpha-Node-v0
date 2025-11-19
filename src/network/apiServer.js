import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { context as otelContext, propagation, SpanKind, SpanStatusCode, trace as otelTrace } from '@opentelemetry/api';
import pino from 'pino';
import { getAddress, parseUnits } from 'ethers';
import { z } from 'zod';
import { evaluateJobRequest } from '../intelligence/agentRuntime.js';
import {
  buildSystemPauseTx,
  buildMinimumStakeTx,
  buildValidatorThresholdTx,
  buildStakeRegistryUpgradeTx,
  buildRoleShareTx,
  buildGlobalSharesTx,
  buildJobRegistryUpgradeTx,
  buildDisputeTriggerTx,
  buildIdentityDelegateTx,
  buildEmissionPerEpochTx,
  buildEmissionEpochLengthTx,
  buildEmissionCapTx,
  buildEmissionRateMultiplierTx,
  buildNodeRegistrationTx,
  buildNodeMetadataTx,
  buildNodeStatusTx,
  buildNodeOperatorTx,
  buildNodeWorkMeterTx,
  buildWorkMeterValidatorTx,
  buildWorkMeterOracleTx,
  buildWorkMeterWindowTx,
  buildWorkMeterProductivityIndexTx,
  buildWorkMeterUsageTx,
  buildProductivityRecordTx,
  buildProductivityEmissionManagerTx,
  buildProductivityWorkMeterTx,
  buildProductivityTreasuryTx,
  buildIncentivesStakeManagerTx,
  buildIncentivesMinimumStakeTx,
  buildIncentivesHeartbeatTx,
  buildIncentivesActivationFeeTx,
  buildIncentivesTreasuryTx,
  getOwnerFunctionCatalog
} from '../services/governance.js';
import { buildStakeAndActivateTx } from '../services/staking.js';
import { recordGovernanceAction } from '../services/governanceLedger.js';
import { buildEpochPayload } from '../services/oracleExport.js';
import { getLifetimeAlphaWU, getRecentEpochSummaries } from '../services/metering.js';
import {
  TelemetryAuthError,
  TelemetryConflictError,
  TelemetryIngestionService,
  TelemetryNotFoundError,
  TelemetryValidationError
} from '../services/telemetryIngestion.js';
import { createGlobalIndexEngine } from '../services/globalIndexEngine.js';
import { createSyntheticLaborEngine } from '../services/syntheticLaborEngine.js';
import { getTelemetryTracer } from '../telemetry/monitoring.js';

function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload, (_, value) => (typeof value === 'bigint' ? value.toString() : value));
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function applyRateLimitHeaders(res, rateLimit) {
  if (!rateLimit) return;
  if (rateLimit.limit !== undefined) {
    res.setHeader('X-RateLimit-Limit', rateLimit.limit);
  }
  if (rateLimit.remaining !== undefined) {
    res.setHeader('X-RateLimit-Remaining', Math.max(rateLimit.remaining, 0));
  }
  if (rateLimit.windowEndsAt instanceof Date) {
    res.setHeader('X-RateLimit-Reset', Math.floor(rateLimit.windowEndsAt.getTime() / 1000));
  }
}

function applyCorsHeaders(req, res, corsOrigin) {
  if (!corsOrigin) {
    return;
  }

  const requestOrigin = req.headers?.origin;
  const allowOrigin = corsOrigin === '*' || !requestOrigin || requestOrigin === corsOrigin ? corsOrigin : null;
  if (allowOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    res.setHeader('Access-Control-Max-Age', '600');
  }
}

function snapshotCounter(counter) {
  if (!counter?.get) {
    return { timestamp: Date.now(), values: {} };
  }
  const { values = [] } = counter.get();
  const snapshot = {};
  for (const sample of values) {
    const labels = sample.labels ?? {};
    const key = JSON.stringify(labels);
    snapshot[key] = { labels, value: Number(sample.value ?? 0) };
  }
  return { timestamp: Date.now(), values: snapshot };
}

function updateCounterHistory(history, counter, windowMs) {
  const snapshot = snapshotCounter(counter);
  history.push(snapshot);
  const cutoff = snapshot.timestamp - windowMs;
  while (history.length > 1 && history[0].timestamp < cutoff) {
    history.shift();
  }
  return snapshot;
}

function aggregateDelta(samples, field = 'rate', deriveKey = (labels) => JSON.stringify(labels)) {
  const output = {};
  Object.values(samples ?? {}).forEach(({ labels, [field]: value }) => {
    const key = deriveKey(labels ?? {});
    output[key] = (output[key] ?? 0) + (Number.isFinite(value) ? value : 0);
  });
  return output;
}

function computeCounterDelta(history) {
  if (!history?.length) {
    return { delta: {}, windowSeconds: 0 };
  }
  const current = history[history.length - 1];
  const baseline = history[0];
  const windowSeconds = Math.max((current.timestamp - baseline.timestamp) / 1000, 1);
  const keys = new Set([...Object.keys(current.values ?? {}), ...Object.keys(baseline.values ?? {})]);
  const delta = {};
  keys.forEach((key) => {
    const currentValue = current.values?.[key]?.value ?? 0;
    const baselineValue = baseline.values?.[key]?.value ?? 0;
    const labels = current.values?.[key]?.labels ?? baseline.values?.[key]?.labels ?? {};
    const diff = currentValue - baselineValue;
    delta[key] = {
      labels,
      total: diff,
      rate: diff / windowSeconds
    };
  });
  return { delta, windowSeconds };
}

async function sumCounterByLabel(counter, deriveKey = (labels) => JSON.stringify(labels)) {
  const metric = counter?.get?.();
  const snapshot = metric && typeof metric.then === 'function' ? await metric : metric;
  const { values = [] } = snapshot ?? {};
  return values.reduce((acc, sample) => {
    const key = deriveKey(sample.labels ?? {});
    acc[key] = (acc[key] ?? 0) + Number(sample.value ?? 0);
    return acc;
  }, {});
}

function clampWindowMinutes(value, fallback = 15, maxMinutes = 60) {
  const numeric = Number.parseInt(value ?? `${fallback}`, 10);
  if (!Number.isFinite(numeric)) return fallback;
  const bounded = Math.max(1, Math.min(numeric, maxMinutes));
  return bounded;
}

function instrumentHttpRequest({ tracer, req, res, logger }) {
  const startedAt = process.hrtime.bigint();
  const extractedContext = propagation.extract(otelContext.active(), req.headers ?? {});
  const span = tracer?.startSpan(
    'http.server',
    {
      kind: SpanKind.SERVER,
      attributes: {
        'http.method': req.method ?? 'UNKNOWN',
        'http.target': req.url ?? '',
        'http.route': req.url ?? 'unrouted'
      }
    },
    extractedContext
  );

  const spanContext = span ? otelTrace.setSpan(extractedContext, span) : extractedContext;
  let ended = false;

  const endSpan = (statusCode = res.statusCode ?? 0, error = null) => {
    if (!span || ended) {
      ended = true;
      return;
    }
    ended = true;
    const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    span.setAttribute('http.status_code', statusCode);
    span.setAttribute('http.server.latency_ms', latencyMs);
    span.setStatus({
      code: statusCode >= 500 ? SpanStatusCode.ERROR : SpanStatusCode.OK,
      message: statusCode >= 500 ? `HTTP ${statusCode}` : undefined
    });
    if (error) {
      span.recordException(error);
    }
    span.end();
  };

  res.on('finish', () => endSpan(res.statusCode ?? 0));
  res.on('close', () => endSpan(res.statusCode ?? 0));

  return {
    span,
    context: spanContext,
    updateRoute: (route) => span?.setAttribute('http.route', route ?? ''),
    runWithContext: async (fn) => otelContext.with(spanContext, fn),
    end: endSpan,
    recordError: (error) => {
      if (!span || !error) return;
      span.recordException(error);
      logger?.warn?.(error, 'HTTP handler raised');
    }
  };
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req
      .on('data', (chunk) => chunks.push(chunk))
      .on('end', () => {
        if (chunks.length === 0) {
          resolve(null);
          return;
        }
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve(parsed);
        } catch (error) {
          reject(error);
        }
      })
      .on('error', (error) => reject(error));
  });
}

function extractApiKey(req) {
  const headerKey = req.headers?.['x-api-key'];
  if (typeof headerKey === 'string' && headerKey.trim().length > 0) {
    return headerKey.trim();
  }
  const authHeader = req.headers?.authorization;
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

function cloneValue(value) {
  if (value === null) {
    return null;
  }
  const valueType = typeof value;
  if (valueType === 'bigint' || valueType === 'number' || valueType === 'boolean' || valueType === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => cloneValue(entry));
  }
  if (valueType === 'object') {
    const clone = {};
    for (const [key, nested] of Object.entries(value)) {
      clone[key] = cloneValue(nested);
    }
    return clone;
  }
  return value;
}

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normaliseBreakdownEntries(entries = {}) {
  return Object.fromEntries(
    Object.entries(entries)
      .map(([key, value]) => [key, toFiniteNumber(value, 0)])
      .filter(([, value]) => Number.isFinite(value))
      .sort(([a], [b]) => a.localeCompare(b))
  );
}

function mergeAlphaBreakdown(target, source = {}) {
  for (const [key, value] of Object.entries(source)) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      continue;
    }
    target[key] = (target[key] ?? 0) + numeric;
  }
}

function sanitizeActions(actions) {
  if (actions === undefined) {
    return null;
  }
  if (!Array.isArray(actions)) {
    throw new Error('actions must be an array');
  }
  return actions.map((action, index) => {
    if (!action || typeof action !== 'object' || Array.isArray(action)) {
      throw new Error(`actions[${index}] must be an object`);
    }
    if (typeof action.type !== 'string' || action.type.trim().length === 0) {
      throw new Error(`actions[${index}].type must be a non-empty string`);
    }
    const sanitized = {};
    for (const [key, value] of Object.entries(action)) {
      if (key === 'type') {
        sanitized.type = action.type.trim();
      } else if (key === 'level') {
        sanitized.level = typeof value === 'string' ? value.trim() : String(value);
      } else if (key === 'reason') {
        sanitized.reason = typeof value === 'string' ? value : String(value);
      } else {
        sanitized[key] = cloneValue(value);
      }
    }
    if (!sanitized.type) {
      sanitized.type = action.type.trim();
    }
    return sanitized;
  });
}

function sanitizeNotices(notices) {
  if (notices === undefined) {
    return null;
  }
  if (!Array.isArray(notices)) {
    throw new Error('notices must be an array');
  }
  return notices.map((notice, index) => {
    if (notice === undefined || notice === null) {
      return '';
    }
    if (typeof notice === 'string') {
      return notice;
    }
    if (typeof notice === 'number' || typeof notice === 'boolean' || typeof notice === 'bigint') {
      return String(notice);
    }
    throw new Error(`notices[${index}] must be a string, number, boolean, or bigint`);
  });
}

function sanitizeContext(context) {
  if (context === undefined) {
    return null;
  }
  if (context === null) {
    return null;
  }
  if (typeof context !== 'object' || Array.isArray(context)) {
    throw new Error('context must be an object');
  }
  return cloneValue(context);
}

const checksumAddressSchema = z
  .string()
  .min(1)
  .transform((value, ctx) => {
    try {
      return getAddress(value);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid address: ${error instanceof Error ? error.message : String(error)}`
      });
      return z.NEVER;
    }
  });

const decimalAmountSchema = z
  .union([z.string(), z.number(), z.bigint()])
  .transform((value, ctx) => {
    const asString = typeof value === 'string' ? value.trim() : value.toString();
    if (!/^\d+(\.\d{0,18})?$/.test(asString)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'amount must be numeric with up to 18 decimals'
      });
      return z.NEVER;
    }
    try {
      parseUnits(asString, 18);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : String(error)
      });
      return z.NEVER;
    }
    return asString;
  });

const basisPointsSchema = z.coerce.number().int().min(0).max(10_000);

const nonEmptyStringSchema = z.string().min(1);

const numericLikeSchema = z
  .union([z.string(), z.number(), z.bigint()])
  .transform((value, ctx) => {
    const asString = typeof value === 'string' ? value.trim() : value.toString();
    if (!asString) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'value must be numeric'
      });
      return z.NEVER;
    }
    return asString;
  });

const optionalNumericLikeSchema = z
  .union([z.string(), z.number(), z.bigint()])
  .optional()
  .transform((value, ctx) => {
    if (value === undefined || value === null) {
      return null;
    }
    const asString = typeof value === 'string' ? value.trim() : value.toString();
    if (!asString) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'value must be numeric'
      });
      return z.NEVER;
    }
    return asString;
  });

const bigIntSchema = z
  .union([z.string(), z.number(), z.bigint()])
  .transform((value, ctx) => {
    const asString = typeof value === 'string' ? value.trim() : value.toString();
    if (!/^-?\d+$/.test(asString)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'value must be an integer'
      });
      return z.NEVER;
    }
    try {
      return BigInt(asString);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : String(error)
      });
      return z.NEVER;
    }
  });

const booleanFlagSchema = z
  .union([
    z.boolean(),
    z.string().transform((value) => {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
      if (['false', '0', 'no', 'off'].includes(normalized)) return false;
      throw new Error('value must be a boolean-like flag');
    })
  ])
  .transform((value) => Boolean(value));

const tagsSchema = z
  .union([
    z.array(z.string()),
    z.string()
  ])
  .optional()
  .transform((value) => {
    if (!value) {
      return [];
    }
    if (Array.isArray(value)) {
      return value.map((tag) => tag.trim()).filter((tag) => tag.length > 0);
    }
    return value
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  });

const governanceCommonSchema = z.object({
  dryRun: z.boolean().optional().default(true),
  confirm: z.boolean().optional().default(false),
  signature: z.string().optional(),
  operator: checksumAddressSchema.optional(),
  tags: tagsSchema.default([])
});

function extractAuthToken(req) {
  const header = req.headers['authorization'];
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  const alt = req.headers['x-owner-token'];
  if (typeof alt === 'string') {
    return alt.trim();
  }
  if (Array.isArray(alt) && alt.length > 0) {
    return String(alt[0]).trim();
  }
  return null;
}

function ensureOwnerAuthorization(req, ownerToken) {
  if (!ownerToken) {
    const error = new Error('Governance API token is not configured');
    error.statusCode = 500;
    throw error;
  }
  const provided = extractAuthToken(req);
  if (!provided || provided !== ownerToken) {
    const error = new Error('Owner authorization required');
    error.statusCode = 401;
    throw error;
  }
}

function enforcePublicReadAuth(req, res, publicApiKey) {
  if (!publicApiKey) {
    return true;
  }
  const provided = extractApiKey(req);
  if (provided && provided === publicApiKey) {
    return true;
  }
  jsonResponse(res, 401, { error: 'API key required for this endpoint' });
  return false;
}

function normalizeListInput(value) {
  if (value === undefined || value === null) {
    return [];
  }
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((entry) => String(entry).trim()).filter(Boolean)));
  }
  const trimmed = String(value).trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      return normalizeListInput(parsed);
    } catch (error) {
      throw new Error(`Unable to parse list: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return Array.from(new Set(trimmed.split(/[\s,]+/).map((entry) => entry.trim()).filter(Boolean)));
}

function toDateOnly(value) {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

function addDays(date, offset) {
  const parsed = toDateOnly(date);
  if (!parsed) return null;
  const d = new Date(parsed);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

function parsePaginationParams(url, { defaultLimit = 50, maxLimit = 200 } = {}) {
  const limitParam = url.searchParams.get('limit');
  const offsetParam = url.searchParams.get('offset');
  const parsedLimit = Number.parseInt(limitParam ?? defaultLimit, 10);
  const parsedOffset = Number.parseInt(offsetParam ?? '0', 10);
  const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(parsedLimit, maxLimit)) : defaultLimit;
  const offset = Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0;
  return { limit, offset };
}

function resolveDateRange(url, { defaultDays = 30 } = {}) {
  const to = toDateOnly(url.searchParams.get('to')) ?? new Date().toISOString().slice(0, 10);
  const fromParam = url.searchParams.get('from');
  const from = toDateOnly(fromParam) ?? addDays(to, -1 * (defaultDays - 1));
  if (!from || !to) {
    throw new Error('Invalid date range supplied');
  }
  if (Date.parse(from) > Date.parse(to)) {
    throw new Error('from must be on or before to');
  }
  return { from, to };
}

const systemPauseSchema = governanceCommonSchema
  .extend({
    systemPauseAddress: checksumAddressSchema.optional(),
    contract: checksumAddressSchema.optional(),
    action: z.string().optional()
  })
  .transform((value) => {
    const { contract, systemPauseAddress, ...rest } = value;
    const resolved = systemPauseAddress ?? contract;
    if (!resolved) {
      throw new Error('systemPauseAddress is required');
    }
    return { ...rest, systemPauseAddress: resolved };
  });

const minimumStakeSchema = governanceCommonSchema
  .extend({
    stakeManagerAddress: checksumAddressSchema,
    amount: decimalAmountSchema,
    currentAmount: decimalAmountSchema.optional(),
    current: decimalAmountSchema.optional()
  })
  .transform((value) => {
    const { currentAmount, current, ...rest } = value;
    return { ...rest, currentAmount: currentAmount ?? current ?? null };
  });

const validatorThresholdSchema = governanceCommonSchema
  .extend({
    stakeManagerAddress: checksumAddressSchema,
    threshold: bigIntSchema,
    currentThreshold: bigIntSchema.optional(),
    current: bigIntSchema.optional()
  })
  .transform((value) => {
    const { currentThreshold, current, ...rest } = value;
    return { ...rest, currentThreshold: currentThreshold ?? current ?? null };
  });

const registryUpgradeSchema = governanceCommonSchema.extend({
  stakeManagerAddress: checksumAddressSchema,
  registryType: z.string().min(2),
  newAddress: checksumAddressSchema,
  currentAddress: checksumAddressSchema.optional()
});

const roleShareSchema = governanceCommonSchema.extend({
  rewardEngineAddress: checksumAddressSchema,
  role: z.string().min(1),
  shareBps: basisPointsSchema,
  currentShareBps: basisPointsSchema.optional()
});

const globalSharesSchema = governanceCommonSchema
  .extend({
    rewardEngineAddress: checksumAddressSchema,
    operatorShareBps: basisPointsSchema,
    validatorShareBps: basisPointsSchema,
    treasuryShareBps: basisPointsSchema,
    operatorBps: basisPointsSchema.optional(),
    validatorBps: basisPointsSchema.optional(),
    treasuryBps: basisPointsSchema.optional(),
    currentOperatorShareBps: basisPointsSchema.optional(),
    currentValidatorShareBps: basisPointsSchema.optional(),
    currentTreasuryShareBps: basisPointsSchema.optional(),
    currentOperatorBps: basisPointsSchema.optional(),
    currentValidatorBps: basisPointsSchema.optional(),
    currentTreasuryBps: basisPointsSchema.optional()
  })
  .transform((value) => {
    const operatorShare = value.operatorShareBps ?? value.operatorBps;
    const validatorShare = value.validatorShareBps ?? value.validatorBps;
    const treasuryShare = value.treasuryShareBps ?? value.treasuryBps;
    if (
      operatorShare === undefined ||
      validatorShare === undefined ||
      treasuryShare === undefined
    ) {
      throw new Error('operatorShareBps, validatorShareBps, and treasuryShareBps are required');
    }
    const currentShares = {};
    let hasCurrent = false;
    const currentOperator = value.currentOperatorShareBps ?? value.currentOperatorBps;
    if (currentOperator !== undefined) {
      currentShares.operatorShare = currentOperator;
      hasCurrent = true;
    }
    const currentValidator = value.currentValidatorShareBps ?? value.currentValidatorBps;
    if (currentValidator !== undefined) {
      currentShares.validatorShare = currentValidator;
      hasCurrent = true;
    }
    const currentTreasury = value.currentTreasuryShareBps ?? value.currentTreasuryBps;
    if (currentTreasury !== undefined) {
      currentShares.treasuryShare = currentTreasury;
      hasCurrent = true;
    }
    return {
      ...value,
      operatorShareBps: operatorShare,
      validatorShareBps: validatorShare,
      treasuryShareBps: treasuryShare,
      currentShares: hasCurrent ? currentShares : null
    };
  });

const jobModuleSchema = governanceCommonSchema.extend({
  jobRegistryAddress: checksumAddressSchema,
  module: z.string().min(2),
  newAddress: checksumAddressSchema,
  currentAddress: checksumAddressSchema.optional()
});

const disputeSchema = governanceCommonSchema.extend({
  jobRegistryAddress: checksumAddressSchema,
  jobId: bigIntSchema,
  reason: z.string().optional()
});

const identityDelegateSchema = governanceCommonSchema.extend({
  identityRegistryAddress: checksumAddressSchema,
  operatorAddress: checksumAddressSchema,
  allowed: booleanFlagSchema,
  currentAllowed: booleanFlagSchema.optional()
});

const emissionPerEpochSchema = governanceCommonSchema
  .extend({
    emissionManagerAddress: checksumAddressSchema,
    emissionPerEpoch: decimalAmountSchema,
    decimals: z.coerce.number().int().min(0).max(36).optional(),
    currentEmissionPerEpoch: optionalNumericLikeSchema,
    current: optionalNumericLikeSchema
  })
  .transform((value) => {
    const decimals = value.decimals ?? 18;
    const currentRaw = value.currentEmissionPerEpoch ?? value.current;
    return {
      ...value,
      decimals,
      currentEmissionPerEpoch: currentRaw ? parseUnits(currentRaw, decimals) : null
    };
  });

const emissionEpochLengthSchema = governanceCommonSchema.extend({
  emissionManagerAddress: checksumAddressSchema,
  epochLengthSeconds: bigIntSchema,
  currentEpochLengthSeconds: bigIntSchema.optional(),
  current: bigIntSchema.optional()
});

const emissionCapSchema = governanceCommonSchema
  .extend({
    emissionManagerAddress: checksumAddressSchema,
    emissionCap: decimalAmountSchema,
    decimals: z.coerce.number().int().min(0).max(36).optional(),
    currentEmissionCap: optionalNumericLikeSchema,
    current: optionalNumericLikeSchema
  })
  .transform((value) => {
    const decimals = value.decimals ?? 18;
    const currentRaw = value.currentEmissionCap ?? value.current;
    return {
      ...value,
      decimals,
      currentEmissionCap: currentRaw ? parseUnits(currentRaw, decimals) : null
    };
  });

const emissionMultiplierSchema = governanceCommonSchema
  .extend({
    emissionManagerAddress: checksumAddressSchema,
    numerator: bigIntSchema,
    denominator: bigIntSchema,
    currentNumerator: bigIntSchema.optional(),
    currentDenominator: bigIntSchema.optional(),
    current: z
      .object({ numerator: bigIntSchema, denominator: bigIntSchema })
      .optional()
  })
  .transform((value) => {
    const current = value.current
      ? { numerator: value.current.numerator, denominator: value.current.denominator }
      : null;
    const numerator = value.currentNumerator ?? current?.numerator ?? null;
    const denominator = value.currentDenominator ?? current?.denominator ?? null;
    return {
      ...value,
      currentMultiplier:
        numerator !== null && denominator !== null ? { numerator, denominator } : null
    };
  });

const nodeRegistrationSchema = governanceCommonSchema
  .extend({
    nodeRegistryAddress: checksumAddressSchema,
    nodeId: nonEmptyStringSchema,
    operatorAddress: checksumAddressSchema,
    metadataUri: nonEmptyStringSchema
  })
  .transform((value) => ({
    ...value,
    metadataURI: value.metadataUri
  }));

const nodeMetadataSchema = governanceCommonSchema
  .extend({
    nodeRegistryAddress: checksumAddressSchema,
    nodeId: nonEmptyStringSchema,
    metadataUri: nonEmptyStringSchema,
    currentMetadataUri: z.string().optional(),
    current: z.string().optional()
  })
  .transform((value) => ({
    ...value,
    metadataURI: value.metadataUri,
    currentMetadataURI: value.currentMetadataUri ?? value.current ?? null
  }));

const nodeStatusSchema = governanceCommonSchema
  .extend({
    nodeRegistryAddress: checksumAddressSchema,
    nodeId: nonEmptyStringSchema,
    active: booleanFlagSchema,
    currentStatus: booleanFlagSchema.optional(),
    current: booleanFlagSchema.optional()
  })
  .transform((value) => ({
    ...value,
    currentStatus: value.currentStatus ?? value.current ?? null
  }));

const nodeOperatorSchema = governanceCommonSchema
  .extend({
    nodeRegistryAddress: checksumAddressSchema,
    operatorAddress: checksumAddressSchema,
    allowed: booleanFlagSchema,
    currentAllowed: booleanFlagSchema.optional(),
    current: booleanFlagSchema.optional()
  })
  .transform((value) => ({
    ...value,
    currentAllowed: value.currentAllowed ?? value.current ?? null
  }));

const nodeWorkMeterSchema = governanceCommonSchema
  .extend({
    nodeRegistryAddress: checksumAddressSchema,
    workMeterAddress: checksumAddressSchema,
    currentWorkMeter: checksumAddressSchema.optional(),
    current: checksumAddressSchema.optional()
  })
  .transform((value) => ({
    ...value,
    currentWorkMeter: value.currentWorkMeter ?? value.current ?? null
  }));

const workMeterValidatorSchema = governanceCommonSchema
  .extend({
    workMeterAddress: checksumAddressSchema,
    validatorAddress: checksumAddressSchema,
    allowed: booleanFlagSchema,
    currentAllowed: booleanFlagSchema.optional(),
    current: booleanFlagSchema.optional()
  })
  .transform((value) => ({
    ...value,
    currentAllowed: value.currentAllowed ?? value.current ?? null
  }));

const workMeterOracleSchema = governanceCommonSchema
  .extend({
    workMeterAddress: checksumAddressSchema,
    oracleAddress: checksumAddressSchema,
    allowed: booleanFlagSchema,
    currentAllowed: booleanFlagSchema.optional(),
    current: booleanFlagSchema.optional()
  })
  .transform((value) => ({
    ...value,
    currentAllowed: value.currentAllowed ?? value.current ?? null
  }));

const workMeterWindowSchema = governanceCommonSchema
  .extend({
    workMeterAddress: checksumAddressSchema,
    submissionWindowSeconds: bigIntSchema,
    currentWindowSeconds: bigIntSchema.optional(),
    current: bigIntSchema.optional()
  })
  .transform((value) => ({
    ...value,
    currentWindowSeconds: value.currentWindowSeconds ?? value.current ?? null
  }));

const workMeterProductivitySchema = governanceCommonSchema
  .extend({
    workMeterAddress: checksumAddressSchema,
    productivityIndexAddress: checksumAddressSchema,
    currentProductivityIndex: checksumAddressSchema.optional(),
    current: checksumAddressSchema.optional()
  })
  .transform((value) => ({
    ...value,
    currentProductivityIndex: value.currentProductivityIndex ?? value.current ?? null
  }));

const workMeterUsageSchema = governanceCommonSchema.extend({
  workMeterAddress: checksumAddressSchema,
  reportId: nonEmptyStringSchema,
  nodeId: nonEmptyStringSchema,
  gpuSeconds: numericLikeSchema,
  gflopsNorm: numericLikeSchema,
  modelTier: numericLikeSchema,
  sloPass: numericLikeSchema,
  quality: numericLikeSchema,
  usageHash: z.string().optional(),
  metricDecimals: z.coerce.number().int().min(0).max(36).optional()
});

const productivityRecordSchema = governanceCommonSchema
  .extend({
    productivityIndexAddress: checksumAddressSchema,
    epoch: bigIntSchema,
    alphaWu: decimalAmountSchema,
    tokensEmitted: decimalAmountSchema.optional(),
    tokensBurned: decimalAmountSchema.optional(),
    decimals: z.coerce.number().int().min(0).max(36).optional()
  })
  .transform((value) => ({
    ...value,
    decimals: value.decimals ?? 18,
    tokensEmitted: value.tokensEmitted ?? '0',
    tokensBurned: value.tokensBurned ?? '0'
  }));

const productivityEmissionSchema = governanceCommonSchema
  .extend({
    productivityIndexAddress: checksumAddressSchema,
    emissionManagerAddress: checksumAddressSchema,
    currentEmissionManager: checksumAddressSchema.optional(),
    current: checksumAddressSchema.optional()
  })
  .transform((value) => ({
    ...value,
    currentEmissionManager: value.currentEmissionManager ?? value.current ?? null
  }));

const productivityWorkMeterSchema = governanceCommonSchema
  .extend({
    productivityIndexAddress: checksumAddressSchema,
    workMeterAddress: checksumAddressSchema,
    currentWorkMeter: checksumAddressSchema.optional(),
    current: checksumAddressSchema.optional()
  })
  .transform((value) => ({
    ...value,
    currentWorkMeter: value.currentWorkMeter ?? value.current ?? null
  }));

const productivityTreasurySchema = governanceCommonSchema
  .extend({
    productivityIndexAddress: checksumAddressSchema,
    treasuryAddress: checksumAddressSchema,
    currentTreasury: checksumAddressSchema.optional(),
    current: checksumAddressSchema.optional()
  })
  .transform((value) => ({
    ...value,
    currentTreasury: value.currentTreasury ?? value.current ?? null
  }));

const incentivesStakeManagerSchema = governanceCommonSchema
  .extend({
    incentivesAddress: checksumAddressSchema,
    stakeManagerAddress: checksumAddressSchema,
    currentStakeManager: checksumAddressSchema.optional(),
    current: checksumAddressSchema.optional()
  })
  .transform((value) => ({
    ...value,
    currentStakeManager: value.currentStakeManager ?? value.current ?? null
  }));

const incentivesMinimumStakeSchema = governanceCommonSchema
  .extend({
    incentivesAddress: checksumAddressSchema,
    amount: decimalAmountSchema,
    decimals: z.coerce.number().int().min(0).max(36).optional(),
    currentMinimum: optionalNumericLikeSchema,
    current: optionalNumericLikeSchema
  })
  .transform((value) => {
    const decimals = value.decimals ?? 18;
    const currentRaw = value.currentMinimum ?? value.current;
    return {
      ...value,
      decimals,
      currentMinimum: currentRaw ? parseUnits(currentRaw, decimals) : null
    };
  });

const incentivesHeartbeatSchema = governanceCommonSchema
  .extend({
    incentivesAddress: checksumAddressSchema,
    graceSeconds: bigIntSchema,
    currentGraceSeconds: bigIntSchema.optional(),
    current: bigIntSchema.optional()
  })
  .transform((value) => ({
    ...value,
    currentGraceSeconds: value.currentGraceSeconds ?? value.current ?? null
  }));

const incentivesActivationFeeSchema = governanceCommonSchema
  .extend({
    incentivesAddress: checksumAddressSchema,
    feeAmount: decimalAmountSchema,
    decimals: z.coerce.number().int().min(0).max(36).optional(),
    currentFee: optionalNumericLikeSchema,
    current: optionalNumericLikeSchema
  })
  .transform((value) => {
    const decimals = value.decimals ?? 18;
    const currentRaw = value.currentFee ?? value.current;
    return {
      ...value,
      decimals,
      currentFee: currentRaw ? parseUnits(currentRaw, decimals) : null
    };
  });

const incentivesTreasurySchema = governanceCommonSchema
  .extend({
    incentivesAddress: checksumAddressSchema,
    treasuryAddress: checksumAddressSchema,
    currentTreasury: checksumAddressSchema.optional(),
    current: checksumAddressSchema.optional()
  })
  .transform((value) => ({
    ...value,
    currentTreasury: value.currentTreasury ?? value.current ?? null
  }));

export function startAgentApi({
  port = 8080,
  offlineMode = false,
  jobLifecycle = null,
  logger = pino({ level: 'info', name: 'agent-api' }),
  ownerToken = null,
  ledgerRoot = process.cwd(),
  healthGate = null,
  telemetry = null,
  publicApiKey = null,
  corsOrigin = null,
  peerScoreStore = null,
  networkMetrics = null,
  reachabilityState = null,
  resourceManager = null,
  connectionManager = null,
  tracer: tracerOverride = null
} = {}) {
  const jobs = new Map();
  const lifecycleJobs = new Map();
  const metrics = {
    submitted: 0,
    completed: 0,
    failed: 0,
    tokensEarned: 0n,
    lastJobProvider: offlineMode ? 'offline' : 'local',
    lastProjectedReward: 0n,
    chain: {
      applications: 0,
      submissions: 0,
      finalizations: 0
    },
    governance: {
      directivesUpdates: 0,
      payloads: 0,
      ledgerEntries: 0
    }
  };

  const { tracer, stop: stopTracer } = tracerOverride
    ? { tracer: tracerOverride, stop: async () => {} }
    : getTelemetryTracer({ logger });

  const telemetryService =
    telemetry instanceof TelemetryIngestionService
      ? telemetry
      : new TelemetryIngestionService({
          logger: typeof logger.child === 'function' ? logger.child({ subsystem: 'telemetry' }) : logger
        });

  const sharedDb = telemetryService.db;
  const indexEngine = createGlobalIndexEngine({
    db: sharedDb,
    logger: typeof logger.child === 'function' ? logger.child({ subsystem: 'gsl-index' }) : logger
  });
  const laborEngine = createSyntheticLaborEngine({
    db: sharedDb,
    logger: typeof logger.child === 'function' ? logger.child({ subsystem: 'synthetic-labor' }) : logger
  });
  const publicReadKey = typeof publicApiKey === 'string' && publicApiKey.trim().length > 0 ? publicApiKey.trim() : null;
  const allowedCorsOrigin = typeof corsOrigin === 'string' && corsOrigin.trim().length > 0 ? corsOrigin.trim() : null;

  const reachabilityTimeline = [];
  const reachabilityTracker = reachabilityState;
  const metricsHistory = {
    connectionsOpen: [],
    connectionsClose: [],
    inboundConnections: [],
    netDialSuccessTotal: [],
    netDialFailTotal: []
  };

  const resolveHealthGateState = () => (healthGate ? healthGate.getState() : null);

  const exportBanState = () => ({
    ips: Array.from(resourceManager?.limits?.ipLimiter?.bannedIps ?? []),
    peers: Array.from(resourceManager?.limits?.ipLimiter?.bannedPeers ?? []),
    asns: Array.from(resourceManager?.limits?.ipLimiter?.bannedAsns ?? [])
  });

  const describeConnectionManager = () =>
    connectionManager
      ? {
          lowWater: connectionManager.lowWater,
          highWater: connectionManager.highWater,
          gracePeriodSeconds: connectionManager.gracePeriodSeconds
        }
      : null;

  const reachabilitySnapshot = () => {
    if (reachabilityTracker?.getSnapshot) {
      return reachabilityTracker.getSnapshot();
    }
    const state = reachabilityTracker?.getState?.() ?? reachabilityTracker ?? 'unknown';
    return { state, source: 'unknown', overridden: false, updatedAt: null };
  };

  if (reachabilityTracker?.subscribe) {
    reachabilityTracker.subscribe((snapshot) => {
      reachabilityTimeline.push({
        state: snapshot?.state ?? 'unknown',
        source: snapshot?.source ?? 'unknown',
        overridden: snapshot?.overridden ?? false,
        updatedAt: snapshot?.updatedAt ?? Date.now()
      });
      while (reachabilityTimeline.length > 120) {
        reachabilityTimeline.shift();
      }
    });
  } else {
    const initial = reachabilitySnapshot();
    reachabilityTimeline.push({
      state: initial.state ?? 'unknown',
      source: initial.source ?? 'unknown',
      overridden: initial.overridden ?? false,
      updatedAt: initial.updatedAt ?? Date.now()
    });
  }

  let lifecycleSubscription = null;
  let lifecycleActionSubscription = null;
  let ownerDirectives = {
    priority: 'nominal',
    actions: [],
    notices: [],
    context: {}
  };

  function exportOwnerDirectives() {
    return {
      priority: ownerDirectives.priority,
      actions: Array.isArray(ownerDirectives.actions)
        ? ownerDirectives.actions.map((action) => cloneValue(action))
        : [],
      notices: Array.isArray(ownerDirectives.notices)
        ? ownerDirectives.notices.map((notice) => (typeof notice === 'string' ? notice : String(notice)))
        : [],
      context:
        ownerDirectives.context && typeof ownerDirectives.context === 'object'
          ? cloneValue(ownerDirectives.context)
          : {}
    };
  }

  function buildRequestMeta(req) {
    const activeSpan = otelTrace.getSpan(otelContext.active());
    return {
      ip: req.socket?.remoteAddress ?? null,
      userAgent: req.headers?.['user-agent'] ?? null,
      traceId: activeSpan?.spanContext?.().traceId ?? null
    };
  }

  function handleTelemetryFailure(res, error) {
    if (
      error instanceof TelemetryAuthError ||
      error instanceof TelemetryValidationError ||
      error instanceof TelemetryConflictError ||
      error instanceof TelemetryNotFoundError
    ) {
      const payload = {
        error: error.message,
        details: error.details ?? undefined
      };
      jsonResponse(res, error.statusCode ?? 400, payload);
      return true;
    }
    return false;
  }

  async function handleGovernanceRequest(req, res, schema, builder) {
    try {
      ensureOwnerAuthorization(req, ownerToken);
    } catch (authError) {
      logger.warn(authError, 'Unauthorized governance request');
      jsonResponse(res, authError.statusCode ?? 401, { error: authError.message });
      return;
    }

    let parsed;
    try {
      const body = await parseRequestBody(req);
      parsed = schema.parse(body ?? {});
    } catch (error) {
      logger.error(error, 'Invalid governance payload');
      jsonResponse(res, 400, { error: error.message });
      return;
    }

    try {
      const built = builder(parsed);
      const { meta, to, data, ...details } = built;
      const dryRun = parsed.dryRun !== false;
      const response = {
        dryRun,
        tx: { to, data },
        meta,
        details
      };
      if (!dryRun) {
        if (!parsed.confirm) {
          throw new Error('Owner confirmation required to persist payload');
        }
        const ledgerResult = recordGovernanceAction({
          payload: { to, data },
          meta,
          signature: parsed.signature ?? null,
          operator: parsed.operator ?? null,
          tags: parsed.tags ?? [],
          rootDir: ledgerRoot
        });
        metrics.governance.ledgerEntries += 1;
        response.ledgerEntry = {
          id: ledgerResult.entry.id,
          recordedAt: ledgerResult.entry.recordedAt,
          path: ledgerResult.filePath
        };
      }
      metrics.governance.payloads += 1;
      jsonResponse(res, 200, response);
    } catch (error) {
      logger.error(error, 'Failed to construct governance payload');
      const status = error.statusCode ?? (error.message?.includes('confirmation') ? 409 : 400);
      jsonResponse(res, status, { error: error.message });
    }
  }

  if (jobLifecycle) {
    try {
      jobLifecycle.listJobs().forEach((job) => {
        if (job?.jobId) {
          lifecycleJobs.set(job.jobId, job);
        }
      });
    } catch (error) {
      logger.warn(error, 'Failed to seed lifecycle jobs from initial snapshot');
    }
    lifecycleSubscription = jobLifecycle.on('job:update', (job) => {
      if (job?.jobId) {
        lifecycleJobs.set(job.jobId, job);
      }
    });
    lifecycleActionSubscription = jobLifecycle.on('action', (action) => {
      metrics.lastJobProvider = 'agi-jobs';
      if (!action?.type) return;
      if (action.type === 'apply') {
        metrics.chain.applications += 1;
      } else if (action.type === 'submit') {
        metrics.chain.submissions += 1;
      } else if (action.type === 'finalize') {
        metrics.chain.finalizations += 1;
      }
    });
  }

  const server = http.createServer(async (req, res) => {
    const instrumentation = instrumentHttpRequest({ tracer, req, res, logger });

    const handleRequest = async () => {
      applyCorsHeaders(req, res, allowedCorsOrigin);

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      let requestUrl;
      try {
        requestUrl = new URL(req.url, 'http://localhost');
      } catch (error) {
        jsonResponse(res, 400, { error: error instanceof Error ? error.message : String(error) });
        return;
      }

      const { pathname } = requestUrl;

      if (!req.url) {
        jsonResponse(res, 404, { error: 'Not found' });
        return;
      }

      instrumentation.updateRoute(pathname || 'unrouted');

      if (req.method === 'GET' && pathname === '/debug/peerscore') {
        if (!peerScoreStore) {
          jsonResponse(res, 503, { error: 'Peer score registry unavailable' });
          return;
        }
        const requestedLimit = Number.parseInt(requestUrl.searchParams.get('limit') ?? '10', 10);
        const limit = Number.isFinite(requestedLimit)
          ? Math.min(Math.max(requestedLimit, 1), 100)
          : 10;
        const direction = requestUrl.searchParams.get('direction') === 'asc' ? 'asc' : 'desc';
        jsonResponse(res, 200, peerScoreStore.summarize({ limit, direction }));
        return;
      }

      if (req.method === 'GET' && pathname === '/debug/resources') {
        if (!resourceManager) {
          jsonResponse(res, 503, { error: 'Resource manager unavailable' });
          return;
        }
        const snapshot = resourceManager.metrics();
        const limits = snapshot.limitsGrid ?? snapshot.limits ?? {};
        const usage = snapshot.usage ?? {};
        const nrmDenials = networkMetrics
          ? {
              byLimitType: await sumCounterByLabel(networkMetrics.nrmDenialsTotal, (labels) => labels.limit_type ?? 'unknown'),
              byProtocol: await sumCounterByLabel(networkMetrics.nrmDenialsTotal, (labels) => labels.protocol ?? 'unknown')
            }
          : null;
        const connectionManagerStats = networkMetrics
          ? {
              trims: await sumCounterByLabel(networkMetrics.connmanagerTrimsTotal, (labels) => labels.reason ?? 'unknown')
            }
          : null;
        jsonResponse(res, 200, {
          limits,
          usage,
          metrics: snapshot,
          bans: exportBanState(),
          connectionManager: describeConnectionManager(),
          nrmDenials,
          connectionManagerStats
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/debug/network') {
        if (!networkMetrics) {
          jsonResponse(res, 503, { error: 'Network telemetry unavailable' });
          return;
        }

        const windowMinutes = clampWindowMinutes(requestUrl.searchParams.get('window'), 15, 90);
        const windowMs = windowMinutes * 60 * 1000;

        updateCounterHistory(metricsHistory.connectionsOpen, networkMetrics.connectionsOpen, windowMs);
        updateCounterHistory(metricsHistory.connectionsClose, networkMetrics.connectionsClose, windowMs);
        updateCounterHistory(metricsHistory.inboundConnections, networkMetrics.inboundConnections, windowMs);
        updateCounterHistory(metricsHistory.netDialSuccessTotal, networkMetrics.netDialSuccessTotal, windowMs);
        updateCounterHistory(metricsHistory.netDialFailTotal, networkMetrics.netDialFailTotal, windowMs);

        const opensDelta = computeCounterDelta(metricsHistory.connectionsOpen);
        const closesDelta = computeCounterDelta(metricsHistory.connectionsClose);
        const inboundDelta = computeCounterDelta(metricsHistory.inboundConnections);
        const dialSuccessDelta = computeCounterDelta(metricsHistory.netDialSuccessTotal);
        const dialFailDelta = computeCounterDelta(metricsHistory.netDialFailTotal);

        const liveConnections = {
          in: networkMetrics.liveConnections?.in ?? 0,
          out: networkMetrics.liveConnections?.out ?? 0,
          total: (networkMetrics.liveConnections?.in ?? 0) + (networkMetrics.liveConnections?.out ?? 0)
        };

        const opensPerSec = aggregateDelta(opensDelta.delta, 'rate', (labels) => labels.direction ?? 'unknown');
        const closesPerSec = aggregateDelta(closesDelta.delta, 'rate', (labels) => labels.direction ?? 'unknown');
        const closeReasonsPerSec = aggregateDelta(
          closesDelta.delta,
          'rate',
          (labels) => `${labels.direction ?? 'unknown'}:${labels.reason ?? 'unknown'}`
        );

        const inboundConnectionsRecent = aggregateDelta(
          inboundDelta.delta,
          'total',
          (labels) => labels.transport ?? 'unknown'
        );
        const dialSuccessRecent = aggregateDelta(
          dialSuccessDelta.delta,
          'total',
          (labels) => labels.transport ?? 'unknown'
        );
        const dialFailureRecent = aggregateDelta(
          dialFailDelta.delta,
          'total',
          (labels) => labels.transport ?? 'unknown'
        );
        const dialFailureReasonsRecent = aggregateDelta(
          dialFailDelta.delta,
          'total',
          (labels) => `${labels.transport ?? 'unknown'}:${labels.reason ?? 'unknown'}`
        );

        const dialSuccessTotals = await sumCounterByLabel(
          networkMetrics.netDialSuccessTotal,
          (labels) => labels.transport ?? 'unknown'
        );
        const dialFailureTotals = await sumCounterByLabel(
          networkMetrics.netDialFailTotal,
          (labels) => labels.transport ?? 'unknown'
        );
        const dialFailureReasonsTotals = await sumCounterByLabel(
          networkMetrics.netDialFailTotal,
          (labels) => `${labels.transport ?? 'unknown'}:${labels.reason ?? 'unknown'}`
        );

        const inboundTotals = await sumCounterByLabel(
          networkMetrics.inboundConnections,
          (labels) => labels.transport ?? 'unknown'
        );
        const connectionsByTransport = {};
        const transports = new Set([
          ...Object.keys(inboundConnectionsRecent),
          ...Object.keys(dialSuccessRecent),
          ...Object.keys(dialFailureRecent)
        ]);
        transports.forEach((transport) => {
          connectionsByTransport[transport] =
            (inboundConnectionsRecent[transport] ?? 0) + (dialSuccessRecent[transport] ?? 0);
        });
        if (Object.keys(connectionsByTransport).length === 0) {
          const fallbackTransports = new Set([
            ...Object.keys(inboundTotals),
            ...Object.keys(dialSuccessTotals)
          ]);
          fallbackTransports.forEach((transport) => {
            connectionsByTransport[transport] = (inboundTotals[transport] ?? 0) + (dialSuccessTotals[transport] ?? 0);
          });
        }
        const connectionsTotal = Object.values(connectionsByTransport).reduce((sum, value) => sum + value, 0);
        const transportShare = Object.fromEntries(
          Object.entries(connectionsByTransport).map(([transport, value]) => [
            transport,
            connectionsTotal > 0 ? value / connectionsTotal : 0
          ])
        );
        const cumulativeSuccess = Object.values(dialSuccessTotals).reduce((sum, value) => sum + value, 0);
        const cumulativeFailure = Object.values(dialFailureTotals).reduce((sum, value) => sum + value, 0);
        const cumulativeRate =
          cumulativeSuccess + cumulativeFailure > 0
            ? cumulativeSuccess / (cumulativeSuccess + cumulativeFailure)
            : null;

        const recentSuccessTotal = Object.values(dialSuccessRecent).reduce((sum, value) => sum + value, 0);
        const recentFailureTotal = Object.values(dialFailureRecent).reduce((sum, value) => sum + value, 0);
        const recentSuccessRate =
          dialSuccessDelta.windowSeconds > 0
            ? recentSuccessTotal / ((recentSuccessTotal + recentFailureTotal) || 1)
            : null;

        jsonResponse(res, 200, {
          reachability: {
            current: reachabilitySnapshot(),
            timeline: reachabilityTimeline.slice(-90)
          },
          churn: {
            windowSeconds: Math.max(opensDelta.windowSeconds, closesDelta.windowSeconds),
            live: liveConnections,
            opensPerSec,
            closesPerSec,
            closeReasonsPerSec
          },
          dials: {
            windowSeconds: Math.max(dialSuccessDelta.windowSeconds, dialFailDelta.windowSeconds),
            recent: {
              success: dialSuccessRecent,
              failure: dialFailureRecent,
              failureReasons: dialFailureReasonsRecent,
              successRate: recentSuccessRate
            },
            cumulative: {
              success: dialSuccessTotals,
              failure: dialFailureTotals,
              failureReasons: dialFailureReasonsTotals,
              successRate: cumulativeRate
            }
          },
          transportPosture: {
            windowSeconds: Math.max(inboundDelta.windowSeconds, dialSuccessDelta.windowSeconds),
            connectionsByTransport,
            share: transportShare
          },
          windowMinutes
        });
        return;
      }

      if (req.method === 'POST' && req.url === '/ingest/task-runs') {
        try {
          const body = await parseRequestBody(req);
          const apiKey = extractApiKey(req);
          const result = telemetryService.ingestTaskRun({
            payload: body ?? {},
            apiKey,
            requestMeta: buildRequestMeta(req)
          });
          applyRateLimitHeaders(res, result.rateLimit);
          jsonResponse(res, 202, {
            task_run: result.taskRun,
            provider: { id: result.provider.id, name: result.provider.name, region: result.provider.region }
          });
        } catch (error) {
          if (handleTelemetryFailure(res, error)) {
            return;
          }
          logger.error(error, 'Task run telemetry ingest failed');
          jsonResponse(res, 500, { error: 'Internal server error' });
        }
        return;
      }

      if (req.method === 'POST' && req.url === '/ingest/energy') {
        try {
          const body = await parseRequestBody(req);
          const apiKey = extractApiKey(req);
          const result = telemetryService.ingestEnergy({
            payload: body ?? {},
            apiKey,
            requestMeta: buildRequestMeta(req)
          });
          applyRateLimitHeaders(res, result.rateLimit);
          jsonResponse(res, 202, {
            energy_report: result.energyReport,
            task_run: { id: result.taskRun.id, external_id: result.taskRun.external_id },
            provider: { id: result.provider.id, name: result.provider.name }
          });
        } catch (error) {
          if (handleTelemetryFailure(res, error)) {
            return;
          }
          logger.error(error, 'Energy telemetry ingest failed');
          jsonResponse(res, 500, { error: 'Internal server error' });
        }
        return;
      }

      if (req.method === 'POST' && req.url === '/ingest/quality') {
        try {
          const body = await parseRequestBody(req);
          const apiKey = extractApiKey(req);
          const result = telemetryService.ingestQuality({
            payload: body ?? {},
            apiKey,
            requestMeta: buildRequestMeta(req)
          });
          applyRateLimitHeaders(res, result.rateLimit);
          jsonResponse(res, 202, {
            quality_evaluation: result.qualityEvaluation,
            task_run: { id: result.taskRun.id, external_id: result.taskRun.external_id },
            provider: { id: result.provider.id, name: result.provider.name }
          });
        } catch (error) {
          if (handleTelemetryFailure(res, error)) {
            return;
          }
          logger.error(error, 'Quality telemetry ingest failed');
          jsonResponse(res, 500, { error: 'Internal server error' });
        }
        return;
      }

      if (req.method === 'GET' && pathname === '/index/latest') {
        if (!enforcePublicReadAuth(req, res, publicReadKey)) {
          return;
        }

        try {
          const latest = indexEngine.indexValues.listRecent(1)[0];
          if (!latest) {
            jsonResponse(res, 404, { error: 'No index values available' });
            return;
          }

          const weightSet = latest.weight_set_id ? indexEngine.weightSets.getById(latest.weight_set_id) : null;
          const constituents = weightSet ? indexEngine.constituentWeights.listForWeightSet(weightSet.id) : [];
          const providerMap = new Map(indexEngine.providers.list().map((provider) => [provider.id, provider]));

          jsonResponse(res, 200, {
            index: latest,
            weight_set: weightSet,
            constituents: constituents.map((entry) => ({
              ...entry,
              provider:
                providerMap.get(entry.provider_id)
                  ? {
                      id: providerMap.get(entry.provider_id).id,
                      name: providerMap.get(entry.provider_id).name,
                      region: providerMap.get(entry.provider_id).region,
                      sector_tags: providerMap.get(entry.provider_id).sector_tags,
                      energy_mix: providerMap.get(entry.provider_id).energy_mix
                    }
                  : { id: entry.provider_id }
            }))
          });
        } catch (error) {
          logger.error(error, 'Failed to serve latest index');
          jsonResponse(res, 500, { error: 'Failed to load latest index value' });
        }
        return;
      }

      if (req.method === 'GET' && pathname === '/index/history') {
        if (!enforcePublicReadAuth(req, res, publicReadKey)) {
          return;
        }

        try {
          const window = resolveDateRange(requestUrl, { defaultDays: 30 });
          const { limit, offset } = parsePaginationParams(requestUrl, { defaultLimit: 30, maxLimit: 365 });
          const total = indexEngine.indexValues.countBetween(window.from, window.to);
          const items = indexEngine.indexValues.listBetween(window.from, window.to, { limit, offset });
          const nextOffset = offset + items.length < total ? offset + items.length : null;

          jsonResponse(res, 200, {
            window,
            pagination: { total, limit, offset, nextOffset },
            items
          });
        } catch (error) {
          logger.warn(error, 'Failed to load index history');
          jsonResponse(res, 400, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (req.method === 'GET' && pathname === '/providers') {
        if (!enforcePublicReadAuth(req, res, publicReadKey)) {
          return;
        }

        const { limit, offset } = parsePaginationParams(requestUrl, { defaultLimit: 25, maxLimit: 200 });
        const providers = laborEngine.providers.list();
        const slice = providers.slice(offset, offset + limit);
        const enriched = slice.map((provider) => ({
          ...provider,
          latest_score: laborEngine.syntheticLaborScores.findLatestForProvider(provider.id) ?? null
        }));
        const nextOffset = offset + slice.length < providers.length ? offset + slice.length : null;

        jsonResponse(res, 200, {
          providers: enriched,
          pagination: { total: providers.length, limit, offset, nextOffset }
        });
        return;
      }

      if (
        req.method === 'GET' &&
        pathname.startsWith('/providers/') &&
        pathname.endsWith('/scores') &&
        pathname.split('/').filter(Boolean).length === 3
      ) {
        if (!enforcePublicReadAuth(req, res, publicReadKey)) {
          return;
        }

        const [, providerIdRaw] = pathname.split('/').filter(Boolean);
        const providerId = Number.isNaN(Number(providerIdRaw)) ? providerIdRaw : Number(providerIdRaw);
        const provider = laborEngine.providers.getById(providerId);
        if (!provider) {
          jsonResponse(res, 404, { error: 'Provider not found' });
          return;
        }

        try {
          const window = resolveDateRange(requestUrl, { defaultDays: 30 });
          const { limit, offset } = parsePaginationParams(requestUrl, { defaultLimit: 30, maxLimit: 365 });
          const total = laborEngine.syntheticLaborScores.countForProviderBetween(provider.id, window.from, window.to);
          const scores = laborEngine.syntheticLaborScores.listForProviderBetween(provider.id, window.from, window.to, {
            limit,
            offset
          });
          const nextOffset = offset + scores.length < total ? offset + scores.length : null;

          jsonResponse(res, 200, {
            provider,
            window,
            pagination: { total, limit, offset, nextOffset },
            scores
          });
        } catch (error) {
          logger.warn(error, 'Failed to load provider scores');
          jsonResponse(res, 400, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (req.method === 'GET' && pathname === '/telemetry/task-runs') {
        if (!enforcePublicReadAuth(req, res, publicReadKey)) {
          return;
        }

        const providerFilter = requestUrl.searchParams.get('provider') ?? requestUrl.searchParams.get('providerId');
        const providerId = providerFilter
          ? Number.isNaN(Number.parseInt(providerFilter, 10))
            ? null
            : Number.parseInt(providerFilter, 10)
          : null;

        if (providerFilter && providerId === null) {
          jsonResponse(res, 400, { error: 'provider must be numeric' });
          return;
        }

        try {
          const window = resolveDateRange(requestUrl, { defaultDays: 7 });
          const { limit, offset } = parsePaginationParams(requestUrl, { defaultLimit: 25, maxLimit: 200 });
          const total = telemetryService.taskRuns.countBetween(window.from, window.to, { providerId });
          const runs = telemetryService.taskRuns.listBetween(window.from, window.to, { providerId, limit, offset });
          const providerMap = new Map(laborEngine.providers.list().map((provider) => [provider.id, provider]));
          const taskTypeMap = new Map(laborEngine.taskTypes.list().map((type) => [type.id, type]));
          const nextOffset = offset + runs.length < total ? offset + runs.length : null;

          const taskRuns = runs.map((run) => ({
            ...run,
            provider: providerMap.get(run.provider_id) ?? { id: run.provider_id },
            task_type: run.task_type_id ? taskTypeMap.get(run.task_type_id) ?? { id: run.task_type_id } : null,
            energy_report: telemetryService.energyReports.findLatestForTaskRun(run.id) ?? null,
            quality_evaluation: telemetryService.qualityEvaluations.findLatestForTaskRun(run.id) ?? null
          }));

          jsonResponse(res, 200, {
            window,
            pagination: { total, limit, offset, nextOffset },
            task_runs: taskRuns
          });
        } catch (error) {
          logger.warn(error, 'Failed to load telemetry task runs');
          jsonResponse(res, 400, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (req.method === 'GET' && (pathname === '/healthz' || pathname === '/health')) {
        const payload = {
          status: 'ok',
          offlineMode,
          submitted: metrics.submitted,
          completed: metrics.completed,
          failed: metrics.failed,
          lastJobProvider: metrics.lastJobProvider,
          healthGate: resolveHealthGateState(),
          uptimeSeconds: Math.round(process.uptime())
        };

        jsonResponse(res, 200, payload);
        return;
      }

      if (req.method === 'GET' && req.url === '/status') {
        const lifetimeAlphaWU = toFiniteNumber(getLifetimeAlphaWU(), 0);
        const [lastEpochSummary] = getRecentEpochSummaries({ limit: 1 });
        const lastEpoch = lastEpochSummary
          ? {
              id: lastEpochSummary.epochId ?? null,
              alphaWU: toFiniteNumber(lastEpochSummary.totalAlphaWU, 0)
            }
          : null;
        jsonResponse(res, 200, {
          status: 'ok',
          offlineMode,
          alphaWU: {
            lastEpoch,
            lifetimeAlphaWU
          }
        });
        return;
      }

      if (req.method === 'GET' && req.url === '/status/diagnostics') {
        const lifetimeAlphaWU = toFiniteNumber(getLifetimeAlphaWU(), 0);
        const summaries = getRecentEpochSummaries({ limit: 24 });
        const totalsByJob = {};
        const totalsByDeviceClass = {};
        const totalsBySlaProfile = {};

        const epochs = summaries.map((summary) => {
          const epoch = {
            id: summary?.epochId ?? null,
            alphaWU: toFiniteNumber(summary?.totalAlphaWU, 0),
            startedAt: summary?.startedAt ?? null,
            endedAt: summary?.endedAt ?? null,
            byJob: normaliseBreakdownEntries(summary?.alphaWU_by_job ?? {}),
            byDeviceClass: normaliseBreakdownEntries(summary?.alphaWU_by_deviceClass ?? {}),
            bySlaProfile: normaliseBreakdownEntries(summary?.alphaWU_by_slaProfile ?? {})
          };
          mergeAlphaBreakdown(totalsByJob, epoch.byJob);
          mergeAlphaBreakdown(totalsByDeviceClass, epoch.byDeviceClass);
          mergeAlphaBreakdown(totalsBySlaProfile, epoch.bySlaProfile);
          return epoch;
        });

        jsonResponse(res, 200, {
          status: 'ok',
          offlineMode,
          alphaWU: {
            lifetimeAlphaWU,
            epochs,
            totals: {
              byJob: normaliseBreakdownEntries(totalsByJob),
              byDeviceClass: normaliseBreakdownEntries(totalsByDeviceClass),
              bySlaProfile: normaliseBreakdownEntries(totalsBySlaProfile)
            }
          }
        });
        return;
      }

      if (req.method === 'GET' && req.url === '/jobs') {
        jsonResponse(res, 200, {
          jobs: Array.from(jobs.values()),
          lifecycle: Array.from(lifecycleJobs.values())
        });
        return;
      }

      if (req.method === 'GET' && req.url.startsWith('/jobs/')) {
        const id = req.url.split('/')[2];
        if (!id) {
          jsonResponse(res, 404, { error: 'Job not found' });
          return;
        }
        if (jobs.has(id)) {
          jsonResponse(res, 200, jobs.get(id));
          return;
        }
        if (lifecycleJobs.has(id)) {
          jsonResponse(res, 200, lifecycleJobs.get(id));
          return;
        }
        jsonResponse(res, 404, { error: 'Job not found' });
        return;
      }

      if (req.method === 'GET' && req.url === '/jobs/open') {
        jsonResponse(res, 200, { jobs: Array.from(lifecycleJobs.values()) });
        return;
      }

      if (req.method === 'GET' && req.url.startsWith('/oracle/epochs')) {
        let requestUrl;
        try {
          requestUrl = new URL(req.url, 'http://localhost');
        } catch (error) {
          jsonResponse(res, 400, { error: error instanceof Error ? error.message : String(error) });
          return;
        }

        try {
          ensureOwnerAuthorization(req, ownerToken);
        } catch (authError) {
          logger.warn(authError, 'Unauthorized oracle export attempt');
          jsonResponse(res, authError.statusCode ?? 401, { error: authError.message });
          return;
        }

        const from = requestUrl.searchParams.get('from');
        const to = requestUrl.searchParams.get('to');
        const epochId = requestUrl.searchParams.get('epochId') ?? requestUrl.searchParams.get('id');

        try {
          const payload = buildEpochPayload({ epochId, fromTs: from, toTs: to });
          jsonResponse(res, 200, payload);
        } catch (error) {
          logger.warn(error, 'Failed to build oracle epoch export');
          jsonResponse(res, 400, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (req.method === 'POST' && req.url === '/jobs') {
        const body = await parseRequestBody(req);
        const jobId = randomUUID();
        const jobRecord = {
          id: jobId,
          status: 'processing',
          submittedAt: new Date().toISOString(),
          payload: body
        };
        jobs.set(jobId, jobRecord);
        metrics.submitted += 1;

        try {
          const evaluation = await evaluateJobRequest(body ?? {}, { offlineMode, logger });
          metrics.completed += 1;
          const projectedReward = evaluation.metrics.projectedReward ?? 0n;
          metrics.tokensEarned += projectedReward;
          metrics.lastProjectedReward = projectedReward;
          metrics.lastJobProvider = evaluation.metrics.provider ?? 'local';
          const result = {
            ...jobRecord,
            status: 'completed',
            completedAt: new Date().toISOString(),
            result: {
              providerStatus: evaluation.providerStatus,
              plan: evaluation.plan,
              swarm: evaluation.swarm,
              curriculum: evaluation.curriculum,
              antifragility: evaluation.antifragility,
              comparison: evaluation.comparison,
              metrics: evaluation.metrics
            }
          };
          jobs.set(jobId, result);
          jsonResponse(res, 202, result);
        } catch (error) {
          metrics.failed += 1;
          const failure = {
            ...jobRecord,
            status: 'failed',
            completedAt: new Date().toISOString(),
            error: error.message
          };
          jobs.set(jobId, failure);
          logger.error(error, 'Job evaluation failed');
          jsonResponse(res, 500, { error: error.message, job: failure });
        }
        return;
      }

      if (req.method === 'GET' && req.url === '/governance/catalog') {
        jsonResponse(res, 200, { catalog: getOwnerFunctionCatalog() });
        return;
      }

      if (req.method === 'GET' && req.url === '/governance/directives') {
        try {
          ensureOwnerAuthorization(req, ownerToken);
        } catch (authError) {
          logger.warn(authError, 'Unauthorized directives fetch attempt');
          jsonResponse(res, authError.statusCode ?? 401, { error: authError.message });
          return;
        }

        jsonResponse(res, 200, { directives: exportOwnerDirectives() });
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/directives') {
        try {
          ensureOwnerAuthorization(req, ownerToken);
        } catch (authError) {
          logger.warn(authError, 'Unauthorized directives update attempt');
          jsonResponse(res, authError.statusCode ?? 401, { error: authError.message });
          return;
        }

        try {
          const body = await parseRequestBody(req);
          if (!body || typeof body !== 'object' || Array.isArray(body)) {
            jsonResponse(res, 400, { error: 'Directive payload must be an object' });
            return;
          }
          if (body.priority !== undefined && typeof body.priority !== 'string') {
            jsonResponse(res, 400, { error: 'priority must be a string' });
            return;
          }
          const sanitizedActions = sanitizeActions(body.actions);
          const sanitizedNotices = sanitizeNotices(body.notices);
          const sanitizedContext = sanitizeContext(body.context);
          ownerDirectives = {
            priority:
              typeof body.priority === 'string' && body.priority.trim().length > 0
                ? body.priority
                : ownerDirectives.priority,
            actions: sanitizedActions ?? ownerDirectives.actions,
            notices: sanitizedNotices ?? ownerDirectives.notices,
            context: sanitizedContext ?? ownerDirectives.context
          };
          metrics.governance.directivesUpdates += 1;
          jsonResponse(res, 200, { directives: exportOwnerDirectives() });
        } catch (error) {
          logger.error(error, 'Failed to update owner directives via API');
          jsonResponse(res, 400, { error: error.message });
        }
        return;
      }

      if (req.method === 'GET' && req.url === '/governance/bans') {
        try {
          ensureOwnerAuthorization(req, ownerToken);
        } catch (authError) {
          logger.warn(authError, 'Unauthorized ban list fetch attempt');
          jsonResponse(res, authError.statusCode ?? 401, { error: authError.message });
          return;
        }

        if (!resourceManager) {
          jsonResponse(res, 503, { error: 'Resource manager unavailable' });
          return;
        }

        jsonResponse(res, 200, { bans: exportBanState() });
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/bans') {
        try {
          ensureOwnerAuthorization(req, ownerToken);
        } catch (authError) {
          logger.warn(authError, 'Unauthorized ban mutation attempt');
          jsonResponse(res, authError.statusCode ?? 401, { error: authError.message });
          return;
        }

        if (!resourceManager) {
          jsonResponse(res, 503, { error: 'Resource manager unavailable' });
          return;
        }

        try {
          const body = await parseRequestBody(req);
          const ips = normalizeListInput(body?.ip ?? body?.ips);
          const peers = normalizeListInput(body?.peerId ?? body?.peer ?? body?.peers);
          const asns = normalizeListInput(body?.asn ?? body?.asns);

          ips.forEach((ip) => resourceManager.banIp(ip));
          peers.forEach((peer) => resourceManager.banPeer(peer));
          asns.forEach((asn) => resourceManager.banAsn(asn));

          const banSnapshot = resourceManager.metrics();
          logger.info(
            {
              ips,
              peers,
              asns,
              banCounts: banSnapshot?.limitsGrid?.ipLimiter ?? banSnapshot?.limits?.ipLimiter ?? null
            },
            'Ban grid updated via governance API'
          );

          jsonResponse(res, 200, { bans: exportBanState() });
        } catch (error) {
          logger.warn(error, 'Failed to apply ban request');
          jsonResponse(res, 400, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (req.method === 'DELETE' && req.url === '/governance/bans') {
        try {
          ensureOwnerAuthorization(req, ownerToken);
        } catch (authError) {
          logger.warn(authError, 'Unauthorized ban removal attempt');
          jsonResponse(res, authError.statusCode ?? 401, { error: authError.message });
          return;
        }

        if (!resourceManager) {
          jsonResponse(res, 503, { error: 'Resource manager unavailable' });
          return;
        }

        try {
          const body = await parseRequestBody(req);
          const ips = normalizeListInput(body?.ip ?? body?.ips);
          const peers = normalizeListInput(body?.peerId ?? body?.peer ?? body?.peers);
          const asns = normalizeListInput(body?.asn ?? body?.asns);

          ips.forEach((ip) => resourceManager.unbanIp(ip));
          peers.forEach((peer) => resourceManager.unbanPeer(peer));
          asns.forEach((asn) => resourceManager.unbanAsn(asn));

          const banSnapshot = resourceManager.metrics();
          logger.info(
            {
              ips,
              peers,
              asns,
              banCounts: banSnapshot?.limitsGrid?.ipLimiter ?? banSnapshot?.limits?.ipLimiter ?? null
            },
            'Ban grid updated via governance API'
          );

          jsonResponse(res, 200, { bans: exportBanState() });
        } catch (error) {
          logger.warn(error, 'Failed to remove ban request');
          jsonResponse(res, 400, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/pause') {
        await handleGovernanceRequest(req, res, systemPauseSchema, (input) =>
          buildSystemPauseTx({
            systemPauseAddress: input.systemPauseAddress,
            action: input.action
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/minimum-stake') {
        await handleGovernanceRequest(req, res, minimumStakeSchema, (input) =>
          buildMinimumStakeTx({
            stakeManagerAddress: input.stakeManagerAddress,
            amount: input.amount,
            currentMinimum: input.currentAmount ? parseUnits(input.currentAmount, 18) : null
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/validator-threshold') {
        await handleGovernanceRequest(req, res, validatorThresholdSchema, (input) =>
          buildValidatorThresholdTx({
            stakeManagerAddress: input.stakeManagerAddress,
            threshold: input.threshold,
            currentThreshold: input.currentThreshold ?? null
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/registry-upgrade') {
        await handleGovernanceRequest(req, res, registryUpgradeSchema, (input) =>
          buildStakeRegistryUpgradeTx({
            stakeManagerAddress: input.stakeManagerAddress,
            registryType: input.registryType,
            newAddress: input.newAddress,
            currentAddress: input.currentAddress ?? null
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/role-share') {
        await handleGovernanceRequest(req, res, roleShareSchema, (input) =>
          buildRoleShareTx({
            rewardEngineAddress: input.rewardEngineAddress,
            role: input.role,
            shareBps: input.shareBps,
            currentShareBps: input.currentShareBps ?? null
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/global-shares') {
        await handleGovernanceRequest(req, res, globalSharesSchema, (input) =>
          buildGlobalSharesTx({
            rewardEngineAddress: input.rewardEngineAddress,
            operatorShareBps: input.operatorShareBps,
            validatorShareBps: input.validatorShareBps,
            treasuryShareBps: input.treasuryShareBps,
            currentShares: input.currentShares
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/job-module') {
        await handleGovernanceRequest(req, res, jobModuleSchema, (input) =>
          buildJobRegistryUpgradeTx({
            jobRegistryAddress: input.jobRegistryAddress,
            module: input.module,
            newAddress: input.newAddress,
            currentAddress: input.currentAddress ?? null
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/dispute') {
        await handleGovernanceRequest(req, res, disputeSchema, (input) =>
          buildDisputeTriggerTx({
            jobRegistryAddress: input.jobRegistryAddress,
            jobId: input.jobId,
            reason: input.reason
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/identity-delegate') {
        await handleGovernanceRequest(req, res, identityDelegateSchema, (input) =>
          buildIdentityDelegateTx({
            identityRegistryAddress: input.identityRegistryAddress,
            operatorAddress: input.operatorAddress,
            allowed: input.allowed,
            current:
              input.currentAllowed === undefined
                ? null
                : { operator: input.operatorAddress, allowed: input.currentAllowed }
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/emission-per-epoch') {
        await handleGovernanceRequest(req, res, emissionPerEpochSchema, (input) =>
          buildEmissionPerEpochTx({
            emissionManagerAddress: input.emissionManagerAddress,
            emissionPerEpoch: input.emissionPerEpoch,
            decimals: input.decimals,
            currentEmissionPerEpoch: input.currentEmissionPerEpoch
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/emission-epoch-length') {
        await handleGovernanceRequest(req, res, emissionEpochLengthSchema, (input) =>
          buildEmissionEpochLengthTx({
            emissionManagerAddress: input.emissionManagerAddress,
            epochLengthSeconds: input.epochLengthSeconds,
            currentEpochLengthSeconds: input.currentEpochLengthSeconds ?? input.current ?? null
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/emission-cap') {
        await handleGovernanceRequest(req, res, emissionCapSchema, (input) =>
          buildEmissionCapTx({
            emissionManagerAddress: input.emissionManagerAddress,
            emissionCap: input.emissionCap,
            decimals: input.decimals,
            currentEmissionCap: input.currentEmissionCap
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/emission-multiplier') {
        await handleGovernanceRequest(req, res, emissionMultiplierSchema, (input) =>
          buildEmissionRateMultiplierTx({
            emissionManagerAddress: input.emissionManagerAddress,
            numerator: input.numerator,
            denominator: input.denominator,
            currentMultiplier: input.currentMultiplier
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/node/register') {
        await handleGovernanceRequest(req, res, nodeRegistrationSchema, (input) =>
          buildNodeRegistrationTx({
            nodeRegistryAddress: input.nodeRegistryAddress,
            nodeId: input.nodeId,
            operatorAddress: input.operatorAddress,
            metadataURI: input.metadataURI
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/node/metadata') {
        await handleGovernanceRequest(req, res, nodeMetadataSchema, (input) =>
          buildNodeMetadataTx({
            nodeRegistryAddress: input.nodeRegistryAddress,
            nodeId: input.nodeId,
            metadataURI: input.metadataURI,
            currentMetadataURI: input.currentMetadataURI
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/node/status') {
        await handleGovernanceRequest(req, res, nodeStatusSchema, (input) =>
          buildNodeStatusTx({
            nodeRegistryAddress: input.nodeRegistryAddress,
            nodeId: input.nodeId,
            active: input.active,
            currentStatus: input.currentStatus
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/node/operator') {
        await handleGovernanceRequest(req, res, nodeOperatorSchema, (input) =>
          buildNodeOperatorTx({
            nodeRegistryAddress: input.nodeRegistryAddress,
            operatorAddress: input.operatorAddress,
            allowed: input.allowed,
            currentAllowed: input.currentAllowed
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/node/work-meter') {
        await handleGovernanceRequest(req, res, nodeWorkMeterSchema, (input) =>
          buildNodeWorkMeterTx({
            nodeRegistryAddress: input.nodeRegistryAddress,
            workMeterAddress: input.workMeterAddress,
            currentWorkMeter: input.currentWorkMeter
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/work-meter/validator') {
        await handleGovernanceRequest(req, res, workMeterValidatorSchema, (input) =>
          buildWorkMeterValidatorTx({
            workMeterAddress: input.workMeterAddress,
            validatorAddress: input.validatorAddress,
            allowed: input.allowed,
            currentAllowed: input.currentAllowed
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/work-meter/oracle') {
        await handleGovernanceRequest(req, res, workMeterOracleSchema, (input) =>
          buildWorkMeterOracleTx({
            workMeterAddress: input.workMeterAddress,
            oracleAddress: input.oracleAddress,
            allowed: input.allowed,
            currentAllowed: input.currentAllowed
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/work-meter/window') {
        await handleGovernanceRequest(req, res, workMeterWindowSchema, (input) =>
          buildWorkMeterWindowTx({
            workMeterAddress: input.workMeterAddress,
            submissionWindowSeconds: input.submissionWindowSeconds,
            currentWindowSeconds: input.currentWindowSeconds ?? input.current ?? null
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/work-meter/productivity-index') {
        await handleGovernanceRequest(req, res, workMeterProductivitySchema, (input) =>
          buildWorkMeterProductivityIndexTx({
            workMeterAddress: input.workMeterAddress,
            productivityIndexAddress: input.productivityIndexAddress,
            currentProductivityIndex: input.currentProductivityIndex
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/work-meter/submit-usage') {
        await handleGovernanceRequest(req, res, workMeterUsageSchema, (input) =>
          buildWorkMeterUsageTx({
            workMeterAddress: input.workMeterAddress,
            reportId: input.reportId,
            nodeId: input.nodeId,
            gpuSeconds: input.gpuSeconds,
            gflopsNorm: input.gflopsNorm,
            modelTier: input.modelTier,
            sloPass: input.sloPass,
            quality: input.quality,
            usageHash: input.usageHash,
            metricDecimals: input.metricDecimals
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/productivity/record-epoch') {
        await handleGovernanceRequest(req, res, productivityRecordSchema, (input) =>
          buildProductivityRecordTx({
            productivityIndexAddress: input.productivityIndexAddress,
            epoch: input.epoch,
            alphaWu: input.alphaWu,
            tokensEmitted: input.tokensEmitted,
            tokensBurned: input.tokensBurned,
            decimals: input.decimals
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/productivity/emission-manager') {
        await handleGovernanceRequest(req, res, productivityEmissionSchema, (input) =>
          buildProductivityEmissionManagerTx({
            productivityIndexAddress: input.productivityIndexAddress,
            emissionManagerAddress: input.emissionManagerAddress,
            currentEmissionManager: input.currentEmissionManager
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/productivity/work-meter') {
        await handleGovernanceRequest(req, res, productivityWorkMeterSchema, (input) =>
          buildProductivityWorkMeterTx({
            productivityIndexAddress: input.productivityIndexAddress,
            workMeterAddress: input.workMeterAddress,
            currentWorkMeter: input.currentWorkMeter
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/productivity/treasury') {
        await handleGovernanceRequest(req, res, productivityTreasurySchema, (input) =>
          buildProductivityTreasuryTx({
            productivityIndexAddress: input.productivityIndexAddress,
            treasuryAddress: input.treasuryAddress,
            currentTreasury: input.currentTreasury
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/incentives/stake-manager') {
        await handleGovernanceRequest(req, res, incentivesStakeManagerSchema, (input) =>
          buildIncentivesStakeManagerTx({
            incentivesAddress: input.incentivesAddress,
            stakeManagerAddress: input.stakeManagerAddress,
            currentStakeManager: input.currentStakeManager
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/incentives/minimum-stake') {
        await handleGovernanceRequest(req, res, incentivesMinimumStakeSchema, (input) =>
          buildIncentivesMinimumStakeTx({
            incentivesAddress: input.incentivesAddress,
            amount: input.amount,
            decimals: input.decimals,
            currentMinimum: input.currentMinimum
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/incentives/heartbeat-grace') {
        await handleGovernanceRequest(req, res, incentivesHeartbeatSchema, (input) =>
          buildIncentivesHeartbeatTx({
            incentivesAddress: input.incentivesAddress,
            graceSeconds: input.graceSeconds,
            currentGraceSeconds: input.currentGraceSeconds
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/incentives/activation-fee') {
        await handleGovernanceRequest(req, res, incentivesActivationFeeSchema, (input) =>
          buildIncentivesActivationFeeTx({
            incentivesAddress: input.incentivesAddress,
            feeAmount: input.feeAmount,
            decimals: input.decimals,
            currentFee: input.currentFee
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/incentives/treasury') {
        await handleGovernanceRequest(req, res, incentivesTreasurySchema, (input) =>
          buildIncentivesTreasuryTx({
            incentivesAddress: input.incentivesAddress,
            treasuryAddress: input.treasuryAddress,
            currentTreasury: input.currentTreasury
          })
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/governance/stake-top-up') {
        try {
          const body = await parseRequestBody(req);
          if (!body?.incentivesAddress) {
            jsonResponse(res, 400, { error: 'incentivesAddress is required' });
            return;
          }
          if (body.amount === undefined || body.amount === null) {
            jsonResponse(res, 400, { error: 'amount is required' });
            return;
          }
          const decimals = body.decimals === undefined ? undefined : Number.parseInt(body.decimals, 10);
          if (decimals !== undefined && (!Number.isFinite(decimals) || decimals < 0)) {
            jsonResponse(res, 400, { error: 'decimals must be a non-negative integer' });
            return;
          }
          const stakeArgs = {
            amount: String(body.amount),
            incentivesAddress: getAddress(body.incentivesAddress)
          };
          if (decimals !== undefined) {
            stakeArgs.decimals = decimals;
          }
          const tx = buildStakeAndActivateTx(stakeArgs);
          metrics.governance.payloads += 1;
          jsonResponse(res, 200, { tx });
        } catch (error) {
          logger.error(error, 'Failed to build stake top-up payload');
          jsonResponse(res, 400, { error: error.message });
        }
        return;
      }

      if (req.method === 'POST' && /^\/jobs\/[^/]+\/apply$/.test(req.url)) {
        if (!jobLifecycle) {
          jsonResponse(res, 503, { error: 'Job lifecycle integration not configured' });
          return;
        }
        const [, , jobId] = req.url.split('/');
        const body = await parseRequestBody(req);
        try {
          const result = await jobLifecycle.apply(jobId, {
            subdomain: body?.subdomain,
            proof: body?.proof
          });
          jsonResponse(res, 202, {
            jobId: result.jobId,
            transactionHash: result.transactionHash,
            method: result.method
          });
        } catch (error) {
          logger.error(error, 'Failed to apply for job');
          jsonResponse(res, 500, { error: error.message });
        }
        return;
      }

      if (req.method === 'POST' && /^\/jobs\/[^/]+\/submit$/.test(req.url)) {
        if (!jobLifecycle) {
          jsonResponse(res, 503, { error: 'Job lifecycle integration not configured' });
          return;
        }
        const [, , jobId] = req.url.split('/');
        const body = await parseRequestBody(req);
        if (body?.result === undefined && body?.resultUri === undefined) {
          jsonResponse(res, 400, { error: 'result or resultUri required for submission' });
          return;
        }
        try {
          const result = await jobLifecycle.submitExecutorResult(jobId, {
            result: body?.result ?? body?.resultUri ?? '',
            resultUri: body?.resultUri,
            metadata: body?.metadata,
            subdomain: body?.subdomain,
            proof: body?.proof,
            timestamp: body?.timestamp,
            alphaWu: body?.alphaWu
          });
          jsonResponse(res, 202, {
            jobId: result.jobId,
            transactionHash: result.transactionHash,
            method: result.method,
            commitment: result.commitment,
            resultHash: result.resultHash,
            alphaWu: result.alphaWu ?? null
          });
        } catch (error) {
          logger.error(error, 'Failed to submit job result');
          jsonResponse(res, 500, { error: error.message });
        }
        return;
      }

      if (req.method === 'POST' && /^\/jobs\/[^/]+\/finalize$/.test(req.url)) {
        if (!jobLifecycle) {
          jsonResponse(res, 503, { error: 'Job lifecycle integration not configured' });
          return;
        }
        const [, , jobId] = req.url.split('/');
        try {
          const result = await jobLifecycle.finalize(jobId);
          jsonResponse(res, 202, {
            jobId: result.jobId,
            transactionHash: result.transactionHash,
            method: result.method
          });
        } catch (error) {
          logger.error(error, 'Failed to finalize job');
          jsonResponse(res, 500, { error: error.message });
        }
        return;
      }

      jsonResponse(res, 404, { error: 'Not found' });
    };

    try {
      await instrumentation.runWithContext(handleRequest);
    } catch (error) {
      instrumentation.recordError(error);
      logger.error(error, 'API request handling failed');
      if (!res.headersSent) {
        jsonResponse(res, 500, { error: 'Internal server error' });
      }
    } finally {
      instrumentation.end(res.statusCode ?? 500);
    }
  });

  server.listen(port, () => {
    logger.info({ port, offlineMode }, 'Agent API server listening');
  });

  return {
    server,
    port,
    offlineMode,
    telemetry: telemetryService,
    stop: async () => {
      await new Promise((resolve) => {
        server.close(() => {
          lifecycleSubscription?.();
          lifecycleActionSubscription?.();
          resolve();
        });
      });
      await stopTracer?.();
    },
    getMetrics: () => ({
      ...metrics,
      tokensEarned: metrics.tokensEarned,
      throughput: metrics.completed,
      successRate: metrics.submitted === 0 ? 1 : metrics.completed / metrics.submitted,
      healthGate: resolveHealthGateState()
    }),
    listJobs: () => Array.from(jobs.values()),
    setOwnerDirectives: (directives) => {
      if (!directives || typeof directives !== 'object') {
        return;
      }
      try {
        const sanitizedActions = sanitizeActions(directives.actions);
        const sanitizedNotices = sanitizeNotices(directives.notices);
        const sanitizedContext = sanitizeContext(directives.context);
        ownerDirectives = {
          priority:
            typeof directives.priority === 'string' && directives.priority.trim().length > 0
              ? directives.priority
              : ownerDirectives.priority,
          actions: sanitizedActions ?? ownerDirectives.actions,
          notices: sanitizedNotices ?? ownerDirectives.notices,
          context: sanitizedContext ?? ownerDirectives.context
        };
        metrics.governance.directivesUpdates += 1;
      } catch (error) {
        logger.error(error, 'Failed to set owner directives');
      }
    },
    getOwnerDirectives: () => exportOwnerDirectives()
  };
}
