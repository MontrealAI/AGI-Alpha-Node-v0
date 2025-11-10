import { describe, it, expect } from 'vitest';
import { assessAntifragility } from '../src/intelligence/stressHarness.js';

describe('stress harness', () => {
  it('scores scenarios and surfaces weakest focus areas', () => {
    const result = assessAntifragility({
      baseline: {
        capacityIndex: 6,
        errorBudget: 0.08,
        downtimeBudget: 20,
        financialBuffer: 250000
      },
      scenarios: [
        { name: 'flash-crash', loadFactor: 12, errorRate: 0.12, downtimeMinutes: 14, financialExposure: 180000 },
        { name: 'api-outage', loadFactor: 4, errorRate: 0.05, downtimeMinutes: 60, financialExposure: 50000 },
        { name: 'validator-fork', loadFactor: 7, errorRate: 0.1, downtimeMinutes: 25, financialExposure: 120000 }
      ],
      remediationBias: 0.7
    });

    expect(result.evaluations).toHaveLength(3);
    expect(result.recommendedFocus.length).toBeGreaterThan(0);
    expect(result.antifragileGain).toBeGreaterThan(0);
  });

  it('requires baseline data', () => {
    expect(() => assessAntifragility({ baseline: null, scenarios: [] })).toThrow();
  });
});
