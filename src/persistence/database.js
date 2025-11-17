import Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inferMigrationVersion, seedAll } from './seeds.js';
import { getConfig } from '../config/env.js';

const BASE_PATH = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_PATH = join(BASE_PATH, 'migrations');
const DEFAULT_DB = (() => {
  try {
    const config = getConfig();
    return config.AGI_ALPHA_DB_PATH || ':memory:';
  } catch (error) {
    return process.env.AGI_ALPHA_DB_PATH || ':memory:';
  }
})();

export function openDatabase({ filename = DEFAULT_DB } = {}) {
  const db = new Database(filename, { verbose: undefined });
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function ensureMigrations(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime(\'now\')))');

  const seenVersions = new Set(
    db
      .prepare('SELECT version FROM schema_migrations ORDER BY version ASC')
      .all()
      .map((row) => row.version)
  );

  const migrationFiles = readdirSync(MIGRATIONS_PATH)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const migrationFile of migrationFiles) {
    const migrationPath = join(MIGRATIONS_PATH, migrationFile);
    const version = inferMigrationVersion(new URL(migrationPath, import.meta.url));
    if (seenVersions.has(version)) {
      continue;
    }

    const sql = readFileSync(migrationPath, 'utf8');
    const apply = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version);
    });
    apply();
  }
}

export function initializeDatabase({ filename = DEFAULT_DB, withSeed = false } = {}) {
  const db = openDatabase({ filename });
  ensureMigrations(db);
  if (withSeed) {
    seedAll(db);
  }
  return db;
}
