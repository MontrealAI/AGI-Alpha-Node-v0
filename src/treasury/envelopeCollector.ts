import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SignedIntentEnvelope } from './pqEnvelope.js';
import { decodeEnvelopeFromCbor } from './pqEnvelope.js';

export interface EnvelopeFileReport {
  file: string;
  status: 'parsed' | 'skipped';
  reason?: string;
}

export interface EnvelopeLoadResult {
  envelopes: SignedIntentEnvelope[];
  reports: EnvelopeFileReport[];
}

function tryParseEnvelope(buffer: Buffer): SignedIntentEnvelope | undefined {
  try {
    return decodeEnvelopeFromCbor(buffer);
  } catch (cborError) {
    try {
      return JSON.parse(buffer.toString('utf8')) as SignedIntentEnvelope;
    } catch (jsonError) {
      throw new Error((cborError as Error).message ?? (jsonError as Error).message ?? 'Unable to parse envelope');
    }
  }
}

export function loadEnvelopesFromDirectory(directory: string): EnvelopeLoadResult {
  const envelopeDir = resolve(directory);
  const entries = readdirSync(envelopeDir, { withFileTypes: true });
  const envelopes: SignedIntentEnvelope[] = [];
  const reports: EnvelopeFileReport[] = [];

  for (const entry of entries) {
    const fullPath = resolve(envelopeDir, entry.name);
    if (!entry.isFile() || statSync(fullPath).size === 0) {
      reports.push({ file: fullPath, status: 'skipped', reason: 'Not a regular file or empty payload' });
      continue;
    }

    const buffer = readFileSync(fullPath);
    try {
      const envelope = tryParseEnvelope(buffer);
      if (envelope) {
        envelopes.push(envelope);
        reports.push({ file: fullPath, status: 'parsed' });
      } else {
        reports.push({ file: fullPath, status: 'skipped', reason: 'Envelope payload missing' });
      }
    } catch (error) {
      reports.push({ file: fullPath, status: 'skipped', reason: (error as Error).message });
    }
  }

  return { envelopes, reports } satisfies EnvelopeLoadResult;
}
