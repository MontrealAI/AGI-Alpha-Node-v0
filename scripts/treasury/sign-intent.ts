#!/usr/bin/env tsx
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import { Command } from 'commander';
import { normalizeIntent, type TreasuryIntentV1, ensureHex } from '../../src/treasury/intentTypes.js';
import type { IntentDomainOptions } from '../../src/treasury/intentTypes.js';
import { digestTreasuryIntent, EXECUTE_TRANSACTION_SIGNATURE } from '../../src/treasury/intentEncoding.js';
import { encodeEnvelopeToCbor } from '../../src/treasury/pqEnvelope.js';
import type { EnvelopeMetadata } from '../../src/treasury/pqEnvelope.js';
import { signIntentWithKeys, computeFunctionSelector } from '../../src/treasury/signingTools.js';

const program = new Command();
program
  .name('treasury:sign')
  .description('Sign a TreasuryIntentV1 digest with Dilithium and emit a CBOR/JSON envelope')
  .argument('[intent]', 'Path to the TreasuryIntentV1 JSON file (omit when using --digest)')
  .option('--digest <hex>', 'Precomputed digest to sign instead of computing from the intent')
  .option('--private-key <key>', 'Guardian private key (base64, hex, or @path)', process.env.GUARDIAN_PRIVATE_KEY)
  .option('--public-key <key>', 'Guardian public key (base64, hex, or @path)', process.env.GUARDIAN_PUBLIC_KEY)
  .option('--guardian-id <id>', 'Guardian identifier stored in envelope metadata', process.env.GUARDIAN_ID)
  .option('--note <text>', 'Optional metadata note for auditing')
  .option('--issued-at <iso>', 'Override the metadata issuedAt timestamp (ISO-8601)')
  .option('--skip-timestamp', 'Do not auto-populate issuedAt when not provided', false)
  .option('--parameter-set <n>', 'Dilithium parameter set (0-3)', (value) => Number.parseInt(value, 10), 2)
  .option('--chain-id <id>', 'Chain id for domain binding', (value) => BigInt(value), process.env.CHAIN_ID ? BigInt(process.env.CHAIN_ID) : 0n)
  .option('--contract <address>', 'Treasury contract address for domain binding', process.env.TREASURY_ADDRESS)
  .option('--domain-version <version>', 'Domain separator version', (value) => Number.parseInt(value, 10), 1)
  .option('--function-signature <signature>', 'Function signature used for selector binding', EXECUTE_TRANSACTION_SIGNATURE)
  .option('--omit-selector', 'Exclude the function selector from the domain binding', false)
  .option('-o, --out <file>', 'Write envelope to file (.cbor or .json)')
  .option('--format <format>', 'Output format when writing to stdout (json|cbor)', 'json')
  .parse(process.argv);

const options = program.opts<{
  digest?: string;
  privateKey?: string;
  publicKey?: string;
  guardianId?: string;
  note?: string;
  issuedAt?: string;
  skipTimestamp?: boolean;
  parameterSet: number;
  chainId: bigint;
  contract?: string;
  domainVersion: number;
  functionSignature: string;
  omitSelector?: boolean;
  out?: string;
  format: string;
}>();

if (!options.privateKey) {
  throw new Error('Guardian private key is required.');
}
if (!options.publicKey) {
  throw new Error('Guardian public key is required.');
}

const intentPath = program.args[0];
if (!intentPath && !options.digest) {
  throw new Error('Provide an intent file or --digest to sign.');
}

const normalizedDigest = options.digest ? ensureHex(options.digest) : undefined;

let intent: TreasuryIntentV1 | undefined;
if (intentPath) {
  const intentRaw = JSON.parse(readFileSync(resolve(intentPath), 'utf8')) as Partial<TreasuryIntentV1>;
  intent = normalizeIntent(intentRaw);
}

const metadata: EnvelopeMetadata = {};
if (options.guardianId) {
  metadata.guardianId = options.guardianId;
}
if (options.note) {
  metadata.note = options.note;
}
if (options.issuedAt) {
  metadata.issuedAt = options.issuedAt;
} else if (!options.skipTimestamp) {
  metadata.issuedAt = new Date().toISOString();
}
const metadataPayload = Object.keys(metadata).length ? metadata : undefined;

const domainOptions = !intent
  ? false
  : {
      chainId: options.chainId,
      contractAddress: options.contract ? ensureHex(options.contract) : undefined,
      version: options.domainVersion,
      functionSelector: computeFunctionSelector(options.functionSignature),
      includeSelector: !options.omitSelector
    } satisfies IntentDomainOptions;

const parameterSet = Number.isInteger(options.parameterSet) ? options.parameterSet : 2;
if (parameterSet < 0 || parameterSet > 3) {
  throw new Error('Dilithium parameter set must be between 0 and 3.');
}

const result = await signIntentWithKeys({
  intent,
  digest: normalizedDigest,
  domain: domainOptions,
  metadata: metadataPayload,
  parameterSet,
  privateKey: loadKeyMaterial(options.privateKey),
  publicKey: loadKeyMaterial(options.publicKey)
});

const cliFormat = options.format?.toLowerCase() === 'cbor' ? 'cbor' : 'json';
const resolvedFormat = resolveFormat(options.out, cliFormat);

if (options.out) {
  const outPath = resolve(options.out);
  mkdirSync(dirname(outPath), { recursive: true });
  if (resolvedFormat === 'cbor') {
    const payload = encodeEnvelopeToCbor(result.envelope);
    writeFileSync(outPath, Buffer.from(payload));
  } else {
    writeFileSync(outPath, `${JSON.stringify(result.envelope, null, 2)}\n`);
  }
  console.log(`Digest: ${result.digest}`);
  console.log(`Envelope written to ${outPath} (${resolvedFormat.toUpperCase()})`);
} else {
  if (resolvedFormat === 'cbor') {
    process.stdout.write(Buffer.from(encodeEnvelopeToCbor(result.envelope)));
  } else {
    console.log(JSON.stringify(result.envelope, null, 2));
  }
}

if (intent && !normalizedDigest) {
  console.log(`Bound digest (domain-aware): ${digestTreasuryIntent(intent, { domain: domainOptions })}`);
}

function loadKeyMaterial(source: string): string {
  const trimmed = source.trim();
  const candidatePath = resolveKeyPath(trimmed);
  if (candidatePath) {
    return readFileSync(candidatePath, 'utf8').trim();
  }
  return trimmed;
}

function resolveKeyPath(input: string): string | undefined {
  if (!input) {
    return undefined;
  }
  if (input.startsWith('@')) {
    return resolve(input.slice(1));
  }
  const potential = resolve(input);
  if (existsSync(potential)) {
    return potential;
  }
  return undefined;
}

function resolveFormat(outPath: string | undefined, cliFormat: 'json' | 'cbor'): 'json' | 'cbor' {
  if (outPath?.toLowerCase().endsWith('.cbor')) {
    return 'cbor';
  }
  if (outPath?.toLowerCase().endsWith('.json')) {
    return 'json';
  }
  return cliFormat === 'cbor' ? 'cbor' : 'json';
}
