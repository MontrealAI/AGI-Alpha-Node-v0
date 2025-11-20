import { describe, it, beforeAll, beforeEach, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import solc from 'solc';
import { Interface, AbiCoder } from 'ethers';
import { VM, createVM } from '@ethereumjs/vm';
import { Account, Address, bytesToHex, createAddressFromString, hexToBytes } from '@ethereumjs/util';
import { digestTreasuryIntent } from '../../src/treasury/intentEncoding.js';
import { signIntentWithKeys } from '../../src/treasury/signingTools.js';
import { aggregateGuardianEnvelopes } from '../../src/treasury/thresholdAggregator.js';
import { GuardianRegistry } from '../../src/treasury/guardianRegistry.js';
import { generateGuardianKeyPair } from '../../src/treasury/pqEnvelope.js';
import type { TreasuryIntentV1 } from '../../src/treasury/intentTypes.js';

const TREASURY_SOURCE = 'contracts/TreasuryExecutor.sol';
const OWNABLE_SOURCE = 'contracts/access/Ownable.sol';
const GAS_LIMIT = 30_000_000n;

let abi: any = null;
let bytecode = '';
let iface: Interface;
let abiCoder: AbiCoder;

let vm: VM;
let owner: Address;
let orchestrator: Address;
let guardianOneId = 'guardian-one';
let guardianTwoId = 'guardian-two';
let recipient: Address;
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
  recipient = createAddressFromString('0x0000000000000000000000000000000000000c01');

  await seedAccount(owner);
  await seedAccount(orchestrator);
  await seedAccount(recipient);

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

describe('Mode A end-to-end integration', () => {
  it('aggregates guardian envelopes and executes an on-chain intent', async () => {
    const guardianOneKeys = await generateGuardianKeyPair(2, '0x' + '01'.repeat(32));
    const guardianTwoKeys = await generateGuardianKeyPair(2, '0x' + '02'.repeat(32));

    const registry = new GuardianRegistry([
      {
        id: guardianOneId,
        publicKey: Buffer.from(guardianOneKeys.publicKey).toString('base64'),
        parameterSet: guardianOneKeys.parameterSet
      },
      {
        id: guardianTwoId,
        publicKey: Buffer.from(guardianTwoKeys.publicKey).toString('base64'),
        parameterSet: guardianTwoKeys.parameterSet
      }
    ]);

    const intent: TreasuryIntentV1 = {
      to: recipient.toString(),
      value: 5n * 10n ** 15n,
      data: '0x'
    };

    const digest = digestTreasuryIntent(intent, {
      domain: {
        chainId: 1337n,
        contractAddress: contractAddress.toString(),
        version: 1
      }
    });

    const [signedOne, signedTwo] = await Promise.all([
      signIntentWithKeys({
        intent,
        domain: { chainId: 1337n, contractAddress: contractAddress.toString(), version: 1 },
        metadata: { guardianId: guardianOneId },
        privateKey: guardianOneKeys.privateKey,
        publicKey: guardianOneKeys.publicKey
      }),
      signIntentWithKeys({
        intent,
        domain: { chainId: 1337n, contractAddress: contractAddress.toString(), version: 1 },
        metadata: { guardianId: guardianTwoId },
        privateKey: guardianTwoKeys.privateKey,
        publicKey: guardianTwoKeys.publicKey
      })
    ]);

    const report = await aggregateGuardianEnvelopes([signedOne.envelope, signedTwo.envelope], {
      digest,
      threshold: 2,
      registry
    });

    expect(report.thresholdMet).toBe(true);
    expect(report.approvals.map((approval) => approval.guardian.id).sort()).toEqual([
      guardianOneId,
      guardianTwoId
    ]);
    expect(report.invalid).toHaveLength(0);
    expect(report.pendingGuardians).toHaveLength(0);

    await fundTreasury(10n ** 18n);
    const execution = await runContractCall({
      caller: orchestrator,
      data: iface.encodeFunctionData('executeTransaction', [intent.to, intent.value, intent.data])
    });

    expect(execution.execResult.exceptionError).toBeUndefined();

    const receiptLogs = decodeLogs(execution);
    const intentHash = computeIntentHash(intent.to, intent.value, intent.data);
    const executedLog = receiptLogs.find((log) => log.name === 'IntentExecuted');
    expect(executedLog?.args.intentHash).toBe(intentHash);
    expect(executedLog?.args.to.toLowerCase()).toBe(intent.to.toLowerCase());
    expect(executedLog?.args.value).toBe(intent.value);

    const recipientAccount = await vm.stateManager.getAccount(recipient);
    expect(recipientAccount.balance).toBe(10n ** 22n + intent.value);
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

function decodeLogs(result: Awaited<ReturnType<typeof runContractCall>>) {
  return result.execResult.logs.map(([address, topics, data]) =>
    iface.parseLog({
      address: (address as Address).toString(),
      topics: (topics as Uint8Array[]).map((topic) => bytesToHex(topic)),
      data: bytesToHex(data as Uint8Array)
    })
  );
}

function computeIntentHash(to: string, value: bigint, data: string): string {
  return digestTreasuryIntent({ to, value, data }, { domain: false });
}
