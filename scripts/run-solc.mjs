#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

async function removeStrayArtifacts(root) {
  const entries = await readdir(root);
  const stray = entries.filter((name) => /^contracts_.*\.(abi|bin)$/.test(name));
  await Promise.all(
    stray.map((name) => rm(resolve(root, name), { force: true }))
  );
}

async function run() {
  const root = process.cwd();
  const outputDir = resolve(root, 'build/solc');

  await removeStrayArtifacts(root);
  await mkdir(outputDir, { recursive: true });

  const args = [
    '--base-path',
    '.',
    '--include-path',
    'node_modules',
    '--bin',
    '--abi',
    '--output-dir',
    outputDir,
    'contracts/AlphaNodeManager.sol'
  ];

  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('solcjs', args, {
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });

    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`solcjs exited with code ${code}`));
      }
    });
  });
}

try {
  await run();
} catch (error) {
  console.error('[solcjs] failed to compile AlphaNodeManager.sol');
  if (error) {
    console.error(error);
  }
  process.exitCode = 1;
}
