import { describe, expect, it } from 'vitest';
import { derivePerformanceProfile } from '../src/services/performance.js';

describe('derivePerformanceProfile', () => {
  it('returns metrics using defaults', () => {
    const profile = derivePerformanceProfile();
    expect(profile.throughputPerEpoch).toBeGreaterThan(0);
    expect(profile.successRate).toBeGreaterThan(0);
    expect(typeof profile.tokenEarningsProjection).toBe('bigint');
    expect(Array.isArray(profile.utilization)).toBe(true);
  });

  it('honors custom history and tasks', () => {
    const profile = derivePerformanceProfile({
      history: [
        { difficulty: 3, successRate: 0.5, reward: 1.2 },
        { difficulty: 6, successRate: 0.75, reward: 1.4 }
      ],
      tasks: [
        { name: 'custom', domain: 'finance', complexity: 2, urgency: 3, value: 4 }
      ],
      agents: [
        { name: 'solo', domains: ['finance'], capacity: 1, latencyMs: 80, quality: 0.9, capability: 5 }
      ]
    });
    expect(profile.throughputPerEpoch).toBe(1);
    expect(profile.successRate).toBeCloseTo(0.625, 3);
  });
});
