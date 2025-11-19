import { describe, it, beforeAll, expect } from 'vitest';
import solc from 'solc';
import { Interface } from 'ethers';
import { VM, createVM } from '@ethereumjs/vm';
import { Account, Address, bytesToHex, hexToBytes, createAddressFromString } from '@ethereumjs/util';
import { encodeTreasuryIntent, digestTreasuryIntent } from '../../src/treasury/intentEncoding.js';
import type { TreasuryIntentV1 } from '../../src/treasury/intentTypes.js';

const SOURCE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract TreasuryIntentHarness {
    struct TreasuryIntentV1 {
        address to;
        uint256 value;
        bytes data;
    }

    function encodeIntent(TreasuryIntentV1 memory intent) external pure returns (bytes memory) {
        return abi.encode(intent.to, intent.value, intent.data);
    }

    function digestIntent(TreasuryIntentV1 memory intent) external pure returns (bytes32) {
        return keccak256(abi.encode(intent.to, intent.value, intent.data));
    }
}`;

async function deployHarness(vm: VM) {
  const input = {
    language: 'Solidity',
    sources: { 'TreasuryIntentHarness.sol': { content: SOURCE } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.deployedBytecode']
        }
      }
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const contract = output.contracts['TreasuryIntentHarness.sol'].TreasuryIntentHarness;
  const abi = contract.abi;
  const runtime = `0x${contract.evm.deployedBytecode.object}`;
  const iface = new Interface(abi);

  const contractAddress = createAddressFromString('0x0000000000000000000000000000000000000AAA');
  const code = hexToBytes(runtime);
  await vm.stateManager.putAccount(contractAddress, new Account());
  await vm.stateManager.putCode(contractAddress, code);

  const caller = createAddressFromString('0x00000000000000000000000000000000000000BB');
  const callerAccount = new Account();
  callerAccount.balance = 10n ** 18n;
  await vm.stateManager.putAccount(caller, callerAccount);

  return { iface, contractAddress, caller };
}

describe('Treasury intent encoding', () => {
  let vm: VM;
  let iface: Interface;
  let contractAddress: Address;
  let caller: Address;

  beforeAll(async () => {
    vm = await createVM();
    const deployment = await deployHarness(vm);
    iface = deployment.iface;
    contractAddress = deployment.contractAddress;
    caller = deployment.caller;
  });

  async function callHarness(functionName: string, intent: TreasuryIntentV1) {
    const data = iface.encodeFunctionData(functionName, [intent]);
    const result = await vm.evm.runCall({
      to: contractAddress,
      caller,
      gasLimit: 10_000_000n,
      data: hexToBytes(data)
    });
    const raw = bytesToHex(result.execResult.returnValue);
    const [decoded] = iface.decodeFunctionResult(functionName, raw);
    return decoded as string;
  }

  const sampleIntent: TreasuryIntentV1 = {
    to: '0x00000000000000000000000000000000000000CC',
    value: 10_000_000_000_000_000n,
    data: '0x12345678'
  };

  it('matches Solidity ABI encoding byte-for-byte', async () => {
    const tsEncoding = encodeTreasuryIntent(sampleIntent);
    const solidityEncoding = await callHarness('encodeIntent', sampleIntent);
    expect(tsEncoding.toLowerCase()).toBe(solidityEncoding.toLowerCase());
  });

  it('matches Solidity keccak256 digest of the struct', async () => {
    const tsDigest = digestTreasuryIntent(sampleIntent, { domain: false });
    const solidityDigest = await callHarness('digestIntent', sampleIntent);
    expect(tsDigest.toLowerCase()).toBe(solidityDigest.toLowerCase());
  });

  it('binds digest to domain inputs', () => {
    const digestA = digestTreasuryIntent(sampleIntent, {
      domain: { chainId: 1n, contractAddress: '0x0000000000000000000000000000000000000ddd' }
    });
    const digestB = digestTreasuryIntent(sampleIntent, {
      domain: { chainId: 10n, contractAddress: '0x0000000000000000000000000000000000000ddd' }
    });
    expect(digestA).not.toBe(digestB);
  });
});
