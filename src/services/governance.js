import { Interface, getAddress, id, parseUnits } from 'ethers';

const systemPauseInterface = new Interface([
  'function pauseAll()',
  'function resumeAll()',
  'function unpauseAll()'
]);

const stakeManagerInterface = new Interface(['function setMinimumStake(uint256 newMinimum)']);

const rewardEngineInterface = new Interface([
  'function setRoleShare(bytes32 role, uint16 shareBps)',
  'function setGlobalShares(uint16 operatorShareBps, uint16 validatorShareBps, uint16 treasuryShareBps)'
]);

const roleAliasMap = {
  operator: 'NODE_OPERATOR_ROLE',
  node: 'NODE_OPERATOR_ROLE',
  node_operator: 'NODE_OPERATOR_ROLE',
  validator: 'VALIDATOR_ROLE',
  validators: 'VALIDATOR_ROLE',
  agent: 'AGENT_ROLE',
  agents: 'AGENT_ROLE',
  treasury: 'TREASURY_ROLE',
  guardian: 'GUARDIAN_ROLE'
};

function normalizeShareBps(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || Number.isNaN(numeric)) {
    throw new Error('shareBps must be a finite number');
  }
  if (!Number.isInteger(numeric)) {
    throw new Error('shareBps must be an integer');
  }
  if (numeric < 0 || numeric > 10_000) {
    throw new Error('shareBps must be between 0 and 10000');
  }
  return numeric;
}

function resolveRoleIdentifier(role) {
  if (!role) {
    throw new Error('role is required');
  }
  const trimmed = role.trim();
  if (trimmed.startsWith('0x')) {
    if (trimmed.length !== 66) {
      throw new Error('role identifier must be a 32-byte hex value');
    }
    return trimmed.toLowerCase();
  }
  const normalized = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const canonical = roleAliasMap[normalized] ?? trimmed.toUpperCase();
  return id(canonical);
}

export function buildSystemPauseTx({ systemPauseAddress, action }) {
  if (!systemPauseAddress) {
    throw new Error('systemPauseAddress is required');
  }
  const to = getAddress(systemPauseAddress);
  const normalizedAction = action ? action.toLowerCase() : 'pause';
  const methodMap = {
    pause: 'pauseAll',
    halt: 'pauseAll',
    resume: 'resumeAll',
    unpause: 'unpauseAll'
  };
  const method = methodMap[normalizedAction];
  if (!method) {
    throw new Error(`Unsupported action "${action}"`);
  }
  const data = systemPauseInterface.encodeFunctionData(method, []);
  return { to, data, method };
}

export function buildMinimumStakeTx({ stakeManagerAddress, amount, decimals = 18 }) {
  if (!stakeManagerAddress) {
    throw new Error('stakeManagerAddress is required');
  }
  if (amount === undefined || amount === null) {
    throw new Error('amount is required');
  }
  const to = getAddress(stakeManagerAddress);
  const parsedAmount = parseUnits(String(amount), decimals);
  const data = stakeManagerInterface.encodeFunctionData('setMinimumStake', [parsedAmount]);
  return { to, data, amount: parsedAmount };
}

export function buildRoleShareTx({ rewardEngineAddress, role, shareBps }) {
  if (!rewardEngineAddress) {
    throw new Error('rewardEngineAddress is required');
  }
  const share = normalizeShareBps(shareBps);
  const roleIdentifier = resolveRoleIdentifier(role);
  const to = getAddress(rewardEngineAddress);
  const data = rewardEngineInterface.encodeFunctionData('setRoleShare', [roleIdentifier, share]);
  return { to, data, role: roleIdentifier, shareBps: share };
}

export function buildGlobalSharesTx({
  rewardEngineAddress,
  operatorShareBps,
  validatorShareBps,
  treasuryShareBps
}) {
  if (!rewardEngineAddress) {
    throw new Error('rewardEngineAddress is required');
  }
  const operatorShare = normalizeShareBps(operatorShareBps);
  const validatorShare = normalizeShareBps(validatorShareBps);
  const treasuryShare = normalizeShareBps(treasuryShareBps);
  const total = operatorShare + validatorShare + treasuryShare;
  if (total !== 10_000) {
    throw new Error('Global share allocation must sum to exactly 10000 bps');
  }
  const to = getAddress(rewardEngineAddress);
  const data = rewardEngineInterface.encodeFunctionData('setGlobalShares', [
    operatorShare,
    validatorShare,
    treasuryShare
  ]);
  return {
    to,
    data,
    shares: {
      operatorShare,
      validatorShare,
      treasuryShare
    }
  };
}

export { resolveRoleIdentifier };
