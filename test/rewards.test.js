import { describe, expect, it } from 'vitest';
import { calculateRewardShare, projectEpochRewards, splitRewardPool } from '../src/services/rewards.js';

describe('rewards', () => {
  it('computes reward share', () => {
    const share = calculateRewardShare({ totalRewards: '1000', shareBps: 1500 });
    expect(share).toBe(150000000000000000000n);
  });

  it('projects epoch rewards', () => {
    const projection = projectEpochRewards({ projectedPool: '2000', operatorShareBps: 2000 });
    expect(projection.operatorPortion).toBe(400000000000000000000n);
  });

  it('splits reward pool with stake weighting', () => {
    const distribution = splitRewardPool({
      totalRewards: '1000',
      operatorStake: '2000',
      totalStake: '5000',
      operatorFloorBps: 1500,
      validatorShareBps: 7500,
      treasuryShareBps: 1000
    });

    const scale = 10n ** 18n;
    expect(distribution.operator.floor).toBe(150n * scale);
    expect(distribution.operator.weighted).toBe(340n * scale);
    expect(distribution.operator.total).toBe(490n * scale);
    expect(distribution.validator).toBe(450n * scale);
    expect(distribution.treasury).toBe(60n * scale);
    expect(distribution.operator.total + distribution.validator + distribution.treasury).toBe(1000n * scale);
  });

  it('handles zero total stake without division errors', () => {
    const distribution = splitRewardPool({
      totalRewards: '250',
      operatorStake: '0',
      totalStake: '0',
      operatorFloorBps: 1500,
      validatorShareBps: 7500,
      treasuryShareBps: 1000
    });

    const scale = 10n ** 18n;
    const half = scale / 2n;
    expect(distribution.operator.floor).toBe(37n * scale + half); // 37.5 tokens
    expect(distribution.operator.weighted).toBe(0n);
    expect(distribution.validator).toBe(187n * scale + half);
    expect(distribution.treasury).toBe(25n * scale);
    expect(distribution.operator.total + distribution.validator + distribution.treasury).toBe(250n * scale);
  });
});
