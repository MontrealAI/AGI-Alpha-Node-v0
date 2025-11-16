import { beforeEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../src/persistence/database.js';
import {
  EnergyReportRepository,
  ProviderRepository,
  QualityEvaluationRepository
} from '../src/persistence/repositories.js';
import { seedProviders, seedTaskTypes } from '../src/persistence/seeds.js';
import {
  TelemetryConflictError,
  TelemetryIngestionService,
  TelemetryValidationError
} from '../src/services/telemetryIngestion.js';

const noopLogger = { info: () => {}, warn: () => {}, error: () => {} };

function createService() {
  const db = initializeDatabase({ filename: ':memory:' });
  seedTaskTypes(db);
  seedProviders(db);
  const service = new TelemetryIngestionService({ db, logger: noopLogger });
  const providers = new ProviderRepository(db);
  const provider = providers.list()[0];
  const apiKey = 'telemetry-secret-key';
  service.registerApiKey({ providerId: provider.id, apiKey, label: 'test' });
  return { service, db, provider, apiKey };
}

describe('Telemetry ingestion service', () => {
  let harness;

  beforeEach(() => {
    harness = createService();
  });

  it('ingests task run telemetry and enforces idempotency', () => {
    const payload = {
      schema_version: 'v0',
      idempotency_key: 'run-abc-1234',
      task_type: 'code-refactor',
      status: 'completed',
      external_id: 'ext-1',
      timing: { started_at: '2024-01-01T00:00:00Z', completed_at: '2024-01-01T00:10:00Z' },
      metrics: { tokens_processed: 1200, tool_calls: 2, quality_score: 0.92 },
      metadata: { region: 'na-east' },
      notes: 'first-run'
    };

    const result = harness.service.ingestTaskRun({ payload, apiKey: harness.apiKey });
    expect(result.taskRun.idempotency_key).toBe(payload.idempotency_key);
    expect(result.taskRun.schema_version).toBe('v0');
    expect(result.taskRun.metadata.telemetry).toMatchObject({ region: 'na-east' });
    expect(result.rateLimit.limit).toBeGreaterThan(0);

    expect(() => harness.service.ingestTaskRun({ payload, apiKey: harness.apiKey })).toThrow(TelemetryConflictError);
  });

  it('links energy and quality payloads to the recorded task run', () => {
    const taskPayload = {
      schema_version: 'v0',
      idempotency_key: 'run-energy-1',
      task_type: 'research-dossier',
      status: 'running'
    };
    const { taskRun } = harness.service.ingestTaskRun({ payload: taskPayload, apiKey: harness.apiKey });

    const energyPayload = {
      schema_version: 'v0',
      task: { idempotency_key: taskPayload.idempotency_key },
      energy: { kwh: 3.5, region: 'na-east', carbon_intensity_gco2_kwh: 110 }
    };
    const qualityPayload = {
      schema_version: 'v0',
      task: { idempotency_key: taskPayload.idempotency_key },
      quality: { score: 0.88, evaluator: 'cortex' },
      metadata: { sample: true }
    };

    const energyResult = harness.service.ingestEnergy({ payload: energyPayload, apiKey: harness.apiKey });
    const qualityResult = harness.service.ingestQuality({ payload: qualityPayload, apiKey: harness.apiKey });

    expect(energyResult.energyReport.task_run_id).toBe(taskRun.id);
    expect(energyResult.energyReport.schema_version).toBe('v0');
    expect(qualityResult.qualityEvaluation.score).toBeCloseTo(0.88);
    expect(qualityResult.qualityEvaluation.metadata.telemetry.sample).toBe(true);

    const energyRepo = new EnergyReportRepository(harness.db);
    const qualityRepo = new QualityEvaluationRepository(harness.db);
    expect(energyRepo.listForTaskRun(taskRun.id)).toHaveLength(1);
    expect(qualityRepo.listForTaskRun(taskRun.id)).toHaveLength(1);
  });

  it('raises validation errors for malformed telemetry', () => {
    expect(() =>
      harness.service.ingestTaskRun({ payload: { schema_version: 'v0', status: 'complete' }, apiKey: harness.apiKey })
    ).toThrow(TelemetryValidationError);
  });
});
