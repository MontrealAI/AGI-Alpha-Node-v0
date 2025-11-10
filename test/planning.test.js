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
});
