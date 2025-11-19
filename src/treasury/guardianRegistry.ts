import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DilithiumParameterSet, SignedIntentEnvelope } from './pqEnvelope.js';

export interface GuardianRecord {
  id: string;
  publicKey: string;
  parameterSet: DilithiumParameterSet;
  weight?: number;
  revoked?: boolean;
}

export class GuardianRegistry {
  #guardians: Map<string, GuardianRecord>;
  #byPublicKey: Map<string, GuardianRecord>;

  constructor(records: GuardianRecord[]) {
    this.#guardians = new Map();
    this.#byPublicKey = new Map();
    for (const record of records) {
      if (!record.id || !record.publicKey) {
        throw new Error('Guardian record must include id and publicKey.');
      }
      if (record.revoked) {
        continue;
      }
      const normalizedKey = record.publicKey.trim();
      if (this.#guardians.has(record.id)) {
        throw new Error(`Duplicate guardian id detected: ${record.id}`);
      }
      if (this.#byPublicKey.has(normalizedKey)) {
        throw new Error(`Guardian public key reused: ${normalizedKey}`);
      }
      this.#guardians.set(record.id, { ...record, publicKey: normalizedKey });
      this.#byPublicKey.set(normalizedKey, { ...record, publicKey: normalizedKey });
    }
  }

  static fromConfigFile(filePath: string): GuardianRegistry {
    const absolutePath = resolve(filePath);
    const data = JSON.parse(readFileSync(absolutePath, 'utf8')) as GuardianRecord[];
    return new GuardianRegistry(data);
  }

  has(id: string): boolean {
    return this.#guardians.has(id);
  }

  get(id: string): GuardianRecord | undefined {
    return this.#guardians.get(id);
  }

  findByEnvelope(envelope: SignedIntentEnvelope): GuardianRecord | undefined {
    const normalizedPublicKey = envelope.publicKey?.trim();
    const guardianId = envelope.metadata?.guardianId;

    if (guardianId) {
      const guardian = this.#guardians.get(guardianId);
      if (!guardian) {
        return undefined;
      }
      if (!normalizedPublicKey || guardian.publicKey !== normalizedPublicKey) {
        return undefined;
      }
      return guardian;
    }

    if (!normalizedPublicKey) {
      return undefined;
    }

    return this.#byPublicKey.get(normalizedPublicKey);
  }

  list(): GuardianRecord[] {
    return [...this.#guardians.values()];
  }
}
