import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { AbiCoder, ContractFactory, JsonRpcProvider, ZeroAddress, keccak256, toBeHex } from 'ethers';

const ANVIL_PORT = 8550;
const ANVIL_URL = `http://127.0.0.1:${ANVIL_PORT}`;

let anvilProcess = null;
let provider = null;
let owner = null;
let validator = null;
let agent = null;
let observer = null;
let solc;
let compiledArtifact;

const anvilCheck = spawnSync('anvil', ['--version']);
const anvilAvailable = !anvilCheck.error;

let solcAvailable = true;
try {
  const solcModule = await import('solc');
  solc = solcModule.default ?? solcModule;
} catch (error) {
  solcAvailable = false;
}

const describeIf = anvilAvailable && solcAvailable ? describe : describe.skip;

async function compileContract() {
  const managerPath = join(process.cwd(), 'contracts', 'AlphaNodeManager.sol');
  const interfacePath = join(process.cwd(), 'contracts', 'interfaces', 'IAlphaWorkUnitEvents.sol');
  const input = {
    language: 'Solidity',
    sources: {
      'contracts/AlphaNodeManager.sol': {
        content: readFileSync(managerPath, 'utf8')
      },
      'contracts/interfaces/IAlphaWorkUnitEvents.sol': {
        content: readFileSync(interfacePath, 'utf8')
      }
    },
    settings: {
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode']
        }
      }
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  if (output.errors?.length) {
    const blocking = output.errors.filter((error) => error.severity === 'error');
    if (blocking.length) {
      throw new Error(blocking.map((item) => item.formattedMessage ?? item.message).join('\n'));
    }
  }
  compiledArtifact = output.contracts['contracts/AlphaNodeManager.sol'].AlphaNodeManager;
}

describeIf('AlphaNodeManager contract', () => {
  beforeAll(async () => {
    if (!anvilAvailable || !solcAvailable) {
      return;
    }
    await compileContract();
    anvilProcess = spawn('anvil', ['--port', String(ANVIL_PORT)]);
    await once(anvilProcess.stdout, 'data');
    provider = new JsonRpcProvider(ANVIL_URL);
    owner = await provider.getSigner(0);
    validator = await provider.getSigner(1);
    agent = await provider.getSigner(2);
    observer = await provider.getSigner(3);
  });

  afterAll(async () => {
    if (anvilProcess) {
      anvilProcess.kill('SIGTERM');
      await once(anvilProcess, 'exit');
    }
  });

  async function deployManager() {
    const factory = new ContractFactory(compiledArtifact.abi, compiledArtifact.evm.bytecode.object, owner);
    const manager = await factory.deploy(ZeroAddress);
    await manager.waitForDeployment();
    return manager;
  }

  async function setValidatorStake(manager, validatorAddress, amount) {
    const managerAddress = await manager.getAddress();
    const slotIndex = 4n;
    const coder = AbiCoder.defaultAbiCoder();
    const encoded = coder.encode(['address', 'uint256'], [validatorAddress, slotIndex]);
    const storageSlot = keccak256(encoded);
    await provider.send('anvil_setStorageAt', [managerAddress, storageSlot, toBeHex(amount, 32)]);
  }

  it('deploys with canonical $AGIALPHA token configured', async () => {
    const manager = await deployManager();
    const stakingToken = await manager.stakingToken();
    expect(stakingToken).toBe('0xa61A3B3A130A9C20768eEBf97E21515A6046a1FA');
  });

  it('enforces owner-only pause controls', async () => {
    const manager = await deployManager();
    await expect(manager.connect(agent).pause()).rejects.toThrow(/CallerNotOwner/);
    const pauseTx = await manager.connect(owner).pause();
    const pauseReceipt = await pauseTx.wait();
    const pauseLog = manager.interface.parseLog(pauseReceipt.logs[0]);
    expect(pauseLog.name).toBe('Paused');
    expect(pauseLog.args.account).toBe(await owner.getAddress());

    await expect(manager.connect(owner).pause()).rejects.toThrow(/AlreadyPaused/);

    const unpauseTx = await manager.connect(owner).unpause();
    const unpauseReceipt = await unpauseTx.wait();
    const unpauseLog = manager.interface.parseLog(unpauseReceipt.logs[0]);
    expect(unpauseLog.name).toBe('Unpaused');
    expect(unpauseLog.args.account).toBe(await owner.getAddress());

    await expect(manager.connect(agent).unpause()).rejects.toThrow(/CallerNotOwner/);
  });

  it('manages validator roster with owner controls', async () => {
    const manager = await deployManager();
    const validatorAddress = await validator.getAddress();
    await expect(manager.connect(agent).setValidator(validatorAddress, true)).rejects.toThrow(/CallerNotOwner/);

    const tx = await manager.connect(owner).setValidator(validatorAddress, true);
    const receipt = await tx.wait();
    const log = manager.interface.parseLog(receipt.logs[0]);
    expect(log.name).toBe('ValidatorUpdated');
    expect(log.args.validator).toBe(validatorAddress);
    expect(log.args.active).toBe(true);

    await manager.connect(owner).setValidator(validatorAddress, false);
    const status = await manager.validators(validatorAddress);
    expect(status).toBe(false);
  });

  it('requires registered ENS identities for minting events', async () => {
    const manager = await deployManager();
    const agentAddress = await agent.getAddress();
    const nodeAddress = await validator.getAddress();
    const ensNode = '0x' + '01'.repeat(32);

    await expect(manager.connect(agent).recordAlphaWUMint(ensNode, agentAddress, nodeAddress)).rejects.toThrow(/IdentityInactive/);

    await manager.connect(owner).registerIdentity(ensNode, agentAddress);

    const mintId = '0x' + 'aa'.repeat(32);
    const mintTx = await manager.connect(agent).recordAlphaWUMint(mintId, agentAddress, nodeAddress);
    const mintReceipt = await mintTx.wait();
    const mintEvent = mintReceipt.logs.map((log) => manager.interface.parseLog(log)).find((entry) => entry.name === 'AlphaWUMinted');
    expect(mintEvent).toBeDefined();
    expect(mintEvent.args.id).toBe(mintId);
    expect(mintEvent.args.agent).toBe(agentAddress);
    expect(mintEvent.args.node).toBe(nodeAddress);

    await manager.connect(owner).setIdentityStatus(ensNode, false);
    await expect(manager.connect(agent).recordAlphaWUMint(mintId, agentAddress, nodeAddress)).rejects.toThrow(/IdentityInactive/);

    await manager.connect(owner).setIdentityStatus(ensNode, true);
    const ownerMint = await manager.connect(owner).recordAlphaWUMint(mintId, agentAddress, nodeAddress);
    await ownerMint.wait();
  });

  it('emits validation events only from validators', async () => {
    const manager = await deployManager();
    const validatorAddress = await validator.getAddress();
    await manager.connect(owner).setValidator(validatorAddress, true);

    const validationId = '0x' + 'bb'.repeat(32);
    await expect(manager.connect(agent).recordAlphaWUValidation(validationId, 100n, 9000n)).rejects.toThrow(/NotValidator/);
    await expect(manager.connect(validator).recordAlphaWUValidation(validationId, 100n, 9000n)).rejects.toThrow(/InsufficientStake/);

    await setValidatorStake(manager, validatorAddress, 200n);

    const validationTx = await manager.connect(validator).recordAlphaWUValidation(validationId, 100n, 9000n);
    const validationReceipt = await validationTx.wait();
    const validationEvent = validationReceipt.logs.map((log) => manager.interface.parseLog(log)).find((entry) => entry.name === 'AlphaWUValidated');
    expect(validationEvent).toBeDefined();
    expect(validationEvent.args.validator).toBe(validatorAddress);
    expect(validationEvent.args.stake).toBe(100n);
    expect(validationEvent.args.score).toBe(9000n);

    const excessiveStakeId = '0x' + 'bd'.repeat(32);
    await expect(manager.connect(validator).recordAlphaWUValidation(excessiveStakeId, 250n, 8100n)).rejects.toThrow(/InsufficientStake/);
  });

  it('acceptance requires validator or owner authorization', async () => {
    const manager = await deployManager();
    const validatorAddress = await validator.getAddress();
    await manager.connect(owner).setValidator(validatorAddress, true);
    const acceptanceId = '0x' + 'cc'.repeat(32);

    await expect(manager.connect(agent).recordAlphaWUAcceptance(acceptanceId)).rejects.toThrow(/UnauthorizedAcceptance/);

    const validatorTx = await manager.connect(validator).recordAlphaWUAcceptance(acceptanceId);
    const validatorReceipt = await validatorTx.wait();
    const validatorEvent = validatorReceipt.logs.map((log) => manager.interface.parseLog(log)).find((entry) => entry.name === 'AlphaWUAccepted');
    expect(validatorEvent).toBeDefined();

    const ownerTx = await manager.connect(owner).recordAlphaWUAcceptance(acceptanceId);
    await ownerTx.wait();
  });

  it('allows owner to apply slash events for registered validators', async () => {
    const manager = await deployManager();
    const validatorAddress = await validator.getAddress();
    await manager.connect(owner).setValidator(validatorAddress, true);

    await expect(manager.connect(agent).applySlash('0x' + 'dd'.repeat(32), validatorAddress, 10n)).rejects.toThrow(/CallerNotOwner/);
    await expect(manager.connect(owner).applySlash('0x' + 'dd'.repeat(32), validatorAddress, 0n)).rejects.toThrow(/InvalidAmount/);

    const slashId = '0x' + 'dd'.repeat(32);
    const slashTx = await manager.connect(owner).applySlash(slashId, validatorAddress, 10n);
    const slashReceipt = await slashTx.wait();
    const slashEvent = slashReceipt.logs.map((log) => manager.interface.parseLog(log)).find((entry) => entry.name === 'SlashApplied');
    expect(slashEvent).toBeDefined();
    expect(slashEvent.args.validator).toBe(validatorAddress);
    expect(slashEvent.args.amount).toBe(10n);

    await manager.connect(owner).setValidator(validatorAddress, false);
    await expect(manager.connect(owner).applySlash(slashId, validatorAddress, 10n)).rejects.toThrow(/ValidatorUnknown/);
  });

  it('supports identity controller rotation and revocation', async () => {
    const manager = await deployManager();
    const agentAddress = await agent.getAddress();
    const observerAddress = await observer.getAddress();
    const ensNode = '0x' + '11'.repeat(32);

    await manager.connect(owner).registerIdentity(ensNode, agentAddress);
    expect(await manager.isIdentityActive(agentAddress)).toBe(true);

    await manager.connect(owner).updateIdentityController(ensNode, observerAddress);
    expect(await manager.isIdentityActive(agentAddress)).toBe(false);
    expect(await manager.isIdentityActive(observerAddress)).toBe(true);

    await expect(manager.connect(agent).recordAlphaWUMint('0x' + '22'.repeat(32), agentAddress, observerAddress)).rejects.toThrow(/IdentityInactive/);
    const mintTx = await manager.connect(observer).recordAlphaWUMint('0x' + '22'.repeat(32), observerAddress, agentAddress);
    await mintTx.wait();

    await manager.connect(owner).revokeIdentity(ensNode);
    expect(await manager.isIdentityActive(observerAddress)).toBe(false);
    await expect(manager.connect(observer).recordAlphaWUMint('0x' + '22'.repeat(32), observerAddress, agentAddress)).rejects.toThrow(/IdentityInactive/);
  });

  it('exposes identity metadata through view helpers', async () => {
    const manager = await deployManager();
    const agentAddress = await agent.getAddress();
    const ensNode = '0x' + '55'.repeat(32);

    await manager.connect(owner).registerIdentity(ensNode, agentAddress);

    const identity = await manager.getIdentity(agentAddress);
    expect(identity[0]).toBe(ensNode);
    expect(identity[1]).toBe(true);

    const controller = await manager.ensNodeController(ensNode);
    expect(controller).toBe(agentAddress);
    expect(await manager.isIdentityActive(agentAddress)).toBe(true);

    await manager.connect(owner).setIdentityStatus(ensNode, false);
    const updated = await manager.getIdentity(agentAddress);
    expect(updated[1]).toBe(false);
    expect(await manager.isIdentityActive(agentAddress)).toBe(false);
  });

  it('halts work unit pipeline when paused', async () => {
    const manager = await deployManager();
    const agentAddress = await agent.getAddress();
    const validatorAddress = await validator.getAddress();
    const ensNode = '0x' + '33'.repeat(32);
    const workUnitId = '0x' + '44'.repeat(32);

    await manager.connect(owner).registerIdentity(ensNode, agentAddress);
    await manager.connect(owner).setValidator(validatorAddress, true);
    await manager.connect(owner).pause();

    await expect(manager.connect(agent).recordAlphaWUMint(workUnitId, agentAddress, validatorAddress)).rejects.toThrow(/AlreadyPaused/);
    await expect(manager.connect(validator).recordAlphaWUValidation(workUnitId, 1n, 5000n)).rejects.toThrow(/AlreadyPaused/);
    await expect(manager.connect(validator).recordAlphaWUAcceptance(workUnitId)).rejects.toThrow(/AlreadyPaused/);
  });
});
