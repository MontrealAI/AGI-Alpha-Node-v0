import { beforeEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../src/persistence/database.js';
import { seedProviders } from '../src/persistence/seeds.js';
import { ProviderRepository } from '../src/persistence/repositories.js';
import { createGlobalIndexEngine } from '../src/services/globalIndexEngine.js';

function addScore(engine, providerId, measurementDate, slu) {
  return engine.syntheticLaborScores.create({
    provider_id: providerId,
    measurement_date: measurementDate,
    raw_throughput: slu,
    energy_adjustment: 1,
    quality_adjustment: 1,
    consensus_factor: 1,
    slu,
    rationale: 'test'
  });
}

describe('GlobalSyntheticLaborIndex', () => {
  let db;
  let indexEngine;
  let providers;

  beforeEach(() => {
    db = initializeDatabase({ filename: ':memory:' });
    seedProviders(db);
    indexEngine = createGlobalIndexEngine({ db });
    providers = new ProviderRepository(db).list();
  });

  it('excludes providers below the 30d SLU threshold', () => {
    const strongProvider = providers[0];
    const weakProvider = providers[1];

    for (let i = 0; i < 35; i += 1) {
      addScore(indexEngine, strongProvider.id, `2024-06-${String(1 + i).padStart(2, '0')}`, 12);
    }
    addScore(indexEngine, weakProvider.id, '2024-06-01', 0.5);

    const weightSet = indexEngine.rebalance({
      asOfDate: '2024-07-01',
      minimumSlu30d: 30,
      capPercent: 20,
      lookbackDays: 90
    });

    const weights = indexEngine.constituentWeights.listForWeightSet(weightSet.id);
    const exclusions = indexEngine.exclusions.listForWeightSet(weightSet.id);

    expect(weights.some((entry) => entry.provider_id === strongProvider.id)).toBe(true);
    expect(weights.some((entry) => entry.provider_id === weakProvider.id)).toBe(false);
    expect(exclusions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider_id: weakProvider.id, reason: 'below_minimum_slu_30d' })
      ])
    );
  });

  it('caps provider weights and renormalizes the residual share', () => {
    const extraProvider = new ProviderRepository(db).create({
      name: 'nova-grid',
      operator_address: '0x0000000000000000000000000000000000000003',
      region: 'apac',
      sector_tags: ['infra'],
      energy_mix: 'solar',
      metadata: {}
    });

    const mapping = [
      { provider: providers[0], slu: 90 },
      { provider: providers[1], slu: 10 },
      { provider: extraProvider, slu: 5 }
    ];

    mapping.forEach((entry) => addScore(indexEngine, entry.provider.id, '2024-06-30', entry.slu));

    const weightSet = indexEngine.rebalance({
      asOfDate: '2024-07-01',
      minimumSlu30d: 1,
      capPercent: 15,
      lookbackDays: 90
    });

    const weights = indexEngine.constituentWeights.listForWeightSet(weightSet.id);
    const totalWeight = weights.reduce((acc, entry) => acc + entry.weight, 0);
    const maxWeight = Math.max(...weights.map((entry) => entry.weight));

    expect(totalWeight).toBeLessThanOrEqual(1);
    expect(maxWeight).toBeLessThanOrEqual(0.15 + 1e-6);
  });

  it('computes index values using the base divisor and stored weights', () => {
    const providerA = providers[0];
    const providerB = providers[1];

    addScore(indexEngine, providerA.id, '2024-06-29', 60);
    addScore(indexEngine, providerB.id, '2024-06-29', 40);
    addScore(indexEngine, providerA.id, '2024-06-30', 2);
    addScore(indexEngine, providerB.id, '2024-06-30', 4);

    const weightSet = indexEngine.rebalance({
      asOfDate: '2024-06-30',
      minimumSlu30d: 1,
      capPercent: 50,
      lookbackDays: 90,
      baseDivisor: 1
    });

    const indexValue = indexEngine.computeIndexValue('2024-06-30', weightSet.id);
    const weights = indexEngine.constituentWeights.listForWeightSet(weightSet.id);
    const weightMap = new Map(weights.map((entry) => [entry.provider_id, entry.weight]));
    const expected = (weightMap.get(providerA.id) ?? 0) * 2 + (weightMap.get(providerB.id) ?? 0) * 4;

    expect(indexValue.effective_date).toBe('2024-06-30');
    expect(indexValue.headline_value).toBeCloseTo(expected, 6);
    expect(indexValue.weight_set_id).toBe(weightSet.id);
  });

  it('backfills an index history with periodic rebalances', () => {
    providers.forEach((provider) => {
      for (let i = 0; i < 10; i += 1) {
        addScore(indexEngine, provider.id, `2024-06-${String(1 + i).padStart(2, '0')}`, 5 + i);
      }
    });

    const result = indexEngine.backfillIndexHistory({
      startDate: '2024-06-01',
      endDate: '2024-06-10',
      capPercent: 20,
      minimumSlu30d: 1,
      rebalanceIntervalDays: 5
    });

    expect(result.indexValues).toHaveLength(10);
    expect(result.weightSets.length).toBeGreaterThanOrEqual(2);
  });
});
