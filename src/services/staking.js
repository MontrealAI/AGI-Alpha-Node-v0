import { Contract, Interface, getAddress } from 'ethers';
import { parseTokenAmount } from '../utils/formatters.js';

export const STAKE_MANAGER_ABI = [
  'function minimumStake() view returns (uint256)',
  'function getStake(address operator) view returns (uint256)',
  'function slashingPenalty(address operator) view returns (uint256)',
  'function isOperatorHealthy(address operator) view returns (bool)',
  'function jobRegistry() view returns (address)',
  'function identityRegistry() view returns (address)'
];

export const PLATFORM_INCENTIVES_ABI = [
  'function acknowledgeStakeAndActivate(uint256 amount) external',
  'function stakeAndActivate(uint256 amount) external',
  'function operatorInfo(address operator) view returns (uint256 stake, bool active, uint256 lastHeartbeat)',
  'function minimumStake() view returns (uint256)'
];

const defaultFactory = (address, abi, provider) => new Contract(address, abi, provider);

export async function getStakeStatus({
  provider,
  operatorAddress,
  stakeManagerAddress,
  incentivesAddress,
  contractFactory = defaultFactory
}) {
  if (!provider) throw new Error('provider is required');
  if (!operatorAddress) throw new Error('operatorAddress is required');

  const normalizedOperator = getAddress(operatorAddress);
  const status = {
    operator: normalizedOperator,
    minimumStake: null,
    operatorStake: null,
    active: null,
    lastHeartbeat: null,
    healthy: null,
    slashingPenalty: null,
    jobRegistryAddress: null,
    identityRegistryAddress: null
  };

  if (stakeManagerAddress) {
    const stakeManager = contractFactory(stakeManagerAddress, STAKE_MANAGER_ABI, provider);
    try {
      status.minimumStake = BigInt(await stakeManager.minimumStake());
    } catch (error) {
      status.minimumStake = null;
      status.minimumStakeError = error;
    }
    try {
      status.operatorStake = BigInt(await stakeManager.getStake(normalizedOperator));
    } catch (error) {
      status.operatorStake = null;
      status.operatorStakeError = error;
    }
    try {
      status.slashingPenalty = BigInt(await stakeManager.slashingPenalty(normalizedOperator));
    } catch (error) {
      status.slashingPenalty = null;
      status.slashingPenaltyError = error;
    }
    try {
      status.healthy = await stakeManager.isOperatorHealthy(normalizedOperator);
    } catch (error) {
      status.healthy = null;
      status.healthError = error;
    }
    try {
      const registry = await stakeManager.jobRegistry();
      status.jobRegistryAddress = registry ? getAddress(registry) : null;
    } catch (error) {
      status.jobRegistryAddress = null;
      status.jobRegistryError = error;
    }
    try {
      const registry = await stakeManager.identityRegistry();
      status.identityRegistryAddress = registry ? getAddress(registry) : null;
    } catch (error) {
      status.identityRegistryAddress = null;
      status.identityRegistryError = error;
    }
  }

  if (incentivesAddress) {
    const incentives = contractFactory(incentivesAddress, PLATFORM_INCENTIVES_ABI, provider);
    try {
      const info = await incentives.operatorInfo(normalizedOperator);
      if (Array.isArray(info)) {
        const [stake, active, lastHeartbeat] = info;
        status.operatorStake = status.operatorStake ?? BigInt(stake);
        status.active = Boolean(active);
        status.lastHeartbeat = BigInt(lastHeartbeat);
      } else if (info && typeof info === 'object') {
        if ('stake' in info) status.operatorStake = status.operatorStake ?? BigInt(info.stake);
        if ('active' in info) status.active = Boolean(info.active);
        if ('lastHeartbeat' in info) status.lastHeartbeat = BigInt(info.lastHeartbeat);
      }
    } catch (error) {
      status.active = null;
      status.lastHeartbeat = null;
      status.operatorInfoError = error;
    }
    if (!status.minimumStake) {
      try {
        status.minimumStake = BigInt(await incentives.minimumStake());
      } catch (error) {
        status.minimumStake = null;
        status.minimumStakeError = error;
      }
    }
  }

  if (status.minimumStake !== null && status.operatorStake !== null) {
    status.healthy = status.healthy ?? status.operatorStake >= status.minimumStake;
  }

  return status;
}

export function buildStakeAndActivateTx({
  amount,
  decimals = 18,
  incentivesAddress
}) {
  if (!incentivesAddress) {
    throw new Error('incentivesAddress is required to build stake transaction');
  }
  const parsedAmount = parseTokenAmount(amount, decimals);
  const iface = new Interface(PLATFORM_INCENTIVES_ABI);
  const data = iface.encodeFunctionData('stakeAndActivate', [parsedAmount]);
  return {
    to: getAddress(incentivesAddress),
    data,
    value: 0n,
    amount: parsedAmount
  };
}

export function validateStakeThreshold({ minimumStake, operatorStake }) {
  if (minimumStake === null || operatorStake === null) return null;
  const meets = operatorStake >= minimumStake;
  return {
    meets,
    deficit: meets ? 0n : minimumStake - operatorStake
  };
}

function toOptionalBigInt(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Numeric values must be finite to convert to bigint');
    }
    return BigInt(Math.trunc(value));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    if (!/^[-+]?\d+$/.test(trimmed)) {
      throw new Error(`Cannot convert value "${value}" to bigint`);
    }
    return BigInt(trimmed);
  }
  throw new TypeError('Unsupported type for bigint conversion');
}

export function evaluateStakeConditions({
  minimumStake,
  operatorStake,
  slashingPenalty = 0n,
  lastHeartbeat,
  heartbeatGraceSeconds = 3600,
  currentTimestamp = Math.floor(Date.now() / 1000)
}) {
  const normalizedMinimum = toOptionalBigInt(minimumStake);
  const normalizedStake = toOptionalBigInt(operatorStake);
  const normalizedPenalty = toOptionalBigInt(slashingPenalty) ?? 0n;
  const normalizedHeartbeat = toOptionalBigInt(lastHeartbeat);
  const normalizedNow = toOptionalBigInt(currentTimestamp);

  let meets = null;
  let deficit = null;
  if (normalizedMinimum !== null && normalizedStake !== null) {
    meets = normalizedStake >= normalizedMinimum;
    deficit = meets ? 0n : normalizedMinimum - normalizedStake;
  }

  let heartbeatAgeSeconds = null;
  let heartbeatStale = null;
  if (normalizedHeartbeat !== null && normalizedNow !== null) {
    const delta = normalizedNow > normalizedHeartbeat ? normalizedNow - normalizedHeartbeat : 0n;
    heartbeatAgeSeconds = Number(delta);
    const grace = Number(heartbeatGraceSeconds ?? 0);
    heartbeatStale = heartbeatAgeSeconds > grace;
  }

  const penaltyActive = normalizedPenalty > 0n;
  const shouldPause = penaltyActive || meets === false;

  let recommendedAction = 'maintain';
  if (penaltyActive) {
    recommendedAction = 'pause-and-recover';
  } else if (meets === false) {
    recommendedAction = 'increase-stake';
  } else if (heartbeatStale === true) {
    recommendedAction = 'submit-heartbeat';
  } else if (meets === null) {
    recommendedAction = 'inspect';
  }

  return {
    meets,
    deficit,
    slashingPenalty: normalizedPenalty,
    penaltyActive,
    heartbeatAgeSeconds,
    heartbeatStale,
    shouldPause,
    recommendedAction
  };
}
