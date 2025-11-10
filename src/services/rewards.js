import { parseTokenAmount } from '../utils/formatters.js';

export function calculateRewardShare({ totalRewards, shareBps, decimals = 18 }) {
  if (shareBps < 0 || shareBps > 10_000) {
    throw new RangeError('shareBps must be between 0 and 10_000');
  }
  const total = parseTokenAmount(totalRewards, decimals);
  return (total * BigInt(shareBps)) / 10_000n;
}

function normalizeShareValue(value) {
  const share = Number(value);
  if (!Number.isFinite(share) || !Number.isInteger(share)) {
    throw new RangeError('Share basis points must be a finite integer');
  }
  if (share < 0 || share > 10_000) {
    throw new RangeError('Share basis points must be between 0 and 10_000');
  }
  return share;
}

function normalizeRoleShares(roleShares) {
  if (!roleShares) return undefined;
  const normalized = {};
  for (const [role, share] of Object.entries(roleShares)) {
    if (share === undefined || share === null) continue;
    normalized[role] = normalizeShareValue(share);
  }
  return normalized;
}

export function projectEpochRewards({
  projectedPool,
  operatorShareBps = 1500,
  validatorShareBps,
  treasuryShareBps,
  roleShares,
  decimals = 18
}) {
  const pool = parseTokenAmount(projectedPool, decimals);
  const operatorShare = normalizeShareValue(operatorShareBps);
  const operatorPortion = calculateRewardShare({ totalRewards: pool, shareBps: operatorShare, decimals });
  const validatorShare =
    validatorShareBps === undefined || validatorShareBps === null
      ? null
      : normalizeShareValue(validatorShareBps);
  const treasuryShare =
    treasuryShareBps === undefined || treasuryShareBps === null
      ? null
      : normalizeShareValue(treasuryShareBps);
  const normalizedRoleShares = normalizeRoleShares(roleShares);
  return {
    pool,
    operatorShareBps: operatorShare,
    validatorShareBps: validatorShare,
    treasuryShareBps: treasuryShare,
    roleShares: normalizedRoleShares,
    operatorPortion
  };
}

export function splitRewardPool({
  totalRewards,
  operatorStake,
  totalStake,
  operatorFloorBps = 1500,
  validatorShareBps = 7500,
  treasuryShareBps = 1000,
  decimals = 18
}) {
  if (operatorFloorBps < 0 || operatorFloorBps > 10_000) {
    throw new RangeError('operatorFloorBps must be between 0 and 10000');
  }
  if (validatorShareBps < 0 || treasuryShareBps < 0) {
    throw new RangeError('validatorShareBps and treasuryShareBps must be non-negative');
  }
  if (operatorFloorBps + validatorShareBps + treasuryShareBps !== 10_000) {
    throw new RangeError('Reward share basis points must sum to exactly 10000');
  }

  const pool = parseTokenAmount(totalRewards, decimals);
  const operatorStakeAmount = parseTokenAmount(operatorStake ?? 0n, decimals);
  const totalStakeAmount = parseTokenAmount(totalStake ?? 0n, decimals);

  const floor = calculateRewardShare({ totalRewards: pool, shareBps: operatorFloorBps, decimals });
  let remainder = pool - floor;
  if (remainder < 0n) remainder = 0n;

  let weighted = 0n;
  if (totalStakeAmount > 0n && operatorStakeAmount > 0n) {
    weighted = (remainder * operatorStakeAmount) / totalStakeAmount;
  }

  if (weighted > remainder) {
    weighted = remainder;
  }

  const remainderAfterOperator = remainder - weighted;
  const remainderBps = validatorShareBps + treasuryShareBps;

  let validatorShare = 0n;
  let treasuryShare = 0n;
  if (remainderBps > 0) {
    validatorShare = (remainderAfterOperator * BigInt(validatorShareBps)) / BigInt(remainderBps);
    treasuryShare = remainderAfterOperator - validatorShare;
  }

  const operatorTotal = floor + weighted;

  return {
    pool,
    operator: {
      floor,
      weighted,
      total: operatorTotal
    },
    validator: validatorShare,
    treasury: treasuryShare,
    remainder: remainderAfterOperator,
    shares: {
      operatorFloorBps,
      validatorShareBps,
      treasuryShareBps
    }
  };
}
