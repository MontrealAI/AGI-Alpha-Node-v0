import { encode as cborEncode, decode as cborDecode } from 'cborg';
import { getBytes } from 'ethers';
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import type { HexData } from './intentTypes.js';

export type DilithiumParameterSet = 0 | 1 | 2 | 3;

export interface EnvelopeMetadata {
  guardianId?: string;
  issuedAt?: string;
  note?: string;
}

export interface SignedIntentEnvelope {
  version: 1;
  algorithm: 'dilithium';
  parameterSet: DilithiumParameterSet;
  digest: HexData;
  publicKey: string;
  signature: string;
  metadata?: EnvelopeMetadata;
}

export interface SignIntentParams {
  digest: HexData;
  privateKey: Uint8Array | string;
  publicKey: Uint8Array | string;
  parameterSet?: DilithiumParameterSet;
  metadata?: EnvelopeMetadata;
}

export interface VerificationResult {
  valid: boolean;
  reason?: string;
}

export interface GuardianKeyPair {
  parameterSet: DilithiumParameterSet;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

const require = createRequire(import.meta.url);
let dilithiumInstancePromise: Promise<any> | null = null;

async function loadDilithiumModule() {
  if (!dilithiumInstancePromise) {
    dilithiumInstancePromise = (async () => {
      const factoryPromise = require('dilithium-crystals-js');
      if (!factoryPromise || typeof (factoryPromise as Promise<any>).then !== 'function') {
        throw new Error('Dilithium factory did not expose an async initializer.');
      }
      const module = await factoryPromise;
      return module?.default ?? module;
    })();
  }
  return dilithiumInstancePromise;
}

export async function getDilithiumInstance() {
  return loadDilithiumModule();
}

function toBytes(source: Uint8Array | string): Uint8Array {
  if (typeof source === 'string') {
    if (source.startsWith('0x')) {
      return getBytes(source);
    }
    return Buffer.from(source, 'base64');
  }
  return source;
}

export function encodeEnvelopeToCbor(envelope: SignedIntentEnvelope): Uint8Array {
  return cborEncode(envelope);
}

export function decodeEnvelopeFromCbor(payload: Uint8Array | ArrayBuffer): SignedIntentEnvelope {
  const bytes = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
  const decoded = cborDecode(bytes) as SignedIntentEnvelope;
  if (!decoded || decoded.algorithm !== 'dilithium') {
    throw new Error('Envelope is missing or uses an unsupported algorithm.');
  }
  return decoded;
}

export async function signIntentDigest(params: SignIntentParams): Promise<SignedIntentEnvelope> {
  const { digest, privateKey, publicKey, parameterSet = 2, metadata } = params;
  const dilithium = await getDilithiumInstance();
  const message = getBytes(digest);
  const keyBytes = toBytes(privateKey);
  const { signature } = dilithium.sign(message, keyBytes, parameterSet);
  return {
    version: 1,
    algorithm: 'dilithium',
    parameterSet,
    digest,
    publicKey: Buffer.from(toBytes(publicKey)).toString('base64'),
    signature: Buffer.from(signature).toString('base64'),
    metadata
  } satisfies SignedIntentEnvelope;
}

export async function generateGuardianKeyPair(
  parameterSet: DilithiumParameterSet = 2,
  seed?: Uint8Array | string
): Promise<GuardianKeyPair> {
  if (parameterSet < 0 || parameterSet > 3) {
    throw new Error('Dilithium parameter set must be between 0 and 3.');
  }
  const dilithium = await getDilithiumInstance();
  const normalizedSeed = seed ? toBytes(seed) : undefined;
  const { publicKey, privateKey } = dilithium.generateKeys(parameterSet, normalizedSeed);
  return {
    parameterSet,
    publicKey: new Uint8Array(publicKey),
    privateKey: new Uint8Array(privateKey)
  } satisfies GuardianKeyPair;
}

export async function verifySignedEnvelope(
  envelope: SignedIntentEnvelope,
  expectedDigest?: HexData
): Promise<VerificationResult> {
  if (!envelope?.digest) {
    return { valid: false, reason: 'Missing digest' };
  }
  if (expectedDigest && envelope.digest.toLowerCase() !== expectedDigest.toLowerCase()) {
    return { valid: false, reason: 'Digest mismatch' };
  }
  if (!envelope.signature) {
    return { valid: false, reason: 'Missing signature' };
  }
  if (!envelope.publicKey) {
    return { valid: false, reason: 'Missing public key' };
  }
  if (!Number.isInteger(envelope.parameterSet) || envelope.parameterSet < 0 || envelope.parameterSet > 3) {
    return { valid: false, reason: 'Invalid parameter set' };
  }

  try {
    const dilithium = await getDilithiumInstance();
    const message = getBytes(envelope.digest);
    const signature = Buffer.from(envelope.signature, 'base64');
    const publicKey = Buffer.from(envelope.publicKey, 'base64');
    const result = dilithium.verify(signature, message, publicKey, envelope.parameterSet);
    if (result.result !== 0) {
      return { valid: false, reason: 'Signature verification failed' };
    }
    return { valid: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Signature verification failed';
    return { valid: false, reason };
  }
}
