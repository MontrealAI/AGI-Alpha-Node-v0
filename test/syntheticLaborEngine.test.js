import { beforeEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../src/persistence/database.js';
import { seedProviders, seedTaskTypes, DEFAULT_PROVIDERS, DEFAULT_TASK_TYPES } from '../src/persistence/seeds.js';
import { EnergyReportRepository, QualityEvaluationRepository, TaskRunRepository, TaskTypeRepository } from '../src/persistence/repositories.js';
import { createSyntheticLaborEngine } from '../src/services/syntheticLaborEngine.js';

function setupHarness() {
  const db = initializeDatabase({ filename: ':memory:' });
  seedTaskTypes(db);
  seedProviders(db);

  const taskRuns = new TaskRunRepository(db);
  const energy = new EnergyReportRepository(db);
  const quality = new QualityEvaluationRepository(db);
  const taskTypes = new TaskTypeRepository(db);
  const engine = createSyntheticLaborEngine({ db });

  return { db, taskRuns, energy, quality, taskTypes, engine };
}

describe('SyntheticLaborEngine', () => {
  let harness;
  const measurementDate = '2024-05-01';

  beforeEach(() => {
    harness = setupHarness();
  });

  it('rewards higher efficiency with higher SLU', () => {
    const providerA = harness.engine.providers.findByName(DEFAULT_PROVIDERS[0].name);
    const providerB = harness.engine.providers.findByName(DEFAULT_PROVIDERS[1].name);
    const taskType = harness.taskTypes.findByName(DEFAULT_TASK_TYPES[0].name);

    const runA = harness.taskRuns.create({
      provider_id: providerA.id,
      task_type_id: taskType.id,
      status: 'completed',
      raw_throughput: 8,
      tokens_processed: 9000,
      tool_calls: 2,
      quality_score: 0.92,
      started_at: `${measurementDate}T03:00:00Z`,
      completed_at: `${measurementDate}T03:10:00Z`
    });

    const runB = harness.taskRuns.create({
      provider_id: providerB.id,
      task_type_id: taskType.id,
      status: 'completed',
      raw_throughput: 8,
      tokens_processed: 9000,
      tool_calls: 2,
      quality_score: 0.92,
      started_at: `${measurementDate}T04:00:00Z`,
      completed_at: `${measurementDate}T04:08:00Z`
    });

    harness.energy.create({
      task_run_id: runA.id,
      kwh: 3,
      cost_usd: 0.36,
      region: 'na-east',
      energy_mix: null,
      carbon_intensity_gco2_kwh: null
    });
    harness.energy.create({
      task_run_id: runB.id,
      kwh: 3,
      cost_usd: 2.4,
      region: 'eu-west',
      energy_mix: null,
      carbon_intensity_gco2_kwh: null
    });

    const scores = harness.engine.computeDailyScores(measurementDate);
    const scoreA = scores.find((entry) => entry.provider_id === providerA.id);
    const scoreB = scores.find((entry) => entry.provider_id === providerB.id);

    expect(scoreA.energy_adjustment).toBeGreaterThan(scoreB.energy_adjustment);
    expect(scoreA.slu).toBeGreaterThan(scoreB.slu);
    expect(scoreA.measurement_date).toBe(measurementDate);
    expect(scoreB.measurement_date).toBe(measurementDate);
  });

  it('penalizes lower quality signals', () => {
    const provider = harness.engine.providers.findByName(DEFAULT_PROVIDERS[0].name);
    const taskType = harness.taskTypes.findByName(DEFAULT_TASK_TYPES[1].name);
    const qualityDate = '2024-05-02';

    const strongRun = harness.taskRuns.create({
      provider_id: provider.id,
      task_type_id: taskType.id,
      status: 'completed',
      raw_throughput: 6,
      tokens_processed: 12000,
      quality_score: 0.95,
      started_at: `${qualityDate}T01:00:00Z`,
      completed_at: `${qualityDate}T01:06:00Z`
    });

    const weakRun = harness.taskRuns.create({
      provider_id: provider.id,
      task_type_id: taskType.id,
      status: 'completed',
      raw_throughput: 6,
      tokens_processed: 12000,
      quality_score: 0.4,
      started_at: `${qualityDate}T02:00:00Z`,
      completed_at: `${qualityDate}T02:07:00Z`
    });

    harness.quality.create({ task_run_id: strongRun.id, evaluator: 'gold', score: 0.96, notes: null });
    harness.quality.create({ task_run_id: weakRun.id, evaluator: 'gold', score: 0.35, notes: null });

    const score = harness.engine.computeDailyScoreForProvider(provider.id, qualityDate);

    expect(score.quality_adjustment).toBeLessThan(1);
    expect(score.slu).toBeLessThan(score.raw_throughput);
  });

  it('defaults adjustments to neutral when telemetry is sparse', () => {
    const provider = harness.engine.providers.findByName(DEFAULT_PROVIDERS[0].name);
    const taskType = harness.taskTypes.findByName(DEFAULT_TASK_TYPES[2].name);
    const sparseDate = '2024-05-03';

    harness.taskRuns.create({
      provider_id: provider.id,
      task_type_id: taskType.id,
      status: 'completed',
      raw_throughput: 4,
      tokens_processed: 2000,
      started_at: `${sparseDate}T05:00:00Z`,
      completed_at: `${sparseDate}T05:05:00Z`
    });

    const score = harness.engine.computeDailyScoreForProvider(provider.id, sparseDate);

    expect(score.energy_adjustment).toBe(1);
    expect(score.quality_adjustment).toBe(1);
    expect(score.consensus_factor).toBe(1);
    expect(score.slu).toBeCloseTo(score.raw_throughput, 4);
  });
});
