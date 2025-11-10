import { parseTokenAmount } from '../utils/formatters.js';

export function calculateRewardShare({ totalRewards, shareBps, decimals = 18 }) {
  if (shareBps < 0 || shareBps > 10_000) {
    throw new RangeError('shareBps must be between 0 and 10_000');
  }
  const total = parseTokenAmount(totalRewards, decimals);
  return (total * BigInt(shareBps)) / 10_000n;
}

export function projectEpochRewards({
  projectedPool,
  operatorShareBps = 1500,
  decimals = 18
}) {
  const pool = parseTokenAmount(projectedPool, decimals);
  const operatorPortion = calculateRewardShare({ totalRewards: pool, shareBps: operatorShareBps, decimals });
  return {
    pool,
    operatorShareBps,
    operatorPortion
  };
}
