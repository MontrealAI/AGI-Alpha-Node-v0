import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pino, { type Logger } from 'pino';
import { SigningKey } from 'ethers';
import type { NodeIdentity, NodeKeypair, NodePubkey } from './types.js';

export class NodeKeypairError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'NodeKeypairError';
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

export class NodeKeyValidationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'NodeKeyValidationError';
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

export interface LoadKeypairOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly logger?: Logger;
}

const DEFAULT_KEYFILE_ENV = 'ALPHA_NODE_KEYFILE';
const FALLBACK_PRIVATE_KEY_ENV = 'NODE_PRIVATE_KEY';

function normalizePrivateKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new NodeKeypairError('Private key value is empty');
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(trimmed)) {
    throw new NodeKeypairError('Private key must be a 32-byte hex string with 0x prefix');
  }
  return `0x${trimmed.slice(2).toLowerCase()}`;
}

function loadFromFile(path: string): NodeKeypair {
  try {
    const absolutePath = resolve(path);
    const raw = readFileSync(absolutePath, 'utf8');
    const parsed = JSON.parse(raw) as {
      privateKey: string;
      type?: string;
      publicKey?: NodePubkey;
    };

    if (!parsed || typeof parsed.privateKey !== 'string') {
      throw new NodeKeypairError('Keyfile must include a privateKey field');
    }

    const type = (parsed.type ?? 'secp256k1').toLowerCase();
    if (type !== 'secp256k1' && type !== 'ed25519') {
      throw new NodeKeypairError(`Unsupported key type: ${parsed.type}`);
    }

    const privateKey = normalizePrivateKey(parsed.privateKey);
    if (type === 'secp256k1') {
      return {
        type,
        privateKey,
        publicKey: deriveSecp256k1PublicKey(privateKey)
      } satisfies NodeKeypair;
    }

    if (!parsed.publicKey || typeof parsed.publicKey.x !== 'string' || typeof parsed.publicKey.y !== 'string') {
      throw new NodeKeypairError('Ed25519 keyfiles must include a publicKey with x and y coordinates');
    }

    return {
      type: 'ed25519',
      privateKey,
      publicKey: {
        x: parsed.publicKey.x,
        y: parsed.publicKey.y
      }
    } satisfies NodeKeypair;
  } catch (error) {
    if (error instanceof NodeKeypairError) {
      throw error;
    }
    throw new NodeKeypairError('Failed to read keyfile', { cause: error });
  }
}

function deriveSecp256k1PublicKey(privateKey: string): NodePubkey {
  try {
    const signingKey = new SigningKey(privateKey);
    const publicKey = signingKey.publicKey;
    if (!publicKey.startsWith('0x04') || publicKey.length !== 132) {
      throw new Error('Unexpected public key format');
    }
    const body = publicKey.slice(4);
    const x = `0x${body.slice(0, 64)}`;
    const y = `0x${body.slice(64)}`;
    return { x: x.toLowerCase(), y: y.toLowerCase() } satisfies NodePubkey;
  } catch (error) {
    throw new NodeKeypairError('Failed to derive secp256k1 public key', { cause: error });
  }
}

function normalizeLogger(logger?: Logger): Logger {
  return logger ?? pino({ level: 'info', name: 'identity-keys' });
}

export function loadNodeKeypair(options: LoadKeypairOptions = {}): NodeKeypair {
  const env = options.env ?? process.env;
  const logger = normalizeLogger(options.logger);

  if (env[DEFAULT_KEYFILE_ENV]) {
    logger.debug?.({ keyfile: env[DEFAULT_KEYFILE_ENV] }, 'Loading node keypair from keyfile');
    return loadFromFile(env[DEFAULT_KEYFILE_ENV] as string);
  }

  const privateKeyEnv = env[FALLBACK_PRIVATE_KEY_ENV];
  if (typeof privateKeyEnv === 'string' && privateKeyEnv.trim()) {
    logger.debug?.({ source: 'env', variable: FALLBACK_PRIVATE_KEY_ENV }, 'Loading node keypair from environment');
    const privateKey = normalizePrivateKey(privateKeyEnv);
    return {
      type: 'secp256k1',
      privateKey,
      publicKey: deriveSecp256k1PublicKey(privateKey)
    } satisfies NodeKeypair;
  }

  throw new NodeKeypairError(
    `Node keypair not configured. Provide ${DEFAULT_KEYFILE_ENV} or ${FALLBACK_PRIVATE_KEY_ENV}.`
  );
}

function normalizeCoordinate(value: string, label: string): string {
  if (!/^0x[a-f0-9]{64}$/.test(value)) {
    throw new NodeKeyValidationError(`Invalid ${label} coordinate on local keypair`);
  }
  return value;
}

export function validateKeypairAgainstENS(
  nodeIdentity: NodeIdentity,
  keypair: NodeKeypair,
  options: { logger?: Logger } = {}
): boolean {
  const logger = normalizeLogger(options.logger);

  if (keypair.type !== 'secp256k1') {
    const message = `Cannot validate keypair of type ${keypair.type} against ENS pubkey`;
    logger.error({ ensName: nodeIdentity.ensName, keyType: keypair.type }, message);
    throw new NodeKeyValidationError(message);
  }

  const localPubkey = keypair.publicKey ?? deriveSecp256k1PublicKey(keypair.privateKey);
  const normalizedLocal: NodePubkey = {
    x: normalizeCoordinate(localPubkey.x.toLowerCase(), 'x'),
    y: normalizeCoordinate(localPubkey.y.toLowerCase(), 'y')
  };

  const expected: NodePubkey = {
    x: nodeIdentity.pubkey.x.toLowerCase(),
    y: nodeIdentity.pubkey.y.toLowerCase()
  };

  if (normalizedLocal.x !== expected.x || normalizedLocal.y !== expected.y) {
    const message = `Local keypair does not match ENS pubkey for ${nodeIdentity.ensName}`;
    logger.error({ ensName: nodeIdentity.ensName, expected, actual: normalizedLocal }, message);
    throw new NodeKeyValidationError(message);
  }

  logger.debug?.({ ensName: nodeIdentity.ensName }, 'Local keypair matches ENS pubkey');
  return true;
}
