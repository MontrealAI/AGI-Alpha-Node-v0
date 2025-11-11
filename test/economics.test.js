import { describe, expect, it } from 'vitest';
import {
  optimizeReinvestmentStrategy,
  summarizeStrategy,
  calculateAlphaWorkUnit,
  calculateAlphaProductivityIndex
} from '../src/services/economics.js';
import { parseTokenAmount } from '../src/utils/formatters.js';

const DECIMALS = 18;

const SCALE = 10n ** BigInt(DECIMALS);

function toBig(amount) {
  return parseTokenAmount(amount, DECIMALS);
}

describe('optimizeReinvestmentStrategy', () => {
  it('recommends a reinvestment option that satisfies buffer policies when possible', () => {
    const plan = optimizeReinvestmentStrategy({
      currentStake: '1000',
      rewardHistory: ['120', '100', '110'],
      reinvestOptions: [9000, 8000, 6000],
      upcomingObligations: ['30'],
      decimals: DECIMALS,
      minimumBufferBps: 2500,
      riskAversionBps: 2000
    });

    expect(plan.recommended.reinvestBps).toBe(6000);
    expect(plan.recommended.bufferAmount >= toBig('30')).toBe(true);
    expect(plan.bufferCoverage.meetsMinimum).toBe(true);
    expect(plan.historyStats.average).toEqual(toBig('110'));
  });

  it('penalizes aggressive reinvestment under high risk aversion', () => {
    const plan = optimizeReinvestmentStrategy({
      currentStake: '500',
      rewardHistory: ['60', '20', '30', '80'],
      reinvestOptions: [9000, 7000, 5000],
      decimals: DECIMALS,
      minimumBufferBps: 1000,
      riskAversionBps: 9000
    });

    expect(plan.recommended.reinvestBps).toBe(5000);
    const summary = summarizeStrategy(plan);
    expect(summary.meetsMinimumBuffer).toBe(true);
    expect(summary.bufferEpochs >= 0n).toBe(true);
  });

  it('validates inputs and rejects invalid configuration', () => {
    expect(() =>
      optimizeReinvestmentStrategy({
        currentStake: '0',
        rewardHistory: [],
        reinvestOptions: [5000]
      })
    ).toThrow(/rewardHistory must contain at least one entry/);

    expect(() =>
      optimizeReinvestmentStrategy({
        currentStake: '100',
        rewardHistory: ['10'],
        reinvestOptions: [20_000]
      })
    ).toThrow(/between 0 and 10000/);
  });
});

describe('calculateAlphaWorkUnit', () => {
  it('computes α-WU using workload metrics', () => {
    const result = calculateAlphaWorkUnit({
      gpuSeconds: 100,
      gflopsNorm: 0.5,
      modelTier: 1.0,
      sloPass: 1.0,
      qualityValidation: 1.0,
      decimals: DECIMALS
    });

    expect(result.alphaWu).toEqual(toBig('50'));
    expect(result.factors.gpuSeconds).toBeCloseTo(100);
    expect(result.factors.sloPass).toBeCloseTo(1);
  });

  it('validates required quality inputs', () => {
    expect(() =>
      calculateAlphaWorkUnit({
        gpuSeconds: 1,
        gflopsNorm: 1,
        modelTier: 1,
        sloPass: 1
      })
    ).toThrow(/qualityValidation is required/);
  });
});

describe('calculateAlphaProductivityIndex', () => {
  it('aggregates α-WU totals, burn ratios, and yield metrics', () => {
    const index = calculateAlphaProductivityIndex({
      reports: [
        {
          epoch: 1,
          alpha: '100',
          sloPass: 0.95,
          quality: 0.92,
          tokensEmitted: '60',
          tokensBurned: '6'
        },
        {
          epoch: 2,
          gpuSeconds: 100,
          gflopsNorm: 1,
          modelTier: 1,
          sloPass: 1,
          qualityValidation: 0.8,
          tokensEmitted: '55',
          tokensBurned: '5'
        },
        {
          epoch: 3,
          alphaWu: toBig('150'),
          sloPass: 0.99,
          quality: 0.96,
          tokensEmitted: '70',
          tokensBurned: '7'
        }
      ],
      decimals: DECIMALS,
      circulatingSupply: '1000'
    });

    expect(index.totalAlphaWu).toEqual(toBig('330'));
    expect(index.averageAlphaWu).toEqual(toBig('110'));
    expect(index.growthBps).toBe(5000n);
    expect(index.averages.sloPass).toBeCloseTo((0.95 + 1 + 0.99) / 3, 5);
    expect(index.averages.quality).toBeCloseTo((0.92 + 0.8 + 0.96) / 3, 5);
    expect(index.totals.tokensEmitted).toEqual(toBig('185'));
    expect(index.totals.tokensBurned).toEqual(toBig('18'));
    expect(index.totals.netTokens).toEqual(toBig('167'));
    expect(index.burnToEmissionBps).toBe(972n);

    const expectedWage = (toBig('185') * SCALE) / toBig('330');
    expect(index.wagePerAlpha).toEqual(expectedWage);

    const expectedSly = (toBig('330') * SCALE) / toBig('1000');
    expect(index.syntheticLaborYield).toEqual(expectedSly);
    expect(index.contributions).toHaveLength(3);
    expect(index.contributions[1].alphaWu).toEqual(toBig('80'));
  });

  it('requires α-WU metrics or values', () => {
    expect(() => calculateAlphaProductivityIndex({ reports: [{}] })).toThrow(/must include alpha/);
  });
});
