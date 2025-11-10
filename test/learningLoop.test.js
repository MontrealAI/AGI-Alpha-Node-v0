import { describe, it, expect } from 'vitest';
import { runCurriculumEvolution } from '../src/intelligence/learningLoop.js';

describe('learning loop', () => {
  it('amplifies difficulty when success is above threshold', () => {
    const result = runCurriculumEvolution({
      history: [
        { difficulty: 4, successRate: 0.85, reward: 1.4 },
        { difficulty: 4.5, successRate: 0.82, reward: 1.5 },
        { difficulty: 5, successRate: 0.8, reward: 1.6 }
      ],
      explorationBias: 0.25,
      shockFactor: 0.05,
      targetSuccessFloor: 0.78
    });

    expect(result.curriculum.status).toBe('expanding');
    expect(result.curriculum.nextDifficulty).toBeGreaterThan(5);
    expect(result.generatedChallenges).toHaveLength(3);
  });

  it('guards against invalid ranges', () => {
    expect(() => runCurriculumEvolution({ history: [], explorationBias: -1 })).toThrow();
  });
});
