#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

function resolveHuskyBin() {
  try {
    const huskyEntry = require.resolve('husky');
    const huskyDir = path.dirname(huskyEntry);
    const huskyBin = path.join(huskyDir, 'bin.js');

    if (!existsSync(huskyBin)) {
      return null;
    }

    return huskyBin;
  } catch (error) {
    if (error && (error.code === 'MODULE_NOT_FOUND' || error.code === 'ERR_MODULE_NOT_FOUND')) {
      return null;
    }
    throw error;
  }
}

const huskyBin = resolveHuskyBin();

if (!huskyBin) {
  console.log('husky not installed; skipping prepare step.');
  process.exit(0);
}

const result = spawnSync(process.execPath, [huskyBin, 'install'], {
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 0);
