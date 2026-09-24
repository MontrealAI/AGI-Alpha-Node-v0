import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
export const vitestBin = resolve(dirname(require.resolve('vitest/package.json')), require('vitest/package.json').bin.vitest);

export function translateArgs(args = []) {
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
    forwarded.push('--maxWorkers=1', '--no-file-parallelism');
  }

  return forwarded;
}

export function runVitest(argv = [], spawnOptions = {}) {
  const args = translateArgs(argv);

  return new Promise((resolve, reject) => {
    let childProcess;

    try {
      childProcess = spawn(process.execPath, [vitestBin, ...args], {
        stdio: 'inherit',
        env: process.env,
        ...spawnOptions
      });
    } catch (error) {
      reject(error);
      return;
    }

    const cleanup = () => {
      childProcess.off('error', handleError);
      childProcess.off('exit', handleExit);
    };

    const handleError = (error) => {
      cleanup();
      reject(error);
    };

    const handleExit = (code, signal) => {
      cleanup();
      resolve({ code: code ?? 1, signal: signal ?? null });
    };

    childProcess.on('error', handleError);
    childProcess.on('exit', handleExit);
  });
}
