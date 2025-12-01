import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import Ajv from 'ajv';
import pino from 'pino';

const require = createRequire(import.meta.url);
const taskRunTelemetrySchema = require('../../spec/task_run_telemetry.schema.json');
const energyReportSchema = require('../../spec/energy_report.schema.json');
const qualityEvalSchema = require('../../spec/quality_eval.schema.json');
import { initializeDatabase } from '../persistence/database.js';
import {
  EnergyReportRepository,
  ProviderApiKeyRepository,
  ProviderRepository,
  QualityEvaluationRepository,
  TaskRunRepository,
  TaskTypeRepository
} from '../persistence/repositories.js';

const DEFAULT_RATE_LIMIT = { limit: 1200, windowMs: 60 * 1000 };
const ALLOWED_STATUSES = new Set(['queued', 'running', 'completed', 'failed', 'errored']);

class TelemetryValidationError extends Error {
  constructor(errors) {
    super('Telemetry validation failed');
    this.name = 'TelemetryValidationError';
    this.statusCode = 400;
    this.details = errors;
  }
}

class TelemetryAuthError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'TelemetryAuthError';
    this.statusCode = 401;
  }
}

class TelemetryNotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'TelemetryNotFoundError';
    this.statusCode = 404;
  }
}

class TelemetryConflictError extends Error {
  constructor(message = 'Conflict', details = {}) {
    super(message);
    this.name = 'TelemetryConflictError';
    this.statusCode = 409;
    this.details = details;
  }
}

function formatAjvErrors(errors = []) {
  return errors.map((error) => ({
    path: error.instancePath?.length ? error.instancePath : '/',
    message: error.message ?? 'Invalid value'
  }));
}

function hashPayload(hashAlgo, payload) {
  const json = JSON.stringify(payload ?? {});
  return createHash(hashAlgo).update(json).digest('hex');
}

function parseIsoTimestamp(value, fieldName) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value);
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) {
    throw new TelemetryValidationError([{ path: `/timing/${fieldName}`, message: 'must be an ISO-8601 timestamp' }]);
  }
  return text;
}

function buildMetadata(payload, requestMeta) {
  const metadata = {
    telemetry: payload.metadata ?? {},
    notes: payload.notes ?? undefined,
    task_label: payload.task_label ?? undefined,
    request: requestMeta ?? undefined
  };
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
}

function normalizeStatus(status) {
  if (!status || typeof status !== 'string') {
    return 'queued';
  }
  const lower = status.trim().toLowerCase();
  return ALLOWED_STATUSES.has(lower) ? lower : 'queued';
}

export class TelemetryIngestionService {
  constructor({
    db = null,
    logger = pino({ level: 'info', name: 'telemetry-ingestion' }),
    hashAlgo = 'sha256',
    rateLimitConfig = DEFAULT_RATE_LIMIT
  } = {}) {
    this.db = db ?? initializeDatabase({ withSeed: true });
    this.logger = logger;
    this.hashAlgo = hashAlgo;
    this.rateLimitConfig = rateLimitConfig;

    this.providers = new ProviderRepository(this.db);
    this.providerApiKeys = new ProviderApiKeyRepository(this.db);
    this.taskTypes = new TaskTypeRepository(this.db);
    this.taskRuns = new TaskRunRepository(this.db);
    this.energyReports = new EnergyReportRepository(this.db);
    this.qualityEvaluations = new QualityEvaluationRepository(this.db);

    const ajv = new Ajv({ allErrors: true, strict: false });
    this.validators = {
      taskRun: ajv.compile(taskRunTelemetrySchema),
      energy: ajv.compile(energyReportSchema),
      quality: ajv.compile(qualityEvalSchema)
    };

    this.rateLimitState = new Map();
  }

  hashApiKey(apiKey) {
    return createHash(this.hashAlgo).update(apiKey).digest('hex');
  }

  registerApiKey({ providerId = null, providerName = null, apiKey, label = 'default' }) {
    if (!apiKey || typeof apiKey !== 'string') {
      throw new Error('apiKey is required to register a provider API key');
    }
    let provider = null;
    if (providerId) {
      provider = this.providers.getById(providerId);
    }
    if (!provider && providerName) {
      provider = this.providers.findByName(providerName);
    }
    if (!provider) {
      throw new Error('Unable to resolve provider for API key registration');
    }
    const hashed_key = this.hashApiKey(apiKey);
    const record = this.providerApiKeys.create({
      provider_id: provider.id,
      hashed_key,
      label
    });
    return { record, provider };
  }

  authenticate(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      throw new TelemetryAuthError('Missing API key');
    }
    const hash = this.hashApiKey(apiKey);
    const apiKeyRecord = this.providerApiKeys.findActiveByHash(hash);
    if (!apiKeyRecord) {
      throw new TelemetryAuthError('Invalid API key');
    }
    const provider = this.providers.getById(apiKeyRecord.provider_id);
    if (!provider) {
      throw new TelemetryAuthError('Provider not found for API key');
    }
    this.providerApiKeys.touchLastUsed(apiKeyRecord.id);
    return { provider, apiKeyRecord };
  }

  checkRateLimit(providerId) {
    const now = Date.now();
    const windowStart = Math.floor(now / this.rateLimitConfig.windowMs) * this.rateLimitConfig.windowMs;
    const key = `${providerId}:${windowStart}`;
    const current = this.rateLimitState.get(key) ?? 0;
    const updated = current + 1;
    this.rateLimitState.set(key, updated);
    const remaining = Math.max(this.rateLimitConfig.limit - updated, 0);
    if (remaining <= 0) {
      this.logger.debug({ providerId, windowStart, updated }, 'Rate limit stub hit (no enforcement)');
    }
    return { limit: this.rateLimitConfig.limit, remaining, windowEndsAt: new Date(windowStart + this.rateLimitConfig.windowMs) };
  }

  validatePayload(type, payload) {
    const validator = this.validators[type];
    if (!validator) {
      throw new Error(`Unknown telemetry type: ${type}`);
    }
    const valid = validator(payload ?? {});
    if (!valid) {
      throw new TelemetryValidationError(formatAjvErrors(validator.errors));
    }
  }

  resolveTaskType(taskTypeName, label) {
    if (!taskTypeName || typeof taskTypeName !== 'string') {
      return null;
    }
    const trimmed = taskTypeName.trim();
    if (!trimmed.length) {
      return null;
    }
    const existing = this.taskTypes.findByName(trimmed);
    if (existing) {
      return existing;
    }
    return this.taskTypes.create({
      name: trimmed,
      description: label || `telemetry:${trimmed}`,
      difficulty_coefficient: 1.0
    });
  }

  resolveTaskRun(providerId, taskRef) {
    if (!taskRef || typeof taskRef !== 'object') {
      return null;
    }
    if (taskRef.idempotency_key) {
      const byKey = this.taskRuns.findByIdempotencyKey(providerId, taskRef.idempotency_key);
      if (byKey) return byKey;
    }
    if (taskRef.external_id) {
      const byExternal = this.taskRuns.findByExternalId(providerId, taskRef.external_id);
      if (byExternal) return byExternal;
    }
    return null;
  }

  ingestTaskRun({ payload, apiKey, requestMeta } = {}) {
    this.validatePayload('taskRun', payload);
    const { provider } = this.authenticate(apiKey);
    const status = normalizeStatus(payload.status);
    const started_at = parseIsoTimestamp(payload.timing?.started_at, 'started_at');
    const completed_at = parseIsoTimestamp(payload.timing?.completed_at, 'completed_at');
    const payloadHash = hashPayload(this.hashAlgo, payload);

    const duplicate = this.taskRuns.findByIdempotencyKey(provider.id, payload.idempotency_key);
    if (duplicate) {
      if (duplicate.payload_hash && duplicate.payload_hash !== payloadHash) {
        this.logger.warn({ provider: provider.name, idempotency: payload.idempotency_key }, 'Idempotency collision');
        throw new TelemetryConflictError('Idempotency key already used for a different payload', {
          task_run_id: duplicate.id
        });
      }
      throw new TelemetryConflictError('Idempotent submission already recorded', { task_run_id: duplicate.id });
    }

    const taskType = this.resolveTaskType(payload.task_type, payload.task_label);
    const taskRun = this.taskRuns.create({
      provider_id: provider.id,
      task_type_id: taskType?.id ?? null,
      external_id: payload.external_id ?? null,
      status,
      raw_throughput: payload.metrics?.raw_throughput ?? null,
      tokens_processed: payload.metrics?.tokens_processed ?? null,
      tool_calls: payload.metrics?.tool_calls ?? null,
      novelty_score: payload.metrics?.novelty_score ?? null,
      quality_score: payload.metrics?.quality_score ?? null,
      started_at,
      completed_at,
      idempotency_key: payload.idempotency_key,
      schema_version: payload.schema_version,
      payload_hash: payloadHash,
      metadata: buildMetadata(payload, requestMeta)
    });

    const rateLimit = this.checkRateLimit(provider.id);
    return { provider, taskRun, rateLimit };
  }

  ingestEnergy({ payload, apiKey, requestMeta } = {}) {
    this.validatePayload('energy', payload);
    const { provider } = this.authenticate(apiKey);
    const taskRun = this.resolveTaskRun(provider.id, payload.task);
    if (!taskRun) {
      throw new TelemetryNotFoundError('Task run not found for energy report');
    }

    const energyReport = this.energyReports.create({
      task_run_id: taskRun.id,
      kwh: payload.energy.kwh,
      energy_mix: payload.energy.energy_mix ?? null,
      carbon_intensity_gco2_kwh: payload.energy.carbon_intensity_gco2_kwh ?? null,
      cost_usd: payload.energy.cost_usd ?? null,
      region: payload.energy.region ?? null,
      schema_version: payload.schema_version,
      metadata: buildMetadata(payload, requestMeta)
    });

    const rateLimit = this.checkRateLimit(provider.id);
    return { provider, taskRun, energyReport, rateLimit };
  }

  ingestQuality({ payload, apiKey, requestMeta } = {}) {
    this.validatePayload('quality', payload);
    const { provider } = this.authenticate(apiKey);
    const taskRun = this.resolveTaskRun(provider.id, payload.task);
    if (!taskRun) {
      throw new TelemetryNotFoundError('Task run not found for quality evaluation');
    }

    const qualityEvaluation = this.qualityEvaluations.create({
      task_run_id: taskRun.id,
      evaluator: payload.quality.evaluator ?? 'provider',
      score: payload.quality.score,
      notes: payload.quality.notes ?? null,
      schema_version: payload.schema_version,
      metadata: buildMetadata(payload, requestMeta)
    });

    const rateLimit = this.checkRateLimit(provider.id);
    return { provider, taskRun, qualityEvaluation, rateLimit };
  }
}

export {
  TelemetryAuthError,
  TelemetryConflictError,
  TelemetryNotFoundError,
  TelemetryValidationError,
  formatAjvErrors
};
