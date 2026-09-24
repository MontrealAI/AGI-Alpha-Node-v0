import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { Command } from 'commander';
import { Wallet } from 'ethers';
import {
  initializeNode,
  runMission,
  exportMission,
} from '../src/alpha/node.js';

const options = new Command()
  .requiredOption('--server <file>', 'llama-server executable')
  .requiredOption('--model <file>', 'GGUF model')
  .requiredOption('--model-sha256 <hash>', 'Expected model SHA-256')
  .requiredOption('--revision <id>', 'Immutable model revision')
  .requiredOption('--runtime <version>', 'Runtime build identifier')
  .option('--port <number>', 'Unused loopback port', '18081')
  .requiredOption('--out <directory>', 'Evidence output')
  .parse()
  .opts();
const port = Number(options.port);
if (
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535 ||
  !/^[a-f0-9]{64}$/.test(options.modelSha256)
)
  throw new Error('Invalid port or hash');
const hash = createHash('sha256');
let bytes = 0;
for await (const chunk of createReadStream(options.model)) {
  hash.update(chunk);
  bytes += chunk.length;
}
if (hash.digest('hex') !== options.modelSha256)
  throw new Error('Model hash mismatch');
const out = resolve(options.out);
await mkdir(out, { recursive: true });
const dir = await mkdtemp(join(tmpdir(), 'alpha-real-model-'));
process.env.ALPHA_QUALIFICATION_MODEL_KEY = randomBytes(24).toString('hex');
const log = createWriteStream(join(dir, 'server.log'));
const server = spawn(
  resolve(options.server),
  [
    '-m',
    resolve(options.model),
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--ctx-size',
    '8192',
    '--threads',
    '4',
    '--reasoning',
    'off',
    '--api-key',
    process.env.ALPHA_QUALIFICATION_MODEL_KEY,
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
let startupError;
server.on('error', (error) => {
  startupError = error;
});
server.stdout.pipe(log);
server.stderr.pipe(log);
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (startupError) throw startupError;
    if (server.exitCode !== null)
      throw new Error('Model server exited before readiness');
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!ready) throw new Error('Model server failed to become ready');
  await initializeNode(dir, {
    ensName: 'model.alpha.node.agi.eth',
    reviewer: Wallet.createRandom().address,
  });
  const config = JSON.parse(await readFile(join(dir, 'config.json')));
  config.provider = {
    url: `http://127.0.0.1:${port}/v1/chat/completions`,
    model: 'qualified-local-model',
    maxTokens: 1536,
    keyEnv: 'ALPHA_QUALIFICATION_MODEL_KEY',
  };
  await writeFile(join(dir, 'config.json'), JSON.stringify(config));
  const mission = JSON.parse(
    await readFile(
      new URL('../examples/alpha/opportunity-scan.json', import.meta.url),
    ),
  );
  const start = Date.now();
  const run = await runMission(dir, mission);
  await exportMission(dir, mission.id, out);
  const result = {
    actualInference: true,
    syntheticMission: true,
    paidProvider: false,
    elapsedMs: Date.now() - start,
    provider: run.provider,
    provenance: {
      revision: options.revision,
      sha256: options.modelSha256,
      bytes,
      runtime: options.runtime,
    },
    limitations: [
      'Single real-model integration run; not a general intelligence or model-quality certification',
      'Economic source assumptions are synthetic',
      'No production deployment or payment',
    ],
  };
  await writeFile(
    join(out, 'execution.json'),
    JSON.stringify(result, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({
      actualInference: true,
      elapsedMs: result.elapsedMs,
      model: run.provider.model,
      usage: run.provider.usage,
    }),
  );
} finally {
  server.kill('SIGTERM');
  log.end();
  delete process.env.ALPHA_QUALIFICATION_MODEL_KEY;
  await rm(dir, { recursive: true, force: true });
}
