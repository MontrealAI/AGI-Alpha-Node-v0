#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';
import { ethers } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RPC_URL = process.env.RPC_URL ?? 'http://127.0.0.1:8545';
const SUBGRAPH_URL = process.env.SUBGRAPH_URL ?? 'http://localhost:8000/subgraphs/name/agi-alpha-node';

function compileAlphaNodeManager() {
  const contractPath = resolve(__dirname, '../contracts/AlphaNodeManager.sol');
  const interfacePath = resolve(__dirname, '../contracts/interfaces/IAlphaWorkUnitEvents.sol');

  const input = {
    language: 'Solidity',
    sources: {
      'AlphaNodeManager.sol': {
        content: readFileSync(contractPath, 'utf8'),
      },
      'interfaces/IAlphaWorkUnitEvents.sol': {
        content: readFileSync(interfacePath, 'utf8'),
      },
    },
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object', 'storageLayout'],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  if (output.errors) {
    for (const error of output.errors) {
      if (error.severity === 'error') {
        throw new Error(error.formattedMessage);
      }
      console.warn(error.formattedMessage);
    }
  }

  const contractOutput = output.contracts['AlphaNodeManager.sol'].AlphaNodeManager;
  return {
    abi: contractOutput.abi,
    bytecode: `0x${contractOutput.evm.bytecode.object}`,
    storageLayout: contractOutput.storageLayout,
  };
}

async function setStorage(provider, address, slot, value) {
  try {
    await provider.send('hardhat_setStorageAt', [address, slot, value]);
  } catch (error) {
    await provider.send('anvil_setStorageAt', [address, slot, value]);
  }
}

function mappingSlot(layout, label) {
  const entry = layout.storage.find((item) => item.label === label);
  if (!entry) {
    throw new Error(`Unable to locate storage slot for ${label}`);
  }
  return BigInt(entry.slot);
}

async function querySubgraph(query, variables) {
  const response = await fetch(SUBGRAPH_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Subgraph query failed with status ${response.status}`);
  }

  const body = await response.json();
  if (body.errors) {
    const message = body.errors.map((err) => err.message).join('\n');
    throw new Error(`Subgraph responded with errors: ${message}`);
  }

  return body.data;
}

async function waitForMetrics(fetcher, timeoutMs = 60000, intervalMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const result = await fetcher();
      if (result) {
        return result;
      }
    } catch (error) {
      console.warn(`Waiting for subgraph metrics: ${error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('Timed out waiting for subgraph metrics');
}

async function main() {
  const { abi, bytecode, storageLayout } = compileAlphaNodeManager();
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const accounts = await provider.listAccounts();
  if (accounts.length < 4) {
    throw new Error('At least four funded accounts are required on the target RPC');
  }

  const owner = provider.getSigner(accounts[0]);
  const agent = provider.getSigner(accounts[1]);
  const validator = provider.getSigner(accounts[2]);
  const nodeAddress = accounts[3];

  const agentAddress = await agent.getAddress();
  const validatorAddress = await validator.getAddress();

  console.log('Deploying AlphaNodeManager...');
  const factory = new ethers.ContractFactory(abi, bytecode, owner);
  const manager = await factory.deploy(ethers.ZeroAddress);
  await manager.waitForDeployment();
  const managerAddress = await manager.getAddress();
  console.log(`AlphaNodeManager deployed at ${managerAddress}`);

  const workUnitId = ethers.id('sample-work-unit');
  const ensNode = ethers.id('agent.alpha-node.eth');
  const stakeAmount = ethers.parseUnits('1000', 18);
  const slashAmount = ethers.parseUnits('250', 18);
  const scoreValue = BigInt(9000);

  console.log('Configuring validator and agent identities...');
  await (await manager.connect(owner).setValidator(validatorAddress, true)).wait();
  await (await manager.connect(owner).registerIdentity(ensNode, agentAddress)).wait();

  const stakedBalanceSlot = mappingSlot(storageLayout, 'stakedBalance');
  const slotKey = ethers.zeroPadValue(ethers.toBeHex(stakedBalanceSlot), 32);
  const storageKey = ethers.keccak256(
    ethers.concat([ethers.zeroPadValue(validatorAddress, 32), slotKey]),
  );
  const storageValue = ethers.zeroPadValue(ethers.toBeHex(stakeAmount), 32);
  await setStorage(provider, managerAddress, storageKey, storageValue);
  await provider.send('evm_mine', []);

  console.log('Emitting AlphaWUMinted...');
  await (await manager.connect(agent).recordAlphaWUMint(workUnitId, agentAddress, nodeAddress)).wait();

  console.log('Emitting AlphaWUValidated...');
  await (
    await manager
      .connect(validator)
      .recordAlphaWUValidation(workUnitId, stakeAmount, scoreValue)
  ).wait();

  console.log('Emitting AlphaWUAccepted...');
  await (await manager.connect(owner).recordAlphaWUAcceptance(workUnitId)).wait();

  console.log('Emitting SlashApplied...');
  await (await manager.connect(owner).applySlash(workUnitId, validatorAddress, slashAmount)).wait();

  const agentId = agentAddress.toLowerCase();
  const nodeId = nodeAddress.toLowerCase();

  const metricsQuery = `
    query Metrics($agentId: String!, $nodeId: String!) {
      agentMetricWindows(where: { agent: $agentId }) {
        id
        windowDays
        mintedCount
        acceptedCount
        validationCount
        averageScore
        slashAmount
      }
      nodeMetricWindows(where: { node: $nodeId }) {
        id
        windowDays
        mintedCount
        acceptedCount
        validationCount
        averageScore
        slashAmount
      }
    }
  `;

  console.log('Waiting for subgraph to index emitted events...');
  const data = await waitForMetrics(async () => {
    const result = await querySubgraph(metricsQuery, { agentId, nodeId });
    const windows = result.agentMetricWindows ?? [];
    const nodeWindows = result.nodeMetricWindows ?? [];

    const hasAgentWindows = windows.length >= 2;
    const hasNodeWindows = nodeWindows.length >= 2;
    if (!hasAgentWindows || !hasNodeWindows) {
      return null;
    }

    const agent7 = windows.find((entry) => Number(entry.windowDays) === 7);
    const agent30 = windows.find((entry) => Number(entry.windowDays) === 30);
    const node7 = nodeWindows.find((entry) => Number(entry.windowDays) === 7);
    const node30 = nodeWindows.find((entry) => Number(entry.windowDays) === 30);

    if (!agent7 || !agent30 || !node7 || !node30) {
      return null;
    }

    if (
      agent7.mintedCount === '0' ||
      agent30.mintedCount === '0' ||
      node7.mintedCount === '0' ||
      node30.mintedCount === '0'
    ) {
      return null;
    }

    return result;
  });

  const expectMinted = 1n;
  const expectAverage = 9000;
  const expectSlash = slashAmount.toString();

  for (const window of data.agentMetricWindows) {
    assert.strictEqual(BigInt(window.mintedCount), expectMinted, 'agent minted count mismatch');
    assert.strictEqual(BigInt(window.acceptedCount), expectMinted, 'agent accepted count mismatch');
    assert.strictEqual(BigInt(window.validationCount), expectMinted, 'agent validation count mismatch');
    assert.ok(Math.abs(Number(window.averageScore) - expectAverage) < 1e-6, 'agent average score mismatch');
    assert.strictEqual(window.slashAmount, expectSlash, 'agent slash amount mismatch');
  }

  for (const window of data.nodeMetricWindows) {
    assert.strictEqual(BigInt(window.mintedCount), expectMinted, 'node minted count mismatch');
    assert.strictEqual(BigInt(window.acceptedCount), expectMinted, 'node accepted count mismatch');
    assert.strictEqual(BigInt(window.validationCount), expectMinted, 'node validation count mismatch');
    assert.ok(Math.abs(Number(window.averageScore) - expectAverage) < 1e-6, 'node average score mismatch');
    assert.strictEqual(window.slashAmount, expectSlash, 'node slash amount mismatch');
  }

  console.log('Subgraph metrics validated successfully.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
