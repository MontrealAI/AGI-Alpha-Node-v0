#!/usr/bin/env node
import process from 'node:process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve as pathResolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getAddress } from 'ethers';

const DEFAULT_ADDRESS = '0x0000000000000000000000000000000000000000';
const DEFAULT_START_BLOCK = '0';

export function renderSubgraphManifest({
  templatePath = pathResolve('subgraph', 'subgraph.yaml'),
  outputPath = pathResolve('subgraph', 'subgraph.ci.yaml'),
  address = process.env.ALPHA_NODE_MANAGER_ADDRESS,
  startBlock = process.env.ALPHA_NODE_MANAGER_START_BLOCK
} = {}) {
  const normalizedAddress = normalizeAddress(address);
  const normalizedStartBlock = normalizeStartBlock(startBlock);

  const template = readFileSync(templatePath, 'utf8');
  const rendered = template
    .replace(/\{\{\s*alphaNodeManagerAddress\s*\}\}/g, normalizedAddress)
    .replace(/\{\{\s*alphaNodeManagerStartBlock\s*\}\}/g, normalizedStartBlock);

  writeFileSync(outputPath, rendered, 'utf8');
  return { outputPath, address: normalizedAddress, startBlock: normalizedStartBlock };
}

async function runCli() {
  const result = renderSubgraphManifest();
  console.log(`Rendered subgraph manifest to ${result.outputPath}`);
  console.log(`  address:    ${result.address}`);
  console.log(`  startBlock: ${result.startBlock}`);
}

function normalizeAddress(address) {
  const candidate = (address ?? DEFAULT_ADDRESS).toString().trim();
  if (!candidate) return DEFAULT_ADDRESS;
  try {
    return getAddress(candidate);
  } catch (error) {
    throw new Error(`Invalid AlphaNodeManager address provided for subgraph manifest: ${error.message}`);
  }
}

function normalizeStartBlock(startBlock) {
  const candidate = (startBlock ?? DEFAULT_START_BLOCK).toString().trim();
  if (!candidate) return DEFAULT_START_BLOCK;
  if (!/^\d+$/.test(candidate)) {
    throw new Error('ALPHA_NODE_MANAGER_START_BLOCK must be a non-negative integer');
  }
  return candidate;
}

const isDirectExecution = Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(pathResolve(process.argv[1])).href;

if (isDirectExecution) {
  runCli().catch((error) => {
    console.error('Failed to render subgraph manifest:', error);
    process.exit(1);
  });
}
