import { fileURLToPath } from 'node:url';
import { basename } from 'node:path';

const DEFAULT_TASK_TYPES = [
  { name: 'code-refactor', description: 'Refactors and optimizes code paths', difficulty_coefficient: 1.15 },
  { name: 'research-dossier', description: 'Generates multi-source research briefs', difficulty_coefficient: 1.25 },
  { name: 'data-cleanse', description: 'Cleans and normalizes structured datasets', difficulty_coefficient: 0.95 },
  { name: 'agent-benchmark', description: 'Runs evaluation harness across agents', difficulty_coefficient: 1.35 }
];

const DEFAULT_PROVIDERS = [
  {
    name: 'helios-labs',
    operator_address: '0x0000000000000000000000000000000000000001',
    region: 'na-east',
    sector_tags: ['finance', 'infrastructure'],
    energy_mix: 'hydro-dominant',
    metadata: { latency_ms: 42, diversity: 'multi-cloud' }
  },
  {
    name: 'aurora-intel',
    operator_address: '0x0000000000000000000000000000000000000002',
    region: 'eu-west',
    sector_tags: ['biotech', 'research'],
    energy_mix: 'wind + grid',
    metadata: { latency_ms: 57, compliance: ['gdpr'] }
  }
];

export function seedTaskTypes(db, overrides = DEFAULT_TASK_TYPES) {
  const insert = db.prepare(`
    INSERT INTO task_types (name, description, difficulty_coefficient)
    VALUES (@name, @description, @difficulty_coefficient)
    ON CONFLICT(name) DO UPDATE SET
      description=excluded.description,
      difficulty_coefficient=excluded.difficulty_coefficient,
      updated_at=datetime('now')
  `);
  const run = db.transaction((entries) => {
    for (const entry of entries) {
      insert.run(entry);
    }
  });
  run(overrides);
}

export function seedProviders(db, overrides = DEFAULT_PROVIDERS) {
  const insert = db.prepare(`
    INSERT INTO providers (name, operator_address, region, sector_tags, energy_mix, metadata)
    VALUES (@name, @operator_address, @region, @sector_tags, @energy_mix, @metadata)
    ON CONFLICT(name) DO UPDATE SET
      operator_address=excluded.operator_address,
      region=excluded.region,
      sector_tags=excluded.sector_tags,
      energy_mix=excluded.energy_mix,
      metadata=excluded.metadata,
      updated_at=datetime('now')
  `);
  const run = db.transaction((entries) => {
    for (const entry of entries) {
      insert.run({
        ...entry,
        sector_tags: JSON.stringify(entry.sector_tags ?? []),
        metadata: JSON.stringify(entry.metadata ?? {})
      });
    }
  });
  run(overrides);
}

export function seedAll(db) {
  seedTaskTypes(db);
  seedProviders(db);
}

export function inferMigrationVersion(url) {
  const filename = basename(fileURLToPath(url));
  return filename.replace(/\.[^/.]+$/, '');
}

export { DEFAULT_PROVIDERS, DEFAULT_TASK_TYPES };
