import { beforeEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../src/persistence/database.js';
import {
  EnergyReportRepository,
  IndexConstituentWeightRepository,
  IndexValueRepository,
  ProviderRepository,
  QualityEvaluationRepository,
  SyntheticLaborScoreRepository,
  TaskRunRepository,
  TaskTypeRepository
} from '../src/persistence/repositories.js';
import { DEFAULT_PROVIDERS, DEFAULT_TASK_TYPES, seedProviders, seedTaskTypes } from '../src/persistence/seeds.js';

function createHarness() {
  const db = initializeDatabase({ filename: ':memory:' });
  seedTaskTypes(db);
  seedProviders(db);

  return {
    db,
    providers: new ProviderRepository(db),
    taskTypes: new TaskTypeRepository(db),
    taskRuns: new TaskRunRepository(db),
    quality: new QualityEvaluationRepository(db),
    energy: new EnergyReportRepository(db),
    syntheticLabor: new SyntheticLaborScoreRepository(db),
    indexValues: new IndexValueRepository(db),
    indexWeights: new IndexConstituentWeightRepository(db)
  };
}

describe('persistence layer', () => {
  let harness;

  beforeEach(() => {
    harness = createHarness();
  });

  it('upserts providers with metadata, sector tags, and regions', () => {
    const created = harness.providers.create({
      name: 'zenith-dynamics',
      operator_address: '0x00000000000000000000000000000000000000aa',
      region: 'apac-sg',
      sector_tags: ['compute', 'ai'],
      energy_mix: 'solar + grid',
      metadata: { latency_ms: 21, sovereign: true }
    });

    expect(created.name).toBe('zenith-dynamics');
    expect(created.sector_tags).toEqual(['compute', 'ai']);
    expect(created.metadata).toMatchObject({ latency_ms: 21, sovereign: true });

    const updated = harness.providers.update(created.id, {
      region: 'apac-sin',
      sector_tags: ['compute', 'ai', 'defense']
    });

    expect(updated.region).toBe('apac-sin');
    expect(updated.sector_tags).toContain('defense');
  });

  it('seeds canonical task types and allows updates', () => {
    const seeded = harness.taskTypes.list();
    expect(seeded.map((entry) => entry.name).sort()).toEqual(
      DEFAULT_TASK_TYPES.map((entry) => entry.name).sort()
    );

    const existing = harness.taskTypes.findByName('code-refactor');
    const patched = harness.taskTypes.update(existing.id, { difficulty_coefficient: 1.42 });
    expect(patched.difficulty_coefficient).toBeCloseTo(1.42);
  });

  it('records task runs and associated quality + energy signals', () => {
    const provider = harness.providers.findByName(DEFAULT_PROVIDERS[0].name);
    const taskType = harness.taskTypes.findByName(DEFAULT_TASK_TYPES[0].name);

    const run = harness.taskRuns.create({
      provider_id: provider.id,
      task_type_id: taskType.id,
      external_id: 'alpha-run-001',
      status: 'running',
      raw_throughput: 1.2,
      tokens_processed: 12000,
      tool_calls: 3,
      novelty_score: 0.8,
      quality_score: 0.9,
      started_at: '2024-01-01T00:00:00Z'
    });

    expect(run.status).toBe('running');

    const evalRecord = harness.quality.create({
      task_run_id: run.id,
      evaluator: 'cognitive-audit',
      score: 0.93,
      notes: 'High fidelity replay'
    });

    expect(evalRecord.score).toBeCloseTo(0.93);

    const energy = harness.energy.create({
      task_run_id: run.id,
      kwh: 4.2,
      energy_mix: 'hydro',
      carbon_intensity_gco2_kwh: 110,
      cost_usd: 1.75,
      region: 'na-east'
    });

    expect(energy.kwh).toBeCloseTo(4.2);

    const finished = harness.taskRuns.update(run.id, {
      status: 'completed',
      completed_at: '2024-01-01T00:10:00Z'
    });

    expect(finished.status).toBe('completed');
    expect(harness.quality.listForTaskRun(run.id)).toHaveLength(1);
    expect(harness.energy.listForTaskRun(run.id)).toHaveLength(1);
  });

  it('tracks synthetic labor scores per provider and run', () => {
    const provider = harness.providers.findByName(DEFAULT_PROVIDERS[1].name);
    const taskType = harness.taskTypes.findByName(DEFAULT_TASK_TYPES[1].name);

    const run = harness.taskRuns.create({
      provider_id: provider.id,
      task_type_id: taskType.id,
      status: 'completed',
      raw_throughput: 2.1,
      external_id: 'alpha-run-002'
    });

    const score = harness.syntheticLabor.create({
      provider_id: provider.id,
      task_run_id: run.id,
      score: 1.12,
      rationale: 'Energy-optimal throughput with validator consensus'
    });

    expect(score.score).toBeCloseTo(1.12);
    expect(harness.syntheticLabor.listForProvider(provider.id)).toHaveLength(1);
  });

  it('stores index values with constituent weights', () => {
    const indexValue = harness.indexValues.create({
      effective_date: '2024-02-01',
      headline_value: 101.25,
      energy_adjustment: 0.98,
      quality_adjustment: 1.02,
      consensus_factor: 0.99
    });

    expect(indexValue.headline_value).toBeCloseTo(101.25);

    const provider = harness.providers.findByName(DEFAULT_PROVIDERS[0].name);
    const weight = harness.indexWeights.create({
      index_value_id: indexValue.id,
      provider_id: provider.id,
      weight: 0.42
    });

    expect(weight.weight).toBeCloseTo(0.42);
    expect(harness.indexWeights.listForIndexValue(indexValue.id)).toHaveLength(1);
  });
});
