import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initializeDatabase } from '../src/persistence/database.js';

const TMP_PREFIX = join(tmpdir(), 'agi-alpha-db-');

describe('database file initialization', () => {
  let tempRoot;

  afterEach(() => {
    if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = undefined;
    }
  });

  it('creates parent directories for sqlite file targets', () => {
    tempRoot = mkdtempSync(TMP_PREFIX);
    const nestedPath = join(tempRoot, 'nested', 'paths', 'db.sqlite');

    expect(existsSync(join(tempRoot, 'nested', 'paths'))).toBe(false);

    const db = initializeDatabase({ filename: nestedPath });
    db.close();

    expect(existsSync(nestedPath)).toBe(true);
  });
});
