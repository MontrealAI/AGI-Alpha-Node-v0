import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ALPHA_WB_CONFIG,
  computeAlphaWorkBenchmarkIndex,
  computeConstituentAlphaWU,
  computeEnergyAdjustment,
  computeQualityAdjustment,
  computeRawThroughput,
  computeValidatorConsensus,
  deriveThroughputFromSegments,
  rebalanceConstituentWeights
} from '../src/services/alphaBenchmark.js';

const baseline = DEFAULT_ALPHA_WB_CONFIG;

describe('alpha benchmark primitives', () => {
  it('computes raw throughput with precision', () => {
    expect(computeRawThroughput({ tasksCompleted: 10, taskDifficultyCoefficient: 1.25 })).toBe(12.5);
  });

  it('guards against invalid throughput inputs', () => {
    expect(() => computeRawThroughput({ tasksCompleted: -1, taskDifficultyCoefficient: 1 })).toThrow();
    expect(() => computeRawThroughput({ tasksCompleted: 1, taskDifficultyCoefficient: 0 })).toThrow();
  });

  it('computes energy adjustments with caps', () => {
    const efficient = computeEnergyAdjustment({ energyKwhPerAlphaWU: 0.8, energyCostPerKwh: 0.1 }, baseline);
    expect(efficient).toBeCloseTo(baseline.energyAdjustmentCap, 4);

    const inefficient = computeEnergyAdjustment({ energyKwhPerAlphaWU: 4, energyCostPerKwh: 0.5 }, baseline);
    expect(inefficient).toBe(baseline.energyAdjustmentFloor);
  });

  it('computes quality adjustments with caps', () => {
    const high = computeQualityAdjustment({ qualityScore: 3 }, baseline);
    expect(high).toBe(baseline.qualityAdjustmentCap);

    const low = computeQualityAdjustment({ qualityScore: 0.4 }, baseline);
    expect(low).toBe(baseline.qualityAdjustmentFloor);
  });

  it('computes validator consensus with penalties and caps', () => {
    const stable = computeValidatorConsensus({ consensusRate: 0.995, reproducibilityPenalty: 0.01, slashRate: 0.01 }, baseline);
    expect(stable).toBeCloseTo(0.975, 3);

    const floored = computeValidatorConsensus({ consensusRate: 0.05, reproducibilityPenalty: 0.01 }, baseline);
    expect(floored).toBe(baseline.consensusAdjustmentFloor);
  });
});

describe('constituent aggregation', () => {
  it('derives throughput from metering segments', () => {
    const result = deriveThroughputFromSegments([
      { qualityMultiplier: 2 },
      { qualityMultiplier: 1.5 },
      { qualityMultiplier: 1 }
    ]);
    expect(result).toEqual({ tasksCompleted: 3, taskDifficultyCoefficient: 1.5 });
  });

  it('computes constituent alpha-wu with all adjustments', () => {
    const constituent = computeConstituentAlphaWU({
      label: 'provider-A',
      tasksCompleted: 120,
      taskDifficultyCoefficient: 1.2,
      energyKwhPerAlphaWU: 0.9,
      energyCostPerKwh: 0.08,
      qualityScore: 1.1,
      consensusRate: 0.995
    }, baseline);

    expect(constituent.label).toBe('provider-A');
    expect(constituent.rawThroughput).toBe(144);
    expect(constituent.energyAdjustment).toBeCloseTo(1.25, 2);
    expect(constituent.qualityAdjustment).toBeCloseTo(1.1, 2);
    expect(constituent.consensusAdjustment).toBeCloseTo(0.995, 3);
    expect(constituent.alphaWU).toBeGreaterThan(0);
  });

  it('rebalances weights with caps and floors', () => {
    const weighted = rebalanceConstituentWeights([
      { label: 'A', weight: 0.6 },
      { label: 'B', weight: 0.3 },
      { label: 'C', weight: 0.1 }
    ], baseline);

    const total = weighted.reduce((acc, entry) => acc + entry.weight, 0);
    const effectiveCap = Math.max(baseline.rebalanceCap, 1 / weighted.length);

    expect(total).toBeCloseTo(1, 6);
    expect(Math.max(...weighted.map((w) => w.weight))).toBeLessThanOrEqual(effectiveCap + 1e-6);
    expect(Math.min(...weighted.map((w) => w.weight))).toBeGreaterThanOrEqual(baseline.rebalanceFloor);
  });

  it('computes benchmark index with derived weights', () => {
    const { alphaWB, constituents, baseDivisor } = computeAlphaWorkBenchmarkIndex([
      {
        label: 'Fleet-1',
        tasksCompleted: 200,
        taskDifficultyCoefficient: 1.1,
        energyKwhPerAlphaWU: 0.9,
        energyCostPerKwh: 0.09,
        qualityScore: 1.15,
        consensusRate: 0.99
      },
      {
        label: 'Fleet-2',
        tasksCompleted: 120,
        taskDifficultyCoefficient: 0.9,
        energyKwhPerAlphaWU: 1.4,
        energyCostPerKwh: 0.12,
        qualityScore: 0.95,
        consensusRate: 0.92,
        workShare: 0.25
      }
    ], baseline);

    expect(baseDivisor).toBe(baseline.baseDivisor);
    expect(alphaWB).toBeGreaterThan(0);
    expect(constituents.length).toBe(2);
    const totalWeight = constituents.reduce((acc, entry) => acc + entry.weight, 0);
    expect(totalWeight).toBeCloseTo(1, 4);
  });
});
