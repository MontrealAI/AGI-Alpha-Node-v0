import { describe, it, expect } from 'vitest';
import { planJobExecution, describeStrategyComparison, DEFAULT_STRATEGIES } from '../src/intelligence/planning.js';

describe('planning', () => {
  it('selects the most capable strategy for complex jobs', () => {
    const plan = planJobExecution({
      jobProfile: {
        name: 'orbital-ops',
        reward: '1200',
        complexity: 8.5,
        deadlineHours: 24,
        riskBps: 1800
      },
      strategies: DEFAULT_STRATEGIES,
      horizon: 4
    });

    expect(plan.recommended.strategy.name).toBe('hyperstate-overdrive');
    expect(plan.evaluations).toHaveLength(DEFAULT_STRATEGIES.length);
    expect(plan.projection.timeline).toHaveLength(4);
    expect(plan.projection.projectedReward > 0n).toBe(true);

    const comparison = describeStrategyComparison(plan);
    expect(comparison[0]).toMatchObject({ name: 'hyperstate-overdrive' });
  });

  it('rejects invalid horizons', () => {
    expect(() =>
      planJobExecution({
        jobProfile: { reward: '10', complexity: 1, deadlineHours: 1 },
        strategies: DEFAULT_STRATEGIES,
        horizon: 0
      })
    ).toThrow(/horizon/);
  });

  it('rejects empty strategy lists', () => {
    expect(() =>
      planJobExecution({
        jobProfile: { reward: '10', complexity: 2, deadlineHours: 1 },
        strategies: [],
        horizon: 1
      })
    ).toThrow(/strategy/);
  });

  it('prefers higher net value when scores tie', () => {
    const plan = planJobExecution({
      jobProfile: {
        reward: '10',
        complexity: 50,
        deadlineHours: 1,
        riskBps: 6000,
        penaltiesBps: 4000
      },
      strategies: [
        { name: 'high-cost', computeCost: '9', reliability: 0.75, capability: 0.8, parallelism: 1 },
        { name: 'lower-cost', computeCost: '8', reliability: 0.75, capability: 0.8, parallelism: 1 }
      ],
      horizon: 1
    });

    expect(plan.recommended.strategy.name).toBe('lower-cost');
  });
});
