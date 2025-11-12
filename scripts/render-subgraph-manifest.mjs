#!/usr/bin/env node
import process from 'node:process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve as pathResolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_ADDRESS = '0x0000000000000000000000000000000000000000';
const DEFAULT_START_BLOCK = '0';

export function renderSubgraphManifest({
  templatePath = pathResolve('subgraph', 'subgraph.yaml'),
  outputPath = pathResolve('subgraph', 'subgraph.ci.yaml'),
  address = process.env.ALPHA_NODE_MANAGER_ADDRESS,
  startBlock = process.env.ALPHA_NODE_MANAGER_START_BLOCK
} = {}) {
  const normalizedAddress = (address ?? DEFAULT_ADDRESS).trim() || DEFAULT_ADDRESS;
  const normalizedStartBlock = (startBlock ?? DEFAULT_START_BLOCK).trim() || DEFAULT_START_BLOCK;

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

const isDirectExecution = Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(pathResolve(process.argv[1])).href;

if (isDirectExecution) {
  runCli().catch((error) => {
    console.error('Failed to render subgraph manifest:', error);
    process.exit(1);
  });
}
