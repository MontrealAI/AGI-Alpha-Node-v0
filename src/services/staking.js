import { Contract, Interface, getAddress } from 'ethers';
import { parseTokenAmount } from '../utils/formatters.js';

export const STAKE_MANAGER_ABI = [
  'function minimumStake() view returns (uint256)',
  'function getStake(address operator) view returns (uint256)',
  'function slashingPenalty(address operator) view returns (uint256)',
  'function isOperatorHealthy(address operator) view returns (bool)'
];

export const PLATFORM_INCENTIVES_ABI = [
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
    healthy: null
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
      status.healthy = await stakeManager.isOperatorHealthy(normalizedOperator);
    } catch (error) {
      status.healthy = null;
      status.healthError = error;
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
