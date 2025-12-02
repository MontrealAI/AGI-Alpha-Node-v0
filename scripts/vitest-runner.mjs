import { runVitest } from './lib/vitest-runner.js';

async function run() {
  try {
    const { code, signal } = await runVitest(process.argv.slice(2));

    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code);
  } catch (error) {
    console.error('[vitest-runner] Unable to start Vitest process');
    if (error) {
      console.error(error);
    }
    process.exit(1);
  }
}

run();
