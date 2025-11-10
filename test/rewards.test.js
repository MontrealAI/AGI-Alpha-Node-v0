import { describe, expect, it } from 'vitest';
import { calculateRewardShare, projectEpochRewards } from '../src/services/rewards.js';

describe('rewards', () => {
  it('computes reward share', () => {
    const share = calculateRewardShare({ totalRewards: '1000', shareBps: 1500 });
    expect(share).toBe(150000000000000000000n);
  });

  it('projects epoch rewards', () => {
    const projection = projectEpochRewards({ projectedPool: '2000', operatorShareBps: 2000 });
    expect(projection.operatorPortion).toBe(400000000000000000000n);
  });
});
