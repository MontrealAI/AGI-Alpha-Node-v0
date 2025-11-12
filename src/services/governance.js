import { Interface, getAddress, id, parseUnits } from 'ethers';

const OWNER_ONLY_ABIS = {
  SystemPause: [
    'function pauseAll()',
    'function resumeAll()',
    'function unpauseAll()'
  ],
  NodeRegistry: [
    'function registerNode(bytes32 nodeId, address operator, string metadataURI)',
    'function setNodeMetadata(bytes32 nodeId, string metadataURI)',
    'function setNodeStatus(bytes32 nodeId, bool active)',
    'function setNodeOperator(address operator, bool allowed)',
    'function setWorkMeter(address newWorkMeter)'
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
  EmissionManager: [
    'function setEpochEmission(uint256 newEmissionPerEpoch)',
    'function setEpochLength(uint256 newEpochLength)',
    'function setEmissionCap(uint256 newEmissionCap)',
    'function setRewardRateMultiplier(uint256 numerator, uint256 denominator)'
  ],
  WorkMeter: [
    'function setValidator(address validator, bool allowed)',
    'function setOracle(address oracle, bool allowed)',
    'function setSubmissionWindow(uint256 windowSeconds)',
    'function setProductivityIndex(address newIndex)',
    'function submitUsage(bytes32 reportId, bytes32 nodeId, uint256 gpuSeconds, uint256 gflopsNorm, uint256 modelTier, uint256 sloPassBps, uint256 qualityBps, bytes32 usageHash)'
  ],
  ProductivityIndex: [
    'function recordEpoch(uint256 epoch, uint256 alphaWu, uint256 tokensEmitted, uint256 tokensBurned)',
    'function setEmissionManager(address newEmissionManager)',
    'function setWorkMeter(address newWorkMeter)',
    'function setTreasury(address newTreasury)'
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

const USAGE_DECIMALS = 6;

function normalizeMetadataUri(metadata) {
  if (metadata === undefined || metadata === null) {
    throw new Error('metadataURI is required');
  }
  const normalized = String(metadata).trim();
  if (!normalized) {
    throw new Error('metadataURI cannot be empty');
  }
  return normalized;
}

function normalizeNodeId(nodeId, { label = 'nodeId' } = {}) {
  if (nodeId === undefined || nodeId === null) {
    throw new Error(`${label} is required`);
  }
  if (nodeId instanceof Uint8Array) {
    if (nodeId.length !== 32) {
      throw new Error(`${label} Uint8Array must be 32 bytes`);
    }
    return `0x${Buffer.from(nodeId).toString('hex')}`;
  }
  if (typeof nodeId === 'string') {
    const trimmed = nodeId.trim();
    if (!trimmed) {
      throw new Error(`${label} cannot be empty`);
    }
    if (trimmed.startsWith('0x')) {
      if (trimmed.length !== 66) {
        throw new Error(`${label} must be a 32-byte hex value`);
      }
      return trimmed.toLowerCase();
    }
    return id(trimmed);
  }
  throw new Error(`${label} must be a hex string, utf-8 string, or 32-byte Uint8Array`);
}

function normalizeUsageMetric(value, field, decimals = USAGE_DECIMALS) {
  if (typeof value === 'bigint') {
    if (value < 0n) {
      throw new Error(`${field} must be non-negative`);
    }
    return value;
  }
  if (value === undefined || value === null) {
    throw new Error(`${field} is required`);
  }
  const stringified = typeof value === 'string' ? value.trim() : String(value);
  if (!stringified) {
    throw new Error(`${field} cannot be empty`);
  }
  try {
    const parsed = parseUnits(stringified, decimals);
    if (parsed < 0n) {
      throw new Error(`${field} must be non-negative`);
    }
    return parsed;
  } catch (error) {
    throw new Error(`${field} must be numeric with up to ${decimals} decimals: ${error.message}`);
  }
}

function normalizeBasisPointsFraction(value, field) {
  if (value === undefined || value === null) {
    throw new Error(`${field} is required`);
  }
  const numeric = Number.parseFloat(String(value));
  if (!Number.isFinite(numeric)) {
    throw new Error(`${field} must be a finite number between 0 and 1`);
  }
  if (numeric < 0 || numeric > 1) {
    throw new Error(`${field} must be between 0 and 1`);
  }
  return BigInt(Math.round(numeric * 10_000));
}

function normalizeUsageHash(usageHash, context) {
  if (usageHash === undefined || usageHash === null || usageHash === 'auto') {
    const serialized = JSON.stringify(serializeBigints(context));
    return id(serialized);
  }
  if (typeof usageHash === 'string') {
    const trimmed = usageHash.trim();
    if (!trimmed) {
      return normalizeUsageHash('auto', context);
    }
    if (!trimmed.startsWith('0x')) {
      throw new Error('usageHash must be a 32-byte hex string');
    }
    if (trimmed.length !== 66) {
      throw new Error('usageHash must be a 32-byte hex string');
    }
    return trimmed.toLowerCase();
  }
  if (usageHash instanceof Uint8Array) {
    if (usageHash.length !== 32) {
      throw new Error('usageHash Uint8Array must be 32 bytes long');
    }
    return `0x${Buffer.from(usageHash).toString('hex')}`;
  }
  throw new Error('usageHash must be a 32-byte hex string or Uint8Array');
}

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

function normalizeUint(value, field) {
  if (value === null || value === undefined) {
    throw new Error(`${field} is required`);
  }
  let numeric;
  try {
    numeric = BigInt(value);
  } catch (error) {
    throw new Error(`${field} must be coercible to a uint256`);
  }
  if (numeric < 0n) {
    throw new Error(`${field} must be non-negative`);
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

export function buildNodeRegistrationTx({
  nodeRegistryAddress,
  nodeId,
  operatorAddress,
  metadataURI
}) {
  if (!nodeRegistryAddress) {
    throw new Error('nodeRegistryAddress is required');
  }
  if (!operatorAddress) {
    throw new Error('operatorAddress is required');
  }
  const to = getAddress(nodeRegistryAddress);
  const nodeIdentifier = normalizeNodeId(nodeId);
  const operator = getAddress(operatorAddress);
  const metadata = normalizeMetadataUri(metadataURI);
  const data = interfaces.NodeRegistry.encodeFunctionData('registerNode', [
    nodeIdentifier,
    operator,
    metadata
  ]);
  const proposed = {
    nodeId: nodeIdentifier,
    operator,
    metadataURI: metadata
  };
  return {
    to,
    data,
    nodeId: nodeIdentifier,
    operator,
    metadataURI: metadata,
    meta: createMetadata({
      contract: 'NodeRegistry',
      method: 'registerNode',
      to,
      description: 'Register node identity and assign operator custody',
      args: proposed,
      proposed
    })
  };
}

export function buildNodeMetadataTx({
  nodeRegistryAddress,
  nodeId,
  metadataURI,
  currentMetadataURI = null
}) {
  if (!nodeRegistryAddress) {
    throw new Error('nodeRegistryAddress is required');
  }
  const to = getAddress(nodeRegistryAddress);
  const nodeIdentifier = normalizeNodeId(nodeId);
  const metadata = normalizeMetadataUri(metadataURI);
  const data = interfaces.NodeRegistry.encodeFunctionData('setNodeMetadata', [
    nodeIdentifier,
    metadata
  ]);
  const proposed = { metadataURI: metadata };
  const current =
    currentMetadataURI === null || currentMetadataURI === undefined
      ? null
      : { metadataURI: String(currentMetadataURI) };
  return {
    to,
    data,
    nodeId: nodeIdentifier,
    metadataURI: metadata,
    meta: createMetadata({
      contract: 'NodeRegistry',
      method: 'setNodeMetadata',
      to,
      description: 'Refresh node metadata reference (URI, IPFS, etc.)',
      args: { nodeId: nodeIdentifier, metadataURI: metadata },
      current,
      proposed
    })
  };
}

export function buildNodeStatusTx({
  nodeRegistryAddress,
  nodeId,
  active,
  currentStatus = null
}) {
  if (!nodeRegistryAddress) {
    throw new Error('nodeRegistryAddress is required');
  }
  if (active === undefined || active === null) {
    throw new Error('active flag is required');
  }
  const to = getAddress(nodeRegistryAddress);
  const nodeIdentifier = normalizeNodeId(nodeId);
  const isActive = normalizeBoolean(active, 'active');
  const data = interfaces.NodeRegistry.encodeFunctionData('setNodeStatus', [
    nodeIdentifier,
    isActive
  ]);
  const proposed = { active: isActive };
  const current =
    currentStatus === null || currentStatus === undefined
      ? null
      : { active: normalizeBoolean(currentStatus, 'currentStatus') };
  return {
    to,
    data,
    nodeId: nodeIdentifier,
    active: isActive,
    meta: createMetadata({
      contract: 'NodeRegistry',
      method: 'setNodeStatus',
      to,
      description: 'Toggle node availability within registry',
      args: { nodeId: nodeIdentifier, active: isActive },
      current,
      proposed
    })
  };
}

export function buildNodeOperatorTx({
  nodeRegistryAddress,
  operatorAddress,
  allowed,
  currentAllowed = null
}) {
  if (!nodeRegistryAddress) {
    throw new Error('nodeRegistryAddress is required');
  }
  if (!operatorAddress) {
    throw new Error('operatorAddress is required');
  }
  if (allowed === undefined || allowed === null) {
    throw new Error('allowed flag is required');
  }
  const to = getAddress(nodeRegistryAddress);
  const operator = getAddress(operatorAddress);
  const isAllowed = normalizeBoolean(allowed, 'allowed');
  const data = interfaces.NodeRegistry.encodeFunctionData('setNodeOperator', [
    operator,
    isAllowed
  ]);
  const proposed = { operator, allowed: isAllowed };
  const current =
    currentAllowed === null || currentAllowed === undefined
      ? null
      : { allowed: normalizeBoolean(currentAllowed, 'currentAllowed') };
  return {
    to,
    data,
    operator,
    allowed: isAllowed,
    meta: createMetadata({
      contract: 'NodeRegistry',
      method: 'setNodeOperator',
      to,
      description: 'Authorize or revoke node operator authority',
      args: proposed,
      current,
      proposed
    })
  };
}

export function buildNodeWorkMeterTx({
  nodeRegistryAddress,
  workMeterAddress,
  currentWorkMeter = null
}) {
  if (!nodeRegistryAddress) {
    throw new Error('nodeRegistryAddress is required');
  }
  if (!workMeterAddress) {
    throw new Error('workMeterAddress is required');
  }
  const to = getAddress(nodeRegistryAddress);
  const workMeter = getAddress(workMeterAddress);
  const data = interfaces.NodeRegistry.encodeFunctionData('setWorkMeter', [workMeter]);
  const proposed = { workMeter };
  const current = currentWorkMeter ? { workMeter: getAddress(currentWorkMeter) } : null;
  return {
    to,
    data,
    workMeter,
    meta: createMetadata({
      contract: 'NodeRegistry',
      method: 'setWorkMeter',
      to,
      description: 'Bind registry to WorkMeter contract',
      args: { newWorkMeter: workMeter },
      current,
      proposed
    })
  };
}

export function buildWorkMeterValidatorTx({
  workMeterAddress,
  validatorAddress,
  allowed,
  currentAllowed = null
}) {
  if (!workMeterAddress) {
    throw new Error('workMeterAddress is required');
  }
  if (!validatorAddress) {
    throw new Error('validatorAddress is required');
  }
  if (allowed === undefined || allowed === null) {
    throw new Error('allowed flag is required');
  }
  const to = getAddress(workMeterAddress);
  const validator = getAddress(validatorAddress);
  const isAllowed = normalizeBoolean(allowed, 'allowed');
  const data = interfaces.WorkMeter.encodeFunctionData('setValidator', [validator, isAllowed]);
  const proposed = { validator, allowed: isAllowed };
  const current =
    currentAllowed === null || currentAllowed === undefined
      ? null
      : { allowed: normalizeBoolean(currentAllowed, 'currentAllowed') };
  return {
    to,
    data,
    validator,
    allowed: isAllowed,
    meta: createMetadata({
      contract: 'WorkMeter',
      method: 'setValidator',
      to,
      description: 'Enable or disable WorkMeter validator',
      args: proposed,
      current,
      proposed
    })
  };
}

export function buildWorkMeterOracleTx({
  workMeterAddress,
  oracleAddress,
  allowed,
  currentAllowed = null
}) {
  if (!workMeterAddress) {
    throw new Error('workMeterAddress is required');
  }
  if (!oracleAddress) {
    throw new Error('oracleAddress is required');
  }
  if (allowed === undefined || allowed === null) {
    throw new Error('allowed flag is required');
  }
  const to = getAddress(workMeterAddress);
  const oracle = getAddress(oracleAddress);
  const isAllowed = normalizeBoolean(allowed, 'allowed');
  const data = interfaces.WorkMeter.encodeFunctionData('setOracle', [oracle, isAllowed]);
  const proposed = { oracle, allowed: isAllowed };
  const current =
    currentAllowed === null || currentAllowed === undefined
      ? null
      : { allowed: normalizeBoolean(currentAllowed, 'currentAllowed') };
  return {
    to,
    data,
    oracle,
    allowed: isAllowed,
    meta: createMetadata({
      contract: 'WorkMeter',
      method: 'setOracle',
      to,
      description: 'Authorize WorkMeter oracle signer',
      args: proposed,
      current,
      proposed
    })
  };
}

export function buildWorkMeterWindowTx({
  workMeterAddress,
  submissionWindowSeconds,
  currentWindowSeconds = null
}) {
  if (!workMeterAddress) {
    throw new Error('workMeterAddress is required');
  }
  const to = getAddress(workMeterAddress);
  const windowSeconds = normalizeUint(submissionWindowSeconds, 'submissionWindowSeconds');
  if (windowSeconds <= 0n) {
    throw new Error('submissionWindowSeconds must be greater than zero');
  }
  const data = interfaces.WorkMeter.encodeFunctionData('setSubmissionWindow', [windowSeconds]);
  const proposed = { submissionWindowSeconds: windowSeconds };
  const current =
    currentWindowSeconds === null || currentWindowSeconds === undefined
      ? null
      : { submissionWindowSeconds: normalizeUint(currentWindowSeconds, 'currentWindowSeconds') };
  return {
    to,
    data,
    submissionWindowSeconds: windowSeconds,
    meta: createMetadata({
      contract: 'WorkMeter',
      method: 'setSubmissionWindow',
      to,
      description: 'Retune WorkMeter submission window duration',
      args: { windowSeconds: windowSeconds.toString() },
      current,
      proposed
    })
  };
}

export function buildWorkMeterProductivityIndexTx({
  workMeterAddress,
  productivityIndexAddress,
  currentProductivityIndex = null
}) {
  if (!workMeterAddress) {
    throw new Error('workMeterAddress is required');
  }
  if (!productivityIndexAddress) {
    throw new Error('productivityIndexAddress is required');
  }
  const to = getAddress(workMeterAddress);
  const indexAddress = getAddress(productivityIndexAddress);
  const data = interfaces.WorkMeter.encodeFunctionData('setProductivityIndex', [indexAddress]);
  const proposed = { productivityIndex: indexAddress };
  const current =
    currentProductivityIndex
      ? { productivityIndex: getAddress(currentProductivityIndex) }
      : null;
  return {
    to,
    data,
    productivityIndex: indexAddress,
    meta: createMetadata({
      contract: 'WorkMeter',
      method: 'setProductivityIndex',
      to,
      description: 'Wire WorkMeter to ProductivityIndex aggregator',
      args: { newIndex: indexAddress },
      current,
      proposed
    })
  };
}

export function buildWorkMeterUsageTx({
  workMeterAddress,
  reportId,
  nodeId,
  gpuSeconds,
  gflopsNorm,
  modelTier,
  sloPass,
  quality,
  usageHash,
  metricDecimals = USAGE_DECIMALS
}) {
  if (!workMeterAddress) {
    throw new Error('workMeterAddress is required');
  }
  const to = getAddress(workMeterAddress);
  const reportIdentifier = normalizeNodeId(reportId, { label: 'reportId' });
  const nodeIdentifier = normalizeNodeId(nodeId);
  const gpu = normalizeUsageMetric(gpuSeconds, 'gpuSeconds', metricDecimals);
  const gflops = normalizeUsageMetric(gflopsNorm, 'gflopsNorm', metricDecimals);
  const tier = normalizeUsageMetric(modelTier, 'modelTier', metricDecimals);
  const slo = normalizeBasisPointsFraction(sloPass, 'sloPass');
  const qualityBps = normalizeBasisPointsFraction(quality, 'quality');
  const usageContext = {
    reportId: reportIdentifier,
    nodeId: nodeIdentifier,
    gpu,
    gflops,
    tier,
    slo,
    quality: qualityBps
  };
  const usageDigest = normalizeUsageHash(usageHash, usageContext);
  const data = interfaces.WorkMeter.encodeFunctionData('submitUsage', [
    reportIdentifier,
    nodeIdentifier,
    gpu,
    gflops,
    tier,
    slo,
    qualityBps,
    usageDigest
  ]);
  const proposed = {
    reportId: reportIdentifier,
    nodeId: nodeIdentifier,
    gpuSeconds: gpu,
    gflopsNorm: gflops,
    modelTier: tier,
    sloPassBps: slo,
    qualityBps,
    usageHash: usageDigest,
    metricDecimals
  };
  return {
    to,
    data,
    meta: createMetadata({
      contract: 'WorkMeter',
      method: 'submitUsage',
      to,
      description: 'Submit normalized α-WU usage report',
      args: serializeBigints(proposed),
      proposed
    })
  };
}

export function buildProductivityRecordTx({
  productivityIndexAddress,
  epoch,
  alphaWu,
  tokensEmitted = 0,
  tokensBurned = 0,
  decimals = 18
}) {
  if (!productivityIndexAddress) {
    throw new Error('productivityIndexAddress is required');
  }
  if (epoch === undefined || epoch === null) {
    throw new Error('epoch is required');
  }
  const to = getAddress(productivityIndexAddress);
  const epochValue = normalizeUint(epoch, 'epoch');
  const alpha = parseUnits(String(alphaWu), decimals);
  const emitted = parseUnits(String(tokensEmitted), decimals);
  const burned = parseUnits(String(tokensBurned), decimals);
  const data = interfaces.ProductivityIndex.encodeFunctionData('recordEpoch', [
    epochValue,
    alpha,
    emitted,
    burned
  ]);
  const proposed = {
    epoch: epochValue,
    alphaWu: alpha,
    tokensEmitted: emitted,
    tokensBurned: burned,
    decimals
  };
  return {
    to,
    data,
    meta: createMetadata({
      contract: 'ProductivityIndex',
      method: 'recordEpoch',
      to,
      description: 'Record validated epoch productivity and token flow',
      args: serializeBigints(proposed),
      proposed
    })
  };
}

export function buildProductivityEmissionManagerTx({
  productivityIndexAddress,
  emissionManagerAddress,
  currentEmissionManager = null
}) {
  if (!productivityIndexAddress) {
    throw new Error('productivityIndexAddress is required');
  }
  if (!emissionManagerAddress) {
    throw new Error('emissionManagerAddress is required');
  }
  const to = getAddress(productivityIndexAddress);
  const emissionManager = getAddress(emissionManagerAddress);
  const data = interfaces.ProductivityIndex.encodeFunctionData('setEmissionManager', [emissionManager]);
  const proposed = { emissionManager };
  const current = currentEmissionManager ? { emissionManager: getAddress(currentEmissionManager) } : null;
  return {
    to,
    data,
    emissionManager,
    meta: createMetadata({
      contract: 'ProductivityIndex',
      method: 'setEmissionManager',
      to,
      description: 'Attach emission manager to productivity index',
      args: { newEmissionManager: emissionManager },
      current,
      proposed
    })
  };
}

export function buildProductivityWorkMeterTx({
  productivityIndexAddress,
  workMeterAddress,
  currentWorkMeter = null
}) {
  if (!productivityIndexAddress) {
    throw new Error('productivityIndexAddress is required');
  }
  if (!workMeterAddress) {
    throw new Error('workMeterAddress is required');
  }
  const to = getAddress(productivityIndexAddress);
  const workMeter = getAddress(workMeterAddress);
  const data = interfaces.ProductivityIndex.encodeFunctionData('setWorkMeter', [workMeter]);
  const proposed = { workMeter };
  const current = currentWorkMeter ? { workMeter: getAddress(currentWorkMeter) } : null;
  return {
    to,
    data,
    workMeter,
    meta: createMetadata({
      contract: 'ProductivityIndex',
      method: 'setWorkMeter',
      to,
      description: 'Bind productivity index to WorkMeter pipeline',
      args: { newWorkMeter: workMeter },
      current,
      proposed
    })
  };
}

export function buildProductivityTreasuryTx({
  productivityIndexAddress,
  treasuryAddress,
  currentTreasury = null
}) {
  if (!productivityIndexAddress) {
    throw new Error('productivityIndexAddress is required');
  }
  if (!treasuryAddress) {
    throw new Error('treasuryAddress is required');
  }
  const to = getAddress(productivityIndexAddress);
  const treasury = getAddress(treasuryAddress);
  const data = interfaces.ProductivityIndex.encodeFunctionData('setTreasury', [treasury]);
  const proposed = { treasury };
  const current = currentTreasury ? { treasury: getAddress(currentTreasury) } : null;
  return {
    to,
    data,
    treasury,
    meta: createMetadata({
      contract: 'ProductivityIndex',
      method: 'setTreasury',
      to,
      description: 'Redirect productivity index treasury sink',
      args: { newTreasury: treasury },
      current,
      proposed
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

export function buildEmissionPerEpochTx({
  emissionManagerAddress,
  emissionPerEpoch,
  decimals = 18,
  currentEmissionPerEpoch = null
}) {
  if (!emissionManagerAddress) {
    throw new Error('emissionManagerAddress is required');
  }
  if (decimals !== 18) {
    throw new Error('EmissionManager uses 18 decimal precision for epoch emissions');
  }
  const to = getAddress(emissionManagerAddress);
  const parsedEmission = parseUnits(String(emissionPerEpoch), decimals);
  const current =
    currentEmissionPerEpoch === null || currentEmissionPerEpoch === undefined
      ? null
      : { emissionPerEpoch: BigInt(currentEmissionPerEpoch) };
  const proposed = { emissionPerEpoch: parsedEmission };
  const data = interfaces.EmissionManager.encodeFunctionData('setEpochEmission', [parsedEmission]);
  return {
    to,
    data,
    emissionPerEpoch: parsedEmission,
    meta: createMetadata({
      contract: 'EmissionManager',
      method: 'setEpochEmission',
      to,
      description: 'Update base emission released each epoch',
      args: { newEmissionPerEpoch: parsedEmission.toString() },
      current,
      proposed
    })
  };
}

export function buildEmissionEpochLengthTx({
  emissionManagerAddress,
  epochLengthSeconds,
  currentEpochLengthSeconds = null
}) {
  if (!emissionManagerAddress) {
    throw new Error('emissionManagerAddress is required');
  }
  const to = getAddress(emissionManagerAddress);
  const normalizedLength = normalizeUint(epochLengthSeconds, 'epochLengthSeconds');
  if (normalizedLength === 0n) {
    throw new Error('epochLengthSeconds must be greater than zero');
  }
  const current =
    currentEpochLengthSeconds === null || currentEpochLengthSeconds === undefined
      ? null
      : { epochLengthSeconds: normalizeUint(currentEpochLengthSeconds, 'currentEpochLengthSeconds') };
  const proposed = { epochLengthSeconds: normalizedLength };
  const data = interfaces.EmissionManager.encodeFunctionData('setEpochLength', [normalizedLength]);
  return {
    to,
    data,
    epochLengthSeconds: normalizedLength,
    meta: createMetadata({
      contract: 'EmissionManager',
      method: 'setEpochLength',
      to,
      description: 'Re-time emission epoch length in seconds',
      args: { newEpochLength: normalizedLength.toString() },
      current,
      proposed
    })
  };
}

export function buildEmissionCapTx({
  emissionManagerAddress,
  emissionCap,
  decimals = 18,
  currentEmissionCap = null
}) {
  if (!emissionManagerAddress) {
    throw new Error('emissionManagerAddress is required');
  }
  if (decimals !== 18) {
    throw new Error('EmissionManager cap uses canonical 18 decimals');
  }
  const to = getAddress(emissionManagerAddress);
  const parsedCap = parseUnits(String(emissionCap), decimals);
  const current =
    currentEmissionCap === null || currentEmissionCap === undefined
      ? null
      : { emissionCap: BigInt(currentEmissionCap) };
  const proposed = { emissionCap: parsedCap };
  const data = interfaces.EmissionManager.encodeFunctionData('setEmissionCap', [parsedCap]);
  return {
    to,
    data,
    emissionCap: parsedCap,
    meta: createMetadata({
      contract: 'EmissionManager',
      method: 'setEmissionCap',
      to,
      description: 'Define maximum cumulative emissions',
      args: { newEmissionCap: parsedCap.toString() },
      current,
      proposed
    })
  };
}

export function buildEmissionRateMultiplierTx({
  emissionManagerAddress,
  numerator,
  denominator,
  currentMultiplier = null
}) {
  if (!emissionManagerAddress) {
    throw new Error('emissionManagerAddress is required');
  }
  const to = getAddress(emissionManagerAddress);
  const normalizedNumerator = normalizeUint(numerator, 'numerator');
  const normalizedDenominator = normalizeUint(denominator, 'denominator');
  if (normalizedDenominator === 0n) {
    throw new Error('denominator must be greater than zero');
  }
  const current = currentMultiplier
    ? {
        numerator: normalizeUint(currentMultiplier.numerator, 'currentMultiplier.numerator'),
        denominator: normalizeUint(currentMultiplier.denominator, 'currentMultiplier.denominator')
      }
    : null;
  const proposed = {
    numerator: normalizedNumerator,
    denominator: normalizedDenominator
  };
  const data = interfaces.EmissionManager.encodeFunctionData('setRewardRateMultiplier', [
    normalizedNumerator,
    normalizedDenominator
  ]);
  return {
    to,
    data,
    multiplier: proposed,
    meta: createMetadata({
      contract: 'EmissionManager',
      method: 'setRewardRateMultiplier',
      to,
      description: 'Adjust emission reward rate multiplier',
      args: {
        numerator: normalizedNumerator.toString(),
        denominator: normalizedDenominator.toString()
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
