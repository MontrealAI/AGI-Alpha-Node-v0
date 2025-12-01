import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const vitestBin = require.resolve('vitest/vitest.mjs');

function translateArgs(args) {
  const forwarded = [];
  let runInBand = false;

  for (const arg of args) {
    if (arg === '--runInBand' || arg === '-i') {
      runInBand = true;
      continue;
    }
    forwarded.push(arg);
  }

  if (runInBand) {
    forwarded.push('--pool=threads', '--poolOptions.threads.singleThread=true');
  }

  return forwarded;
}

function run() {
  const args = translateArgs(process.argv.slice(2));
  const child = spawn(process.execPath, [vitestBin, ...args], {
    stdio: 'inherit',
    env: process.env
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

run();
