import { Interface, getAddress, id, parseUnits } from 'ethers';

const OWNER_ONLY_ABIS = {
  SystemPause: [
    'function pauseAll()',
    'function resumeAll()',
    'function unpauseAll()'
  ],
  StakeManager: [
    'function setMinimumStake(uint256 newMinimum)',
    'function setValidatorThreshold(uint256 newThreshold)',
    'function setJobRegistry(address newRegistry)',
    'function setIdentityRegistry(address newRegistry)'
  ],
  RewardEngine: [
    'function setRoleShare(bytes32 role, uint16 shareBps)',
    'function setGlobalShares(uint16 operatorShareBps, uint16 validatorShareBps, uint16 treasuryShareBps)'
  ],
  JobRegistry: [
    'function setValidationModule(address newModule)',
    'function setReputationModule(address newModule)',
    'function setDisputeModule(address newModule)',
    'function triggerDispute(uint256 jobId, bytes32 reasonHash)'
  ],
  IdentityRegistry: [
    'function setAdditionalNodeOperator(address operator, bool allowed)'
  ],
  PlatformIncentives: [
    'function setStakeManager(address newStakeManager)',
    'function setMinimumStake(uint256 newMinimumStake)',
    'function setHeartbeatGrace(uint256 newGraceSeconds)',
    'function setActivationFee(uint256 newActivationFee)',
    'function setTreasury(address newTreasury)'
  ]
};

const interfaces = Object.fromEntries(
  Object.entries(OWNER_ONLY_ABIS).map(([name, abi]) => [name, new Interface(abi)])
);

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

function normalizeBoolean(input, field) {
  if (typeof input === 'boolean') {
    return input;
  }
  if (typeof input === 'string') {
    const normalized = input.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  throw new Error(`${field} must be a boolean-like value`);
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

function computeDiff(current = {}, proposed = {}) {
  const diff = [];
  const fields = new Set([...Object.keys(current || {}), ...Object.keys(proposed || {})]);
  for (const field of fields) {
    const before = current ? current[field] : undefined;
    const after = proposed ? proposed[field] : undefined;
    const normalizedBefore = serializeBigints(before);
    const normalizedAfter = serializeBigints(after);
    if (JSON.stringify(normalizedBefore) !== JSON.stringify(normalizedAfter)) {
      diff.push({ field, before: normalizedBefore, after: normalizedAfter });
    }
  }
  return diff;
}

function serializeBigints(value) {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => serializeBigints(entry));
  }
  if (value && typeof value === 'object') {
    const clone = {};
    for (const [key, entry] of Object.entries(value)) {
      clone[key] = serializeBigints(entry);
    }
    return clone;
  }
  return value;
}

function createMetadata({
  contract,
  method,
  description,
  args,
  to,
  current,
  proposed
}) {
  const fragment = interfaces[contract].getFunction(method);
  return {
    contract,
    method,
    to,
    signature: fragment.format('sighash'),
    description,
    args: serializeBigints(args),
    current: serializeBigints(current),
    proposed: serializeBigints(proposed),
    diff: computeDiff(current, proposed)
  };
}

export function getOwnerFunctionCatalog() {
  return Object.fromEntries(
    Object.entries(OWNER_ONLY_ABIS).map(([contract, abi]) => [
      contract,
      abi.map((signature) => ({ signature }))
    ])
  );
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
  const data = interfaces.SystemPause.encodeFunctionData(method, []);
  return {
    to,
    data,
    method,
    meta: createMetadata({
      contract: 'SystemPause',
      method,
      to,
      description: `System pause directive: ${method}`,
      args: {}
    })
  };
}

export function buildMinimumStakeTx({
  stakeManagerAddress,
  amount,
  decimals = 18,
  currentMinimum = null
}) {
  if (!stakeManagerAddress) {
    throw new Error('stakeManagerAddress is required');
  }
  if (amount === undefined || amount === null) {
    throw new Error('amount is required');
  }
  if (decimals !== 18) {
    throw new Error('StakeManager minimum stake must use 18 decimals');
  }
  const to = getAddress(stakeManagerAddress);
  const parsedAmount = parseUnits(String(amount), 18);
  const data = interfaces.StakeManager.encodeFunctionData('setMinimumStake', [parsedAmount]);
  const proposed = { minimumStake: parsedAmount };
  const current =
    currentMinimum === null || currentMinimum === undefined
      ? null
      : { minimumStake: BigInt(currentMinimum) };
  return {
    to,
    data,
    amount: parsedAmount,
    meta: createMetadata({
      contract: 'StakeManager',
      method: 'setMinimumStake',
      to,
      description: 'Update minimum operator stake requirement',
      args: { newMinimum: parsedAmount.toString() },
      current,
      proposed
    })
  };
}

export function buildValidatorThresholdTx({
  stakeManagerAddress,
  threshold,
  currentThreshold = null
}) {
  if (!stakeManagerAddress) {
    throw new Error('stakeManagerAddress is required');
  }
  if (threshold === undefined || threshold === null) {
    throw new Error('threshold is required');
  }
  const to = getAddress(stakeManagerAddress);
  const parsedThreshold = BigInt(threshold);
  if (parsedThreshold < 0n) {
    throw new Error('threshold must be non-negative');
  }
  const data = interfaces.StakeManager.encodeFunctionData('setValidatorThreshold', [parsedThreshold]);
  const proposed = { validatorThreshold: parsedThreshold };
  const current = currentThreshold === null ? null : { validatorThreshold: BigInt(currentThreshold) };
  return {
    to,
    data,
    meta: createMetadata({
      contract: 'StakeManager',
      method: 'setValidatorThreshold',
      to,
      description: 'Adjust validator quorum threshold',
      args: { newThreshold: parsedThreshold.toString() },
      current,
      proposed
    })
  };
}

export function buildStakeRegistryUpgradeTx({
  stakeManagerAddress,
  registryType,
  newAddress,
  currentAddress = null
}) {
  if (!stakeManagerAddress) {
    throw new Error('stakeManagerAddress is required');
  }
  if (!registryType) {
    throw new Error('registryType is required');
  }
  if (!newAddress) {
    throw new Error('newAddress is required');
  }
  const normalizedRegistry = registryType.trim().toLowerCase();
  const methodMap = {
    job: 'setJobRegistry',
    jobs: 'setJobRegistry',
    job_registry: 'setJobRegistry',
    identity: 'setIdentityRegistry',
    identity_registry: 'setIdentityRegistry'
  };
  const method = methodMap[normalizedRegistry];
  if (!method) {
    throw new Error(`Unsupported registryType "${registryType}"`);
  }
  const to = getAddress(stakeManagerAddress);
  const target = getAddress(newAddress);
  const data = interfaces.StakeManager.encodeFunctionData(method, [target]);
  const current = currentAddress ? { registry: getAddress(currentAddress) } : null;
  const proposed = { registry: target };
  return {
    to,
    data,
    meta: createMetadata({
      contract: 'StakeManager',
      method,
      to,
      description: `Reassign ${method === 'setJobRegistry' ? 'JobRegistry' : 'IdentityRegistry'} contract`,
      args: { newRegistry: target },
      current,
      proposed
    })
  };
}

export function buildRoleShareTx({ rewardEngineAddress, role, shareBps, currentShareBps = null }) {
  if (!rewardEngineAddress) {
    throw new Error('rewardEngineAddress is required');
  }
  const share = normalizeShareBps(shareBps);
  const roleIdentifier = resolveRoleIdentifier(role);
  const to = getAddress(rewardEngineAddress);
  const data = interfaces.RewardEngine.encodeFunctionData('setRoleShare', [roleIdentifier, share]);
  const current =
    currentShareBps === null || currentShareBps === undefined
      ? null
      : { shareBps: normalizeShareBps(currentShareBps) };
  const proposed = { shareBps: share };
  return {
    to,
    data,
    role: roleIdentifier,
    shareBps: share,
    meta: createMetadata({
      contract: 'RewardEngine',
      method: 'setRoleShare',
      to,
      description: `Update ${role} share`,
      args: { role: roleIdentifier, shareBps: share },
      current,
      proposed
    })
  };
}

export function buildGlobalSharesTx({
  rewardEngineAddress,
  operatorShareBps,
  validatorShareBps,
  treasuryShareBps,
  currentShares = null
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
  const data = interfaces.RewardEngine.encodeFunctionData('setGlobalShares', [
    operatorShare,
    validatorShare,
    treasuryShare
  ]);
  const proposed = {
    operatorShare,
    validatorShare,
    treasuryShare
  };
  const current = currentShares
    ? {
        operatorShare: normalizeShareBps(currentShares.operatorShare),
        validatorShare: normalizeShareBps(currentShares.validatorShare),
        treasuryShare: normalizeShareBps(currentShares.treasuryShare)
      }
    : null;
  return {
    to,
    data,
    shares: proposed,
    meta: createMetadata({
      contract: 'RewardEngine',
      method: 'setGlobalShares',
      to,
      description: 'Update global share distribution',
      args: {
        operatorShareBps: operatorShare,
        validatorShareBps: validatorShare,
        treasuryShareBps: treasuryShare
      },
      current,
      proposed
    })
  };
}

export function buildJobRegistryUpgradeTx({
  jobRegistryAddress,
  module,
  newAddress,
  currentAddress = null
}) {
  if (!jobRegistryAddress) {
    throw new Error('jobRegistryAddress is required');
  }
  if (!module) {
    throw new Error('module is required');
  }
  if (!newAddress) {
    throw new Error('newAddress is required');
  }
  const normalizedModule = module.trim().toLowerCase();
  const methodMap = {
    validation: 'setValidationModule',
    reputation: 'setReputationModule',
    dispute: 'setDisputeModule'
  };
  const method = methodMap[normalizedModule];
  if (!method) {
    throw new Error(`Unsupported module "${module}"`);
  }
  const to = getAddress(jobRegistryAddress);
  const target = getAddress(newAddress);
  const data = interfaces.JobRegistry.encodeFunctionData(method, [target]);
  const current = currentAddress ? { module: getAddress(currentAddress) } : null;
  const proposed = { module: target };
  return {
    to,
    data,
    meta: createMetadata({
      contract: 'JobRegistry',
      method,
      to,
      description: `Upgrade ${normalizedModule} module`,
      args: { newModule: target },
      current,
      proposed
    })
  };
}

export function buildDisputeTriggerTx({ jobRegistryAddress, jobId, reason }) {
  if (!jobRegistryAddress) {
    throw new Error('jobRegistryAddress is required');
  }
  if (jobId === undefined || jobId === null) {
    throw new Error('jobId is required');
  }
  const to = getAddress(jobRegistryAddress);
  const numericJobId = BigInt(jobId);
  if (numericJobId < 0) {
    throw new Error('jobId must be non-negative');
  }
  const reasonHash = reason ? id(reason) : id('GENERIC_DISPUTE');
  const data = interfaces.JobRegistry.encodeFunctionData('triggerDispute', [numericJobId, reasonHash]);
  return {
    to,
    data,
    meta: createMetadata({
      contract: 'JobRegistry',
      method: 'triggerDispute',
      to,
      description: 'Trigger dispute escalation',
      args: { jobId: numericJobId.toString(), reasonHash },
      proposed: { jobId: numericJobId.toString(), reasonHash }
    })
  };
}

export function buildIdentityDelegateTx({ identityRegistryAddress, operatorAddress, allowed, current = null }) {
  if (!identityRegistryAddress) {
    throw new Error('identityRegistryAddress is required');
  }
  if (!operatorAddress) {
    throw new Error('operatorAddress is required');
  }
  const to = getAddress(identityRegistryAddress);
  const operator = getAddress(operatorAddress);
  const permitted = normalizeBoolean(allowed, 'allowed');
  const data = interfaces.IdentityRegistry.encodeFunctionData('setAdditionalNodeOperator', [operator, permitted]);
  const proposed = { operator, allowed: permitted };
  const currentState = current ? { operator: getAddress(current.operator), allowed: Boolean(current.allowed) } : null;
  return {
    to,
    data,
    meta: createMetadata({
      contract: 'IdentityRegistry',
      method: 'setAdditionalNodeOperator',
      to,
      description: `${permitted ? 'Authorize' : 'Revoke'} delegate operator`,
      args: { operator, allowed: permitted },
      current: currentState,
      proposed
    })
  };
}

export { resolveRoleIdentifier };

export function buildIncentivesStakeManagerTx({
  incentivesAddress,
  stakeManagerAddress,
  currentStakeManager = null
}) {
  if (!incentivesAddress) {
    throw new Error('incentivesAddress is required');
  }
  if (!stakeManagerAddress) {
    throw new Error('stakeManagerAddress is required');
  }
  const to = getAddress(incentivesAddress);
  const stakeManager = getAddress(stakeManagerAddress);
  const data = interfaces.PlatformIncentives.encodeFunctionData('setStakeManager', [stakeManager]);
  const current = currentStakeManager
    ? { stakeManager: getAddress(currentStakeManager) }
    : null;
  const proposed = { stakeManager };
  return {
    to,
    data,
    meta: createMetadata({
      contract: 'PlatformIncentives',
      method: 'setStakeManager',
      to,
      description: 'Reassign StakeManager contract for incentives orchestration',
      args: { newStakeManager: stakeManager },
      current,
      proposed
    })
  };
}

export function buildIncentivesMinimumStakeTx({
  incentivesAddress,
  amount,
  decimals = 18,
  currentMinimum = null
}) {
  if (!incentivesAddress) {
    throw new Error('incentivesAddress is required');
  }
  if (amount === undefined || amount === null) {
    throw new Error('amount is required');
  }
  if (decimals !== 18) {
    throw new Error('PlatformIncentives minimum stake must use 18 decimals');
  }
  const to = getAddress(incentivesAddress);
  const parsedAmount = parseUnits(String(amount), decimals);
  const data = interfaces.PlatformIncentives.encodeFunctionData('setMinimumStake', [parsedAmount]);
  const current =
    currentMinimum === null || currentMinimum === undefined
      ? null
      : { minimumStake: BigInt(currentMinimum) };
  const proposed = { minimumStake: parsedAmount };
  return {
    to,
    data,
    amount: parsedAmount,
    meta: createMetadata({
      contract: 'PlatformIncentives',
      method: 'setMinimumStake',
      to,
      description: 'Update PlatformIncentives minimum operator stake',
      args: { newMinimumStake: parsedAmount.toString() },
      current,
      proposed
    })
  };
}

export function buildIncentivesHeartbeatTx({
  incentivesAddress,
  graceSeconds,
  currentGraceSeconds = null
}) {
  if (!incentivesAddress) {
    throw new Error('incentivesAddress is required');
  }
  if (graceSeconds === undefined || graceSeconds === null) {
    throw new Error('graceSeconds is required');
  }
  const to = getAddress(incentivesAddress);
  const parsedGrace = BigInt(graceSeconds);
  if (parsedGrace < 0) {
    throw new Error('graceSeconds must be non-negative');
  }
  const data = interfaces.PlatformIncentives.encodeFunctionData('setHeartbeatGrace', [parsedGrace]);
  const current =
    currentGraceSeconds === null || currentGraceSeconds === undefined
      ? null
      : { graceSeconds: BigInt(currentGraceSeconds) };
  const proposed = { graceSeconds: parsedGrace };
  return {
    to,
    data,
    meta: createMetadata({
      contract: 'PlatformIncentives',
      method: 'setHeartbeatGrace',
      to,
      description: 'Adjust heartbeat grace window for operators',
      args: { newGraceSeconds: parsedGrace.toString() },
      current,
      proposed
    })
  };
}

export function buildIncentivesActivationFeeTx({
  incentivesAddress,
  feeAmount,
  decimals = 18,
  currentFee = null
}) {
  if (!incentivesAddress) {
    throw new Error('incentivesAddress is required');
  }
  if (feeAmount === undefined || feeAmount === null) {
    throw new Error('feeAmount is required');
  }
  if (decimals !== 18) {
    throw new Error('PlatformIncentives activation fee must use 18 decimals');
  }
  const to = getAddress(incentivesAddress);
  const parsedFee = parseUnits(String(feeAmount), decimals);
  const data = interfaces.PlatformIncentives.encodeFunctionData('setActivationFee', [parsedFee]);
  const current =
    currentFee === null || currentFee === undefined ? null : { activationFee: BigInt(currentFee) };
  const proposed = { activationFee: parsedFee };
  return {
    to,
    data,
    fee: parsedFee,
    meta: createMetadata({
      contract: 'PlatformIncentives',
      method: 'setActivationFee',
      to,
      description: 'Reprice activation fee for staking onboarding',
      args: { newActivationFee: parsedFee.toString() },
      current,
      proposed
    })
  };
}

export function buildIncentivesTreasuryTx({
  incentivesAddress,
  treasuryAddress,
  currentTreasury = null
}) {
  if (!incentivesAddress) {
    throw new Error('incentivesAddress is required');
  }
  if (!treasuryAddress) {
    throw new Error('treasuryAddress is required');
  }
  const to = getAddress(incentivesAddress);
  const treasury = getAddress(treasuryAddress);
  const data = interfaces.PlatformIncentives.encodeFunctionData('setTreasury', [treasury]);
  const current = currentTreasury ? { treasury: getAddress(currentTreasury) } : null;
  const proposed = { treasury };
  return {
    to,
    data,
    meta: createMetadata({
      contract: 'PlatformIncentives',
      method: 'setTreasury',
      to,
      description: 'Redirect treasury distribution address',
      args: { newTreasury: treasury },
      current,
      proposed
    })
  };
}
