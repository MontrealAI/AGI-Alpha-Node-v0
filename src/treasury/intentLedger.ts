import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { HexData } from './intentTypes.js';
import { ensureHex } from './intentTypes.js';

export interface IntentExecutionRecord {
  digest: HexData;
  at: string;
  txHash?: string;
  approvals?: string[];
  note?: string;
  onChainDigest?: HexData;
}

interface LedgerFileSchema {
  executed: IntentExecutionRecord[];
}

function normalizeDigest(digest: HexData): HexData {
  return ensureHex(digest.toLowerCase());
}

export class IntentLedger {
  readonly path: string;
  #executed: Map<string, IntentExecutionRecord> = new Map();

  constructor(filePath: string) {
    this.path = resolve(filePath);
    this.#load();
  }

  isExecuted(digest: HexData): boolean {
    return this.#executed.has(normalizeDigest(digest));
  }

  getRecord(digest: HexData): IntentExecutionRecord | undefined {
    return this.#executed.get(normalizeDigest(digest));
  }

  recordExecution(
    digest: HexData,
    metadata: Omit<Partial<IntentExecutionRecord>, 'digest' | 'at'> = {}
  ): IntentExecutionRecord {
    const normalized = normalizeDigest(digest);
    const record: IntentExecutionRecord = {
      digest: normalized,
      at: new Date().toISOString(),
      ...metadata,
      approvals: metadata.approvals?.slice()
    };
    this.#executed.set(normalized, record);
    this.#persist();
    return record;
  }

  listExecuted(): IntentExecutionRecord[] {
    return [...this.#executed.values()].sort((a, b) => a.at.localeCompare(b.at));
  }

  #load() {
    if (!existsSync(this.path)) {
      return;
    }
    try {
      const raw = readFileSync(this.path, 'utf8');
      const data = JSON.parse(raw) as LedgerFileSchema;
      if (!data?.executed) {
        return;
      }
      for (const record of data.executed) {
        if (!record?.digest) {
          continue;
        }
        const normalized = normalizeDigest(record.digest as HexData);
        this.#executed.set(normalized, {
          ...record,
          digest: normalized,
          at: record.at ?? new Date(0).toISOString(),
          approvals: record.approvals?.slice()
        });
      }
    } catch (error) {
      console.warn(`IntentLedger: unable to load ${this.path}: ${(error as Error).message}`);
    }
  }

  #persist() {
    mkdirSync(dirname(this.path), { recursive: true });
    const payload: LedgerFileSchema = { executed: this.listExecuted() };
    writeFileSync(this.path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }
}
