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
  buildIdentityDelegateTx
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

    expect(() =>
      buildMinimumStakeTx({ stakeManagerAddress, amount: '1', decimals: 6 })
    ).toThrow(/18 decimals/);
  }, 60000);
});
