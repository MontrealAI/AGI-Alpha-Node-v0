#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const templatePath = resolve('subgraph', 'subgraph.yaml');
const outputPath = resolve('subgraph', 'subgraph.ci.yaml');

const DEFAULT_ADDRESS = '0x0000000000000000000000000000000000000000';
const DEFAULT_START_BLOCK = '0';

const address = (process.env.ALPHA_NODE_MANAGER_ADDRESS ?? DEFAULT_ADDRESS).trim();
const startBlock = (process.env.ALPHA_NODE_MANAGER_START_BLOCK ?? DEFAULT_START_BLOCK).trim();

const template = readFileSync(templatePath, 'utf8');
const rendered = template
  .replace(/\{\{\s*alphaNodeManagerAddress\s*\}\}/g, address)
  .replace(/\{\{\s*alphaNodeManagerStartBlock\s*\}\}/g, startBlock);

writeFileSync(outputPath, rendered, 'utf8');

console.log(`Rendered subgraph manifest to ${outputPath}`);
console.log(`  address:    ${address}`);
console.log(`  startBlock: ${startBlock}`);
