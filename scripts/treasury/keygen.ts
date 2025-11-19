#!/usr/bin/env tsx
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import { Command } from 'commander';
import { getBytes } from 'ethers';
import { generateGuardianKeyPair } from '../../src/treasury/pqEnvelope.js';

const program = new Command();
program
  .name('treasury:keygen')
  .description('Generate Dilithium guardian key pairs for Mode A signing workflows.')
  .option('--guardian-id <id>', 'Guardian identifier used for metadata and file naming')
  .option('--parameter-set <n>', 'Dilithium parameter set (0-3)', (value) => Number.parseInt(value, 10), 2)
  .option('--out <prefix>', 'File prefix for emitted key material (writes <prefix>.pk/.sk/.json)')
  .option('--dir <path>', 'Directory used when --out is not provided', 'keys')
  .option('--seed <hex|base64|@path>', 'Optional deterministic seed (hex, base64, or @path)')
  .option('--json', 'Print machine-readable JSON summary', false)
  .option('--stdout', 'Skip file emission and only print to stdout', false)
  .parse(process.argv);

const options = program.opts<{
  guardianId?: string;
  parameterSet: number;
  out?: string;
  dir?: string;
  seed?: string;
  json: boolean;
  stdout: boolean;
}>();

const parameterSet = Number.isInteger(options.parameterSet) ? options.parameterSet : 2;
if (parameterSet < 0 || parameterSet > 3) {
  throw new Error('Dilithium parameter set must be between 0 and 3.');
}

const seedBytes = options.seed ? loadSeed(options.seed) : undefined;

const prefix = options.out
  ? resolve(options.out)
  : resolve(options.dir ?? 'keys', options.guardianId ?? `guardian-${Date.now()}`);

const guardianId = options.guardianId ?? null;

const keyPair = await generateGuardianKeyPair(parameterSet, seedBytes);
const publicKeyBase64 = Buffer.from(keyPair.publicKey).toString('base64');
const privateKeyBase64 = Buffer.from(keyPair.privateKey).toString('base64');
const metadata = {
  guardianId,
  parameterSet,
  publicKey: publicKeyBase64,
  publicKeyHex: `0x${Buffer.from(keyPair.publicKey).toString('hex')}`,
  privateKey: privateKeyBase64,
  privateKeyHex: `0x${Buffer.from(keyPair.privateKey).toString('hex')}`,
  filesWritten: options.stdout ? [] : buildFileList(prefix)
};

if (!options.stdout) {
  const dirPath = dirname(prefix);
  mkdirSync(dirPath, { recursive: true });
  writeFileSync(`${prefix}.pk`, `${publicKeyBase64}\n`, { mode: 0o600 });
  writeFileSync(`${prefix}.sk`, `${privateKeyBase64}\n`, { mode: 0o600 });
  const jsonPayload = JSON.stringify(
    {
      guardianId,
      parameterSet,
      publicKey: publicKeyBase64
    },
    null,
    2
  );
  writeFileSync(`${prefix}.json`, `${jsonPayload}\n`, { mode: 0o600 });
  console.error(`Guardian key pair written to ${prefix}.{pk,sk,json}`);
}

if (options.json) {
  process.stdout.write(`${JSON.stringify(metadata, null, 2)}\n`);
} else {
  console.log('Guardian key pair generated.');
  if (guardianId) {
    console.log(`  Guardian ID: ${guardianId}`);
  }
  console.log(`  Parameter set: ${parameterSet}`);
  console.log(`  Public key (base64): ${publicKeyBase64}`);
  console.log(`  Private key (base64): ${privateKeyBase64}`);
  console.log('Share only the public key + metadata JSON with the orchestrator. Keep the private key offline.');
}

function loadSeed(seedInput: string): Uint8Array {
  const raw = maybeRead(seedInput).trim();
  if (!raw) {
    throw new Error('Seed input cannot be empty.');
  }
  if (raw.startsWith('0x')) {
    return getBytes(raw as `0x${string}`);
  }
  return Buffer.from(raw, 'base64');
}

function maybeRead(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.startsWith('@')) {
    const resolved = resolve(trimmed.slice(1));
    return readFileSync(resolved, 'utf8');
  }
  const candidate = resolve(trimmed);
  if (existsSync(candidate)) {
    return readFileSync(candidate, 'utf8');
  }
  return trimmed;
}

function buildFileList(prefixPath: string): string[] {
  return ['.pk', '.sk', '.json'].map((extension) => `${prefixPath}${extension}`);
}
