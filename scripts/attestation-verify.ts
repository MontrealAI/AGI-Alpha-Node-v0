#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command } from 'commander';
import pino from 'pino';
import type { NodeIdentity } from '../src/identity/types.js';
import { serializeSignedAttestation, type SignedHealthAttestation } from '../src/attestation/schema.js';
import { verifyAgainstENS, verifyAttestation } from '../src/attestation/verify.js';

function loadIdentityFromFile(path: string): NodeIdentity {
  const absolutePath = resolve(path);
  const raw = readFileSync(absolutePath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<NodeIdentity>;
  if (
    !parsed ||
    typeof parsed.ensName !== 'string' ||
    typeof parsed.peerId !== 'string' ||
    !parsed.pubkey ||
    typeof parsed.pubkey.x !== 'string' ||
    typeof parsed.pubkey.y !== 'string' ||
    !Array.isArray(parsed.multiaddrs)
  ) {
    throw new Error('Identity file must include ensName, peerId, pubkey.x, pubkey.y, and multiaddrs');
  }
  return {
    ensName: parsed.ensName,
    peerId: parsed.peerId,
    pubkey: { x: parsed.pubkey.x, y: parsed.pubkey.y },
    fuses: parsed.fuses,
    expiry: parsed.expiry,
    multiaddrs: [...parsed.multiaddrs],
    metadata: parsed.metadata ?? {}
  };
}

async function main(argv: string[]): Promise<void> {
  const program = new Command()
    .name('attestation-verify')
    .description('Verify signed health attestations against ENS or a local NodeIdentity file')
    .requiredOption('-f, --file <path>', 'Path to signed attestation JSON file')
    .option('-e, --ens <name>', 'ENS name to verify against (defaults to attestation.ensName)')
    .option('-i, --identity <path>', 'Local NodeIdentity JSON to avoid ENS lookups')
    .option('--print', 'Pretty-print the normalized signed attestation', false)
    .option('-q, --quiet', 'Suppress info logs (errors only)', false);

  program.action(async (options) => {
    const logger = pino({ level: options.quiet ? 'error' : 'info', name: 'attestation-verify' });

    let signed: SignedHealthAttestation;
    try {
      const raw = readFileSync(resolve(options.file), 'utf8');
      signed = JSON.parse(raw) as SignedHealthAttestation;
      logger.debug?.({ file: options.file }, 'Loaded signed attestation');
    } catch (error) {
      logger.error({ err: error, file: options.file }, 'Failed to read signed attestation file');
      process.exitCode = 1;
      return;
    }

    const ensName: string | undefined = options.ens ?? signed?.attestation?.ensName;
    if (!ensName) {
      logger.error('ENS name is required via --ens or embedded attestation.ensName');
      process.exitCode = 1;
      return;
    }

    try {
      let verified = false;
      if (options.identity) {
        const identity = loadIdentityFromFile(options.identity);
        verified = await verifyAttestation(signed, identity);
      } else {
        verified = await verifyAgainstENS(ensName, signed);
      }

      if (verified) {
        logger.info({ ensName }, 'Attestation signature is valid');
        if (options.print) {
          // Serialize with canonical ordering to make signatures reproducible on disk
          process.stdout.write(`${serializeSignedAttestation(signed)}\n`);
        }
      } else {
        logger.error({ ensName }, 'Attestation verification failed');
        process.exitCode = 1;
      }
    } catch (error) {
      logger.error({ err: error, ensName }, 'Attestation verification encountered an error');
      process.exitCode = 1;
    }
  });

  await program.parseAsync(argv);
}

await main(process.argv);
