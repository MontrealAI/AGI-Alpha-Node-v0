#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command } from 'commander';
import { dataSlice, id } from 'ethers';
import {
  normalizeIntent,
  ensureHex,
  ZERO_ADDRESS,
  type TreasuryIntentV1
} from '../../src/treasury/intentTypes.js';
import {
  digestTreasuryIntent,
  EXECUTE_TRANSACTION_SIGNATURE,
  EXECUTE_TRANSACTION_SELECTOR
} from '../../src/treasury/intentEncoding.js';
import { signIntentDigest, type EnvelopeMetadata } from '../../src/treasury/pqEnvelope.js';
import {
  deriveEnvelopeBasename,
  loadKeyMaterial,
  persistEnvelope,
  planEnvelopeOutputs,
  type KeyEncoding
} from '../../src/treasury/signingSupport.js';

interface CliOptions {
  intent?: string;
  digest?: string;
  chainId: bigint;
  contract?: string;
  functionSignature?: string;
  domainVersion: number;
  selectorOnly: boolean;
  parameterSet: number;
  privateKey?: string;
  publicKey?: string;
  privateKeyEncoding: KeyEncoding;
  publicKeyEncoding: KeyEncoding;
  guardianId?: string;
  note?: string;
  issuedAt?: string;
  outputDir?: string;
  out?: string;
  jsonOut?: string;
  emitJson: boolean;
}

const program = new Command();
program
  .name('sign-intent')
  .description('Sign TreasuryIntentV1 payloads with Dilithium keys and emit CBOR envelopes.')
  .option('--intent <file>', 'Path to the TreasuryIntentV1 JSON file.')
  .option('--digest <hex>', 'Digest to sign (overrides --intent when provided).')
  .option('--chain-id <id>', 'Chain id for domain binding', (value) => BigInt(value), 0n)
  .option('--contract <address>', 'Treasury contract address used for domain binding', process.env.TREASURY_ADDRESS)
  .option('--function-signature <sig>', 'Function signature for selector binding', EXECUTE_TRANSACTION_SIGNATURE)
  .option('--domain-version <version>', 'Domain version tag', (value) => Number.parseInt(value, 10), 1)
  .option('--selector-only', 'Exclude domain fields other than selector', false)
  .option('--parameter-set <index>', 'Dilithium parameter set (0-3)', (value) => Number.parseInt(value, 10), 2)
  .option('--private-key <value>', 'Guardian private key (base64, hex, or file path)', process.env.GUARDIAN_PRIVATE_KEY)
  .option('--private-key-encoding <mode>', 'Force private key encoding (hex|base64|auto)', 'auto')
  .option('--public-key <value>', 'Guardian public key (base64, hex, or file path)', process.env.GUARDIAN_PUBLIC_KEY)
  .option('--public-key-encoding <mode>', 'Force public key encoding (hex|base64|auto)', 'auto')
  .option('--guardian-id <id>', 'Guardian identifier to embed in metadata')
  .option('--note <text>', 'Optional metadata note to embed in the envelope')
  .option('--issued-at <iso>', 'Override issuedAt timestamp (ISO-8601)')
  .option('--output-dir <dir>', 'Directory for generated envelopes', './envelopes')
  .option('--out <file>', 'Explicit CBOR output path')
  .option('--json-out <file>', 'Explicit JSON output path')
  .option('--emit-json', 'Emit JSON envelope in addition to CBOR', false)
  .showHelpAfterError();

async function main() {
  const options = program.parse(process.argv).opts<CliOptions>();
  if (!options.digest && !options.intent) {
    throw new Error('Provide either --digest or --intent.');
  }
  if (!options.privateKey) {
    throw new Error('Guardian private key is required (--private-key or GUARDIAN_PRIVATE_KEY).');
  }
  if (!options.publicKey) {
    throw new Error('Guardian public key is required (--public-key or GUARDIAN_PUBLIC_KEY).');
  }

  let digest: `0x${string}`;
  let intent: TreasuryIntentV1 | undefined;
  if (options.digest) {
    digest = ensureHex(options.digest);
  } else {
    const intentPath = resolve(options.intent!);
    const rawIntent = JSON.parse(readFileSync(intentPath, 'utf8')) as Partial<TreasuryIntentV1>;
    intent = normalizeIntent(rawIntent);
    const selector = options.functionSignature
      ? (dataSlice(id(options.functionSignature), 0, 4) as `0x${string}`)
      : EXECUTE_TRANSACTION_SELECTOR;
    const domain = options.selectorOnly
      ? { includeSelector: true, functionSelector: selector }
      : {
          chainId: options.chainId,
          contractAddress: options.contract ?? ZERO_ADDRESS,
          version: options.domainVersion,
          functionSelector: selector,
          includeSelector: true
        };
    digest = digestTreasuryIntent(intent, { domain });
  }

  const parameterSet = Number.isInteger(options.parameterSet) ? options.parameterSet : 2;
  if (parameterSet < 0 || parameterSet > 3) {
    throw new Error('Parameter set must be between 0 and 3.');
  }

  const privateKey = loadKeyMaterial(options.privateKey, {
    encoding: options.privateKeyEncoding,
    description: 'Guardian private key is required.'
  });
  const publicKey = loadKeyMaterial(options.publicKey, {
    encoding: options.publicKeyEncoding,
    description: 'Guardian public key is required.'
  });

  const metadata: EnvelopeMetadata | undefined = options.guardianId || options.note || options.issuedAt
    ? {
        guardianId: options.guardianId,
        issuedAt: options.issuedAt ?? new Date().toISOString(),
        note: options.note
      }
    : undefined;

  const envelope = await signIntentDigest({
    digest,
    privateKey,
    publicKey,
    parameterSet: parameterSet as 0 | 1 | 2 | 3,
    metadata
  });

  const basename = options.out
    ? undefined
    : deriveEnvelopeBasename(digest, options.guardianId ?? metadata?.guardianId);
  const outputPlan = options.out
    ? {
        cborPath: resolve(options.out),
        jsonPath:
          options.jsonOut
            ? resolve(options.jsonOut)
            : options.emitJson
            ? resolve(`${options.out}.json`)
            : undefined
      }
    : planEnvelopeOutputs({
        directory: options.outputDir,
        basename,
        digest,
        guardianId: options.guardianId ?? metadata?.guardianId,
        emitJson: options.emitJson || Boolean(options.jsonOut)
      });

  persistEnvelope(envelope, outputPlan.cborPath, 'cbor');
  if (outputPlan.jsonPath) {
    persistEnvelope(envelope, outputPlan.jsonPath, 'json');
  } else if (options.jsonOut) {
    persistEnvelope(envelope, resolve(options.jsonOut), 'json');
  }

  console.log(`Intent digest: ${digest}`);
  if (intent) {
    console.log(`Intent target: ${intent.to} (value ${intent.value} wei)`);
  }
  console.log(`CBOR envelope saved to ${outputPlan.cborPath}`);
  if (outputPlan.jsonPath || options.jsonOut) {
    const jsonPath = outputPlan.jsonPath ?? resolve(options.jsonOut!);
    console.log(`JSON envelope saved to ${jsonPath}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
