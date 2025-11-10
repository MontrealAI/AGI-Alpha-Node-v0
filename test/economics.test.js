import { describe, expect, it } from 'vitest';
import { optimizeReinvestmentStrategy, summarizeStrategy } from '../src/services/economics.js';
import { parseTokenAmount } from '../src/utils/formatters.js';

const DECIMALS = 18;

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
