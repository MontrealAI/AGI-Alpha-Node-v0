import { describe, it, beforeAll, beforeEach, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import solc from 'solc';
import { Interface, AbiCoder, keccak256 } from 'ethers';
import { VM, createVM } from '@ethereumjs/vm';
import { Account, Address, bytesToHex, hexToBytes, createAddressFromString } from '@ethereumjs/util';

const TREASURY_SOURCE = 'contracts/TreasuryExecutor.sol';
const OWNABLE_SOURCE = 'contracts/access/Ownable.sol';
const GAS_LIMIT = 30_000_000n;

let abi: any = null;
let bytecode: string = '';
let iface: Interface;
let abiCoder: AbiCoder;

let vm: VM;
let owner: Address;
let orchestrator: Address;
let outsider: Address;
let recipient: Address;
let sweepRecipient: Address;
let contractAddress: Address;

beforeAll(() => {
  abiCoder = AbiCoder.defaultAbiCoder();
  const sources = {
    [TREASURY_SOURCE]: { content: readFileSync(TREASURY_SOURCE, 'utf8') },
    [OWNABLE_SOURCE]: { content: readFileSync(OWNABLE_SOURCE, 'utf8') }
  } satisfies Record<string, { content: string }>;

  const input = {
    language: 'Solidity',
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object']
        }
      }
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const artifact = output.contracts[TREASURY_SOURCE].TreasuryExecutor;
  abi = artifact.abi;
  bytecode = artifact.evm.bytecode.object;
  iface = new Interface(abi);
});

beforeEach(async () => {
  vm = await createVM();
  owner = createAddressFromString('0x0000000000000000000000000000000000000a01');
  orchestrator = createAddressFromString('0x0000000000000000000000000000000000000b01');
  outsider = createAddressFromString('0x0000000000000000000000000000000000000c01');
  recipient = createAddressFromString('0x0000000000000000000000000000000000000d01');
  sweepRecipient = createAddressFromString('0x0000000000000000000000000000000000000e01');

  await seedAccount(owner);
  await seedAccount(orchestrator);
  await seedAccount(outsider);
  await seedAccount(recipient);
  await seedAccount(sweepRecipient);

  const constructorArgs = abiCoder.encode(['address'], [orchestrator.toString()]);
  const deploymentCode = `0x${bytecode}${constructorArgs.slice(2)}`;
  const deployment = await vm.evm.runCall({
    caller: owner,
    gasLimit: GAS_LIMIT,
    to: undefined,
    data: hexToBytes(deploymentCode),
    value: 0n
  });

  if (!deployment.createdAddress) {
    throw new Error('TreasuryExecutor deployment failed.');
  }
  contractAddress = deployment.createdAddress;
});

describe('TreasuryExecutor', () => {
  it('executes transfers, emits events, and marks the intent hash', async () => {
    await fundTreasury(2n * 10n ** 18n);
    const transferValue = 10n ** 17n;
    const intentHash = computeIntentHash(recipient.toString(), transferValue, '0x');

    const execResult = await executeIntent(recipient.toString(), transferValue, '0x');
    expect(execResult.execResult.exceptionError).toBeUndefined();

    const recipientAccount = await vm.stateManager.getAccount(recipient);
    expect(recipientAccount.balance).toBe(10n ** 22n + transferValue);

    expect(await readIntentStatus(intentHash)).toBe(true);

    const log = decodeLogs(execResult)[0];
    expect(log.name).toBe('IntentExecuted');
    expect(log.args.intentHash).toBe(intentHash);
    expect(log.args.executor.toLowerCase()).toBe(orchestrator.toString().toLowerCase());
    expect(log.args.to.toLowerCase()).toBe(recipient.toString().toLowerCase());
    expect(log.args.value).toBe(transferValue);
  });

  it('rejects duplicate executions until owner resets the intent status', async () => {
    await fundTreasury(10n ** 18n);
    const value = 5n * 10n ** 16n;
    const hash = computeIntentHash(recipient.toString(), value, '0x');

    await executeIntent(recipient.toString(), value, '0x');
    const duplicate = await executeIntent(recipient.toString(), value, '0x');
    const parsedError = parseError(duplicate);
    expect(parsedError?.name).toBe('IntentAlreadyExecuted');

    const resetResult = await callOwner('setIntentStatus', [hash, false]);
    expect(resetResult.execResult.exceptionError).toBeUndefined();
    expect(await readIntentStatus(hash)).toBe(false);

    const replay = await executeIntent(recipient.toString(), value, '0x');
    expect(replay.execResult.exceptionError).toBeUndefined();
  });

  it('blocks non-orchestrator callers', async () => {
    await fundTreasury(10n ** 18n);
    const attempt = await runContractCall({
      caller: outsider,
      data: iface.encodeFunctionData('executeTransaction', [recipient.toString(), 1n, '0x'])
    });
    const parsedError = parseError(attempt);
    expect(parsedError?.name).toBe('NotOrchestrator');
  });

  it('obeys pause/unpause controls', async () => {
    await fundTreasury(10n ** 18n);
    await callOwner('pause', []);

    const blocked = await executeIntent(recipient.toString(), 1n, '0x');
    expect(parseError(blocked)?.name).toBe('TreasuryPaused');

    await callOwner('unpause', []);
    const allowed = await executeIntent(recipient.toString(), 1n, '0x');
    expect(allowed.execResult.exceptionError).toBeUndefined();
  });

  it('allows owners to rotate orchestrators and sweep funds', async () => {
    const newOrchestrator = createAddressFromString('0x0000000000000000000000000000000000000f01');
    await seedAccount(newOrchestrator);

    await callOwner('setOrchestrator', [newOrchestrator.toString()]);

    const attempt = await runContractCall({
      caller: orchestrator,
      data: iface.encodeFunctionData('executeTransaction', [recipient.toString(), 1n, '0x'])
    });
    expect(parseError(attempt)?.name).toBe('NotOrchestrator');

    const funded = 3n * 10n ** 17n;
    await fundTreasury(funded);
    const sweepTx = await callOwner('sweep', [sweepRecipient.toString()]);
    expect(sweepTx.execResult.exceptionError).toBeUndefined();

    const sweepBalance = await vm.stateManager.getAccount(sweepRecipient);
    expect(sweepBalance.balance).toBe(10n ** 22n + funded);
  });
});

async function seedAccount(address: Address, balance = 10n ** 22n) {
  const account = new Account();
  account.balance = balance;
  await vm.stateManager.putAccount(address, account);
}

async function fundTreasury(amount: bigint) {
  const result = await vm.evm.runCall({
    caller: owner,
    to: contractAddress,
    gasLimit: GAS_LIMIT,
    value: amount,
    data: new Uint8Array()
  });
  if (result.execResult.exceptionError) {
    throw result.execResult.exceptionError.error;
  }
}

async function executeIntent(to: string, value: bigint, data: string) {
  return runContractCall({
    caller: orchestrator,
    data: iface.encodeFunctionData('executeTransaction', [to, value, data])
  });
}

async function callOwner(functionName: string, args: any[]) {
  return runContractCall({ caller: owner, data: iface.encodeFunctionData(functionName, args) });
}

async function readIntentStatus(intentHash: string) {
  const call = await runContractCall({
    caller: owner,
    data: iface.encodeFunctionData('executedIntents', [intentHash]),
    isStatic: true
  });
  const raw = bytesToHex(call.execResult.returnValue);
  const [flag] = iface.decodeFunctionResult('executedIntents', raw);
  return flag as boolean;
}

async function runContractCall({
  caller,
  data,
  value = 0n,
  isStatic = false
}: {
  caller: Address;
  data: string;
  value?: bigint;
  isStatic?: boolean;
}) {
  return vm.evm.runCall({
    caller,
    to: contractAddress,
    gasLimit: GAS_LIMIT,
    value,
    isStatic,
    data: hexToBytes(data)
  });
}

function computeIntentHash(to: string, value: bigint, data: string): string {
  return keccak256(abiCoder.encode(['address', 'uint256', 'bytes'], [to, value, data]));
}

function decodeLogs(result: Awaited<ReturnType<typeof runContractCall>>) {
  return result.execResult.logs.map(([address, topics, data]) =>
    iface.parseLog({
      address: (address as Address).toString(),
      topics: (topics as Uint8Array[]).map((topic) => bytesToHex(topic)),
      data: bytesToHex(data as Uint8Array)
    })
  );
}

function parseError(result: Awaited<ReturnType<typeof runContractCall>>) {
  if (!result.execResult.exceptionError) {
    return undefined;
  }
  const dataHex = bytesToHex(result.execResult.returnValue);
  try {
    return iface.parseError(dataHex);
  } catch {
    return undefined;
  }
}
