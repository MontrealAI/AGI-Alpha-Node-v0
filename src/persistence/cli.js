#!/usr/bin/env node
import { initializeDatabase } from './database.js';
import { seedAll } from './seeds.js';

const command = process.argv[2];

function usage() {
  console.log('Usage: node src/persistence/cli.js <migrate|seed> [dbPath]');
}

try {
  const dbPath = process.argv[3];
  if (!command) {
    usage();
    process.exit(1);
  }

  const db = initializeDatabase({ filename: dbPath, withSeed: false });

  if (command === 'migrate') {
    console.log(`Migrations applied for database ${db.name}`);
    process.exit(0);
  }

  if (command === 'seed') {
    seedAll(db);
    console.log(`Database ${db.name} seeded with task types and providers`);
    process.exit(0);
  }

  usage();
  process.exit(1);
} catch (error) {
  console.error('Database command failed:', error);
  process.exit(1);
}
