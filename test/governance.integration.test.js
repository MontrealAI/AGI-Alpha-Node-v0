import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { JsonRpcProvider, Wallet, ContractFactory } from 'ethers';
import {
  buildSystemPauseTx,
  buildMinimumStakeTx,
  buildValidatorThresholdTx,
  buildStakeRegistryUpgradeTx,
  buildRoleShareTx,
  buildGlobalSharesTx,
  buildJobRegistryUpgradeTx,
  buildDisputeTriggerTx,
  buildIdentityDelegateTx,
  buildNodeRegistrationTx,
  buildNodeMetadataTx,
  buildNodeStatusTx,
  buildNodeOperatorTx,
  buildNodeWorkMeterTx,
  buildWorkMeterValidatorTx,
  buildWorkMeterOracleTx,
  buildWorkMeterWindowTx,
  buildWorkMeterProductivityIndexTx,
  buildWorkMeterUsageTx,
  buildProductivityRecordTx,
  buildProductivityEmissionManagerTx,
  buildProductivityWorkMeterTx,
  buildProductivityTreasuryTx
} from '../src/services/governance.js';

const ANVIL_PORT = 8547;
const ANVIL_URL = `http://127.0.0.1:${ANVIL_PORT}`;
const OWNER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

let anvilProcess = null;
let provider = null;
let owner = null;
let deployments = {};
const anvilCheck = spawnSync('anvil', ['--version']);
const anvilAvailable = !anvilCheck.error;

let solc;
let solcAvailable = true;
try {
  const solcModule = await import('solc');
  solc = solcModule.default ?? solcModule;
} catch (error) {
  solcAvailable = false;
}

const SOURCE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Ownable {
    address public owner;
    constructor() { owner = msg.sender; }
    modifier onlyOwner() { require(msg.sender == owner, "only owner"); _; }
}

contract MockSystemPause is Ownable {
    bool public paused;
    function pauseAll() external onlyOwner { paused = true; }
    function resumeAll() external onlyOwner { paused = false; }
    function unpauseAll() external onlyOwner { paused = false; }
}

contract MockStakeManager is Ownable {
    uint256 public minimumStake;
    uint256 public validatorThreshold;
    address public jobRegistry;
    address public identityRegistry;
    function setMinimumStake(uint256 newMinimum) external onlyOwner { minimumStake = newMinimum; }
    function setValidatorThreshold(uint256 newThreshold) external onlyOwner { validatorThreshold = newThreshold; }
    function setJobRegistry(address newRegistry) external onlyOwner { jobRegistry = newRegistry; }
    function setIdentityRegistry(address newRegistry) external onlyOwner { identityRegistry = newRegistry; }
}

contract MockRewardEngine is Ownable {
    mapping(bytes32 => uint16) public roleShares;
    uint16 public operatorShare;
    uint16 public validatorShare;
    uint16 public treasuryShare;
    function setRoleShare(bytes32 role, uint16 shareBps) external onlyOwner { roleShares[role] = shareBps; }
    function setGlobalShares(uint16 operatorShareBps, uint16 validatorShareBps, uint16 treasuryShareBps) external onlyOwner {
        require(uint256(operatorShareBps) + validatorShareBps + treasuryShareBps == 10000, "invalid total");
        operatorShare = operatorShareBps;
        validatorShare = validatorShareBps;
        treasuryShare = treasuryShareBps;
    }
}

contract MockJobRegistry is Ownable {
    address public validationModule;
    address public reputationModule;
    address public disputeModule;
    uint256 public disputeCount;
    bytes32 public lastDisputeReason;
    function setValidationModule(address module_) external onlyOwner { validationModule = module_; }
    function setReputationModule(address module_) external onlyOwner { reputationModule = module_; }
    function setDisputeModule(address module_) external onlyOwner { disputeModule = module_; }
    function triggerDispute(uint256, bytes32 reason) external onlyOwner {
        disputeCount += 1;
        lastDisputeReason = reason;
    }
}

contract MockIdentityRegistry is Ownable {
    mapping(address => bool) public delegates;
    function setAdditionalNodeOperator(address operator, bool allowed) external onlyOwner {
        delegates[operator] = allowed;
    }
}

contract MockNodeRegistry is Ownable {
    mapping(bytes32 => string) public metadata;
    mapping(bytes32 => bool) public active;
    mapping(address => bool) public operators;
    address public workMeter;

    function registerNode(bytes32 nodeId, address operator, string calldata metadataURI) external onlyOwner {
        metadata[nodeId] = metadataURI;
        active[nodeId] = true;
        operators[operator] = true;
    }

    function setNodeMetadata(bytes32 nodeId, string calldata metadataURI) external onlyOwner {
        metadata[nodeId] = metadataURI;
    }

    function setNodeStatus(bytes32 nodeId, bool isActive) external onlyOwner {
        active[nodeId] = isActive;
    }

    function setNodeOperator(address operator, bool allowed) external onlyOwner {
        operators[operator] = allowed;
    }

    function setWorkMeter(address newWorkMeter) external onlyOwner {
        workMeter = newWorkMeter;
    }
}

contract MockWorkMeter is Ownable {
    struct UsageReport {
        bytes32 reportId;
        bytes32 nodeId;
        uint256 gpuSeconds;
        uint256 gflopsNorm;
        uint256 modelTier;
        uint256 sloPassBps;
        uint256 qualityBps;
        bytes32 usageHash;
    }

    mapping(address => bool) public validators;
    mapping(address => bool) public oracles;
    uint256 public submissionWindow;
    address public productivityIndex;
    UsageReport public lastReport;

    function setValidator(address validator, bool allowed) external onlyOwner {
        validators[validator] = allowed;
    }

    function setOracle(address oracle, bool allowed) external onlyOwner {
        oracles[oracle] = allowed;
    }

    function setSubmissionWindow(uint256 windowSeconds) external onlyOwner {
        submissionWindow = windowSeconds;
    }

    function setProductivityIndex(address index) external onlyOwner {
        productivityIndex = index;
    }

    function submitUsage(
        bytes32 reportId,
        bytes32 nodeId,
        uint256 gpuSeconds,
        uint256 gflopsNorm,
        uint256 modelTier,
        uint256 sloPassBps,
        uint256 qualityBps,
        bytes32 usageHash
    ) external {
        lastReport = UsageReport(reportId, nodeId, gpuSeconds, gflopsNorm, modelTier, sloPassBps, qualityBps, usageHash);
    }
}

contract MockProductivityIndex is Ownable {
    struct EpochEntry {
        uint256 epoch;
        uint256 alphaWu;
        uint256 tokensEmitted;
        uint256 tokensBurned;
    }

    mapping(uint256 => EpochEntry) public epochs;
    address public emissionManager;
    address public workMeter;
    address public treasury;

    function recordEpoch(uint256 epoch, uint256 alphaWu, uint256 tokensEmitted, uint256 tokensBurned) external onlyOwner {
        epochs[epoch] = EpochEntry(epoch, alphaWu, tokensEmitted, tokensBurned);
    }

    function setEmissionManager(address newEmissionManager) external onlyOwner {
        emissionManager = newEmissionManager;
    }

    function setWorkMeter(address newWorkMeter) external onlyOwner {
        workMeter = newWorkMeter;
    }

    function setTreasury(address newTreasury) external onlyOwner {
        treasury = newTreasury;
    }
}
`;

function compileContracts() {
  if (!solcAvailable) {
    throw new Error('solc compiler not available');
  }
  const input = {
      language: 'Solidity',
      sources: {
        'Mock.sol': {
          content: SOURCE
        }
      },
      settings: {
        outputSelection: {
          '*': {
            '*': ['abi', 'evm.bytecode.object']
          }
        }
      }
    };
    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    if (output.errors) {
      const severity = output.errors.find((error) => error.severity === 'error');
      if (severity) {
        throw new Error(severity.formattedMessage || severity.message);
      }
    }
    return output.contracts['Mock.sol'];
}

async function deployContract(name, artifact) {
  const factory = new ContractFactory(artifact.abi, artifact.evm.bytecode.object, owner);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  deployments[name] = contract;
  return contract;
}

async function waitForAnvil() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await provider.getBlockNumber();
      return;
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error('Failed to connect to Anvil');
}

beforeAll(async () => {
  if (!anvilAvailable || !solcAvailable) {
    return;
  }
  anvilProcess = spawn('anvil', ['--port', String(ANVIL_PORT), '--silent']);
  anvilProcess.stderr?.on('data', () => {});
  provider = new JsonRpcProvider(ANVIL_URL);
  await waitForAnvil();
  owner = new Wallet(OWNER_KEY, provider);
  const compiled = compileContracts();
  await deployContract('SystemPause', compiled.MockSystemPause);
  await deployContract('StakeManager', compiled.MockStakeManager);
  await deployContract('RewardEngine', compiled.MockRewardEngine);
  await deployContract('JobRegistry', compiled.MockJobRegistry);
  await deployContract('IdentityRegistry', compiled.MockIdentityRegistry);
  await deployContract('NodeRegistry', compiled.MockNodeRegistry);
  await deployContract('WorkMeter', compiled.MockWorkMeter);
  await deployContract('ProductivityIndex', compiled.MockProductivityIndex);
});

afterAll(async () => {
  if (!anvilAvailable || !solcAvailable) {
    return;
  }
  if (anvilProcess) {
    anvilProcess.kill('SIGKILL');
    await once(anvilProcess, 'exit');
    anvilProcess = null;
  }
});

const describeCase = anvilAvailable && solcAvailable ? describe : describe.skip;

describeCase('governance builders integration', () => {
  const testCase = anvilAvailable && solcAvailable ? it : it.skip;
  testCase('executes owner-only builders against anvil contracts', async () => {
    const systemPauseAddress = await deployments.SystemPause.getAddress();
    const stakeManagerAddress = await deployments.StakeManager.getAddress();
    const rewardEngineAddress = await deployments.RewardEngine.getAddress();
    const jobRegistryAddress = await deployments.JobRegistry.getAddress();
    const identityRegistryAddress = await deployments.IdentityRegistry.getAddress();
    const nodeRegistryAddress = await deployments.NodeRegistry.getAddress();
    const workMeterAddress = await deployments.WorkMeter.getAddress();
    const productivityIndexAddress = await deployments.ProductivityIndex.getAddress();

    const pauseTx = buildSystemPauseTx({ systemPauseAddress });
    await owner.sendTransaction({ to: pauseTx.to, data: pauseTx.data });
    expect(await deployments.SystemPause.paused()).toBe(true);

    const resumeTx = buildSystemPauseTx({ systemPauseAddress, action: 'resume' });
    await owner.sendTransaction({ to: resumeTx.to, data: resumeTx.data });
    expect(await deployments.SystemPause.paused()).toBe(false);

    const minimumStakeTx = buildMinimumStakeTx({ stakeManagerAddress, amount: '123.456' });
    await owner.sendTransaction({ to: minimumStakeTx.to, data: minimumStakeTx.data });
    expect(await deployments.StakeManager.minimumStake()).toBe(minimumStakeTx.amount);

    const validatorTx = buildValidatorThresholdTx({ stakeManagerAddress, threshold: 9 });
    await owner.sendTransaction({ to: validatorTx.to, data: validatorTx.data });
    expect(await deployments.StakeManager.validatorThreshold()).toBe(9n);

    const registryUpgradeTx = buildStakeRegistryUpgradeTx({
      stakeManagerAddress,
      registryType: 'job',
      newAddress: jobRegistryAddress
    });
    await owner.sendTransaction({ to: registryUpgradeTx.to, data: registryUpgradeTx.data });
    expect(await deployments.StakeManager.jobRegistry()).toBe(jobRegistryAddress);

    const identityUpgradeTx = buildStakeRegistryUpgradeTx({
      stakeManagerAddress,
      registryType: 'identity',
      newAddress: identityRegistryAddress
    });
    await owner.sendTransaction({ to: identityUpgradeTx.to, data: identityUpgradeTx.data });
    expect(await deployments.StakeManager.identityRegistry()).toBe(identityRegistryAddress);

    const roleShareTx = buildRoleShareTx({
      rewardEngineAddress,
      role: 'validator',
      shareBps: 2500
    });
    await owner.sendTransaction({ to: roleShareTx.to, data: roleShareTx.data });
    expect(await deployments.RewardEngine.roleShares(roleShareTx.role)).toBe(2500);

    const globalSharesTx = buildGlobalSharesTx({
      rewardEngineAddress,
      operatorShareBps: 5000,
      validatorShareBps: 3000,
      treasuryShareBps: 2000
    });
    await owner.sendTransaction({ to: globalSharesTx.to, data: globalSharesTx.data });
    expect(await deployments.RewardEngine.operatorShare()).toBe(5000);
    expect(await deployments.RewardEngine.validatorShare()).toBe(3000);
    expect(await deployments.RewardEngine.treasuryShare()).toBe(2000);

    const moduleTx = buildJobRegistryUpgradeTx({
      jobRegistryAddress,
      module: 'validation',
      newAddress: stakeManagerAddress
    });
    await owner.sendTransaction({ to: moduleTx.to, data: moduleTx.data });
    expect(await deployments.JobRegistry.validationModule()).toBe(stakeManagerAddress);

    const disputeTx = buildDisputeTriggerTx({ jobRegistryAddress, jobId: 1, reason: 'unit test' });
    await owner.sendTransaction({ to: disputeTx.to, data: disputeTx.data });
    expect(await deployments.JobRegistry.disputeCount()).toBe(1n);

    const identityTx = buildIdentityDelegateTx({
      identityRegistryAddress,
      operatorAddress: systemPauseAddress,
      allowed: true
    });
    await owner.sendTransaction({ to: identityTx.to, data: identityTx.data });
    expect(await deployments.IdentityRegistry.delegates(systemPauseAddress)).toBe(true);

    const nodeRegisterTx = buildNodeRegistrationTx({
      nodeRegistryAddress,
      nodeId: 'alpha-node-1',
      operatorAddress: await owner.getAddress(),
      metadataURI: 'ipfs://node-1'
    });
    await owner.sendTransaction({ to: nodeRegisterTx.to, data: nodeRegisterTx.data });
    const nodeIdHash = nodeRegisterTx.nodeId;
    expect(await deployments.NodeRegistry.metadata(nodeIdHash)).toBe('ipfs://node-1');
    expect(await deployments.NodeRegistry.active(nodeIdHash)).toBe(true);
    const nodeMetadataTx = buildNodeMetadataTx({
      nodeRegistryAddress,
      nodeId: nodeIdHash,
      metadataURI: 'ipfs://node-1-v2'
    });
    await owner.sendTransaction({ to: nodeMetadataTx.to, data: nodeMetadataTx.data });
    expect(await deployments.NodeRegistry.metadata(nodeIdHash)).toBe('ipfs://node-1-v2');
    const nodeStatusTx = buildNodeStatusTx({
      nodeRegistryAddress,
      nodeId: nodeIdHash,
      active: false
    });
    await owner.sendTransaction({ to: nodeStatusTx.to, data: nodeStatusTx.data });
    expect(await deployments.NodeRegistry.active(nodeIdHash)).toBe(false);
    const nodeOperatorTx = buildNodeOperatorTx({
      nodeRegistryAddress,
      operatorAddress: '0x0000000000000000000000000000000000000002',
      allowed: true
    });
    await owner.sendTransaction({ to: nodeOperatorTx.to, data: nodeOperatorTx.data });
    expect(await deployments.NodeRegistry.operators('0x0000000000000000000000000000000000000002')).toBe(true);
    const nodeWorkMeterTx = buildNodeWorkMeterTx({
      nodeRegistryAddress,
      workMeterAddress
    });
    await owner.sendTransaction({ to: nodeWorkMeterTx.to, data: nodeWorkMeterTx.data });
    expect(await deployments.NodeRegistry.workMeter()).toBe(workMeterAddress);

    const validatorBuilderTx = buildWorkMeterValidatorTx({
      workMeterAddress,
      validatorAddress: await owner.getAddress(),
      allowed: true
    });
    await owner.sendTransaction({ to: validatorBuilderTx.to, data: validatorBuilderTx.data });
    expect(await deployments.WorkMeter.validators(await owner.getAddress())).toBe(true);
    const oracleBuilderTx = buildWorkMeterOracleTx({
      workMeterAddress,
      oracleAddress: '0x0000000000000000000000000000000000000003',
      allowed: true
    });
    await owner.sendTransaction({ to: oracleBuilderTx.to, data: oracleBuilderTx.data });
    expect(await deployments.WorkMeter.oracles('0x0000000000000000000000000000000000000003')).toBe(true);
    const windowBuilderTx = buildWorkMeterWindowTx({
      workMeterAddress,
      submissionWindowSeconds: 900
    });
    await owner.sendTransaction({ to: windowBuilderTx.to, data: windowBuilderTx.data });
    expect(await deployments.WorkMeter.submissionWindow()).toBe(900n);
    const productivityIndexBuilderTx = buildWorkMeterProductivityIndexTx({
      workMeterAddress,
      productivityIndexAddress
    });
    await owner.sendTransaction({ to: productivityIndexBuilderTx.to, data: productivityIndexBuilderTx.data });
    expect(await deployments.WorkMeter.productivityIndex()).toBe(productivityIndexAddress);

    const usageTx = buildWorkMeterUsageTx({
      workMeterAddress,
      reportId: 'usage-report-1',
      nodeId: nodeIdHash,
      gpuSeconds: '123.456',
      gflopsNorm: '50.5',
      modelTier: '1.1',
      sloPass: 0.9,
      quality: 0.95,
      metricDecimals: 6
    });
    await owner.sendTransaction({ to: usageTx.to, data: usageTx.data });
    const usageReport = await deployments.WorkMeter.lastReport();
    expect(usageReport.reportId).toBe(usageTx.meta.args.reportId);
    expect(usageReport.nodeId).toBe(nodeIdHash);

    const recordTx = buildProductivityRecordTx({
      productivityIndexAddress,
      epoch: 1,
      alphaWu: '10',
      tokensEmitted: '5',
      tokensBurned: '1'
    });
    await owner.sendTransaction({ to: recordTx.to, data: recordTx.data });
    const epochEntry = await deployments.ProductivityIndex.epochs(1);
    expect(epochEntry.alphaWu).toBe(BigInt(recordTx.meta.args.alphaWu));
    const emissionManagerTx = buildProductivityEmissionManagerTx({
      productivityIndexAddress,
      emissionManagerAddress: stakeManagerAddress
    });
    await owner.sendTransaction({ to: emissionManagerTx.to, data: emissionManagerTx.data });
    expect(await deployments.ProductivityIndex.emissionManager()).toBe(stakeManagerAddress);
    const productivityWorkMeterTx = buildProductivityWorkMeterTx({
      productivityIndexAddress,
      workMeterAddress
    });
    await owner.sendTransaction({ to: productivityWorkMeterTx.to, data: productivityWorkMeterTx.data });
    expect(await deployments.ProductivityIndex.workMeter()).toBe(workMeterAddress);
    const productivityTreasuryTx = buildProductivityTreasuryTx({
      productivityIndexAddress,
      treasuryAddress: rewardEngineAddress
    });
    await owner.sendTransaction({ to: productivityTreasuryTx.to, data: productivityTreasuryTx.data });
    expect(await deployments.ProductivityIndex.treasury()).toBe(rewardEngineAddress);

    expect(() =>
      buildMinimumStakeTx({ stakeManagerAddress, amount: '1', decimals: 6 })
    ).toThrow(/18 decimals/);
  }, 60000);
});
