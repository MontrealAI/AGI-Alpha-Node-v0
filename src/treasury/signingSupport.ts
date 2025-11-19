import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import type { HexData } from './intentTypes.js';
import { encodeEnvelopeToCbor, type SignedIntentEnvelope } from './pqEnvelope.js';

export type KeyEncoding = 'auto' | 'hex' | 'base64';
export type EnvelopeFormat = 'cbor' | 'json';

interface LoadKeyOptions {
  encoding?: KeyEncoding;
  description?: string;
}

function decodeFromString(source: string, encoding: KeyEncoding = 'auto'): Uint8Array {
  const trimmed = source.trim();
  const mode: 'hex' | 'base64' = encoding === 'auto'
    ? trimmed.toLowerCase().startsWith('0x')
      ? 'hex'
      : 'base64'
    : encoding;
  if (mode === 'hex') {
    const normalized = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
    if (normalized.length === 0 || normalized.length % 2 !== 0) {
      throw new Error('Hex key material must be a non-empty even-length string.');
    }
    return new Uint8Array(Buffer.from(normalized, 'hex'));
  }
  return new Uint8Array(Buffer.from(trimmed, 'base64'));
}

export function loadKeyMaterial(source: string, options: LoadKeyOptions = {}): Uint8Array {
  if (!source) {
    throw new Error(options.description ?? 'Key material is required.');
  }
  const candidatePath = resolve(source);
  if (existsSync(candidatePath)) {
    const fileContents = readFileSync(candidatePath);
    return new Uint8Array(fileContents);
  }
  return decodeFromString(source, options.encoding ?? 'auto');
}

export function deriveEnvelopeBasename(digest: HexData, guardianId?: string): string {
  const prefix = digest.toLowerCase().replace(/^0x/, '').slice(0, 8);
  const suffix = guardianId
    ? guardianId
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/gi, '-') || 'guardian'
    : 'guardian';
  return `${prefix}-${suffix}`;
}

export interface OutputPlanOptions {
  directory?: string;
  basename?: string;
  digest: HexData;
  guardianId?: string;
  emitJson?: boolean;
}

export interface OutputPlan {
  cborPath: string;
  jsonPath?: string;
}

export function planEnvelopeOutputs(options: OutputPlanOptions): OutputPlan {
  const directory = resolve(options.directory ?? '.');
  const base = options.basename ?? deriveEnvelopeBasename(options.digest, options.guardianId);
  const cborPath = resolve(directory, `${base}.cbor`);
  const jsonPath = options.emitJson ? resolve(directory, `${base}.json`) : undefined;
  return { cborPath, jsonPath };
}

export function persistEnvelope(
  envelope: SignedIntentEnvelope,
  outputPath: string,
  format: EnvelopeFormat
): void {
  const absolutePath = resolve(outputPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  if (format === 'json') {
    writeFileSync(absolutePath, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
    return;
  }
  const payload = encodeEnvelopeToCbor(envelope);
  writeFileSync(absolutePath, Buffer.from(payload));
}
