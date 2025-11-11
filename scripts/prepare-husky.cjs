#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

function hasHusky() {
  try {
    require.resolve('husky/package.json');
    return true;
  } catch (error) {
    if (error && (error.code === 'MODULE_NOT_FOUND' || error.code === 'ERR_MODULE_NOT_FOUND')) {
      return false;
    }
    throw error;
  }
}

if (!hasHusky()) {
  console.log('husky not installed; skipping prepare step.');
  process.exit(0);
}

const huskyBin = require.resolve('husky/bin.js');
const result = spawnSync(process.execPath, [huskyBin, 'install'], {
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 0);
