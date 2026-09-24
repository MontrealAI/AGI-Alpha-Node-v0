import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { Wallet } from 'ethers';
import {
  initializeNode,
  loadNode,
  exportMission,
  signDetachedReview,
  importDetachedReview,
  signOutcome,
  importOutcome,
  outcomeSummary,
} from '../src/alpha/node.js';
import { operate } from '../src/alpha/runtime/engine.js';

const out = resolve(process.argv[2] ?? 'alpha-runtime-output');
await mkdir(out, { recursive: true });
const dir = await mkdtemp(join(tmpdir(), 'alpha-runtime-demo-'));
let peer;
let health;
try {
  const reviewer = Wallet.createRandom();
  const node = await initializeNode(dir, {
    ensName: 'runtime.alpha.node.agi.eth',
    reviewer: reviewer.address,
  });
  const peerDir = join(dir, 'peer');
  const peerConfig = await initializeNode(peerDir, {
    ensName: 'specialist.alpha.node.agi.eth',
  });
  await writeFile(
    join(peerDir, 'specialist.json'),
    JSON.stringify({
      allowedCallers: [node.address],
      capabilities: ['risk-review'],
      priceMicroUsd: 0,
      maxDailyRequests: 3,
    }),
  );
  peer = spawn(
    process.execPath,
    [
      fileURLToPath(new URL('../src/alpha/cli.js', import.meta.url)),
      '--home',
      peerDir,
      'specialist',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const peerInfo = await new Promise((accept, reject) => {
    let text = '';
    const timer = setTimeout(
      () => reject(new Error('Specialist startup timed out')),
      10000,
    );
    peer.once('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    peer.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Specialist exited: ${code}`));
    });
    peer.stdout.on('data', (chunk) => {
      text += chunk;
      try {
        const info = JSON.parse(text);
        clearTimeout(timer);
        accept(info);
      } catch {}
    });
  });
  await writeFile(
    join(dir, 'service.json'),
    JSON.stringify({ cacheEnabled: false }),
  );
  health = createServer(async (_, response) => {
    try {
      const current = JSON.parse(await readFile(join(dir, 'service.json')));
      response.end(JSON.stringify({ healthy: current.cacheEnabled === true }));
    } catch {
      response.writeHead(500);
      response.end();
    }
  });
  await new Promise((r) => health.listen(0, '127.0.0.1', r));
  const pipeline = JSON.parse(
    await readFile(new URL('../examples/alpha/pipeline.json', import.meta.url)),
  );
  await writeFile(join(dir, 'pipeline.json'), JSON.stringify(pipeline));
  await writeFile(
    join(dir, 'usage.json'),
    JSON.stringify({
      schema: 1,
      observedAt: new Date().toISOString(),
      period: 'Synthetic example period',
      services: [
        {
          id: 'inference',
          name: 'Example inference',
          requests: 1000,
          repeatedRequests: 600,
          costUsd: 500,
        },
      ],
    }),
  );
  await writeFile(
    join(dir, 'engine.json'),
    JSON.stringify({
      schema: 1,
      adaptive: { enabled: true },
      peers: [{ address: peerConfig.address, url: peerInfo.url }],
      specialistCapabilities: ['risk-review'],
      maxSpecialistPriceMicroUsd: 0,
      actions: {
        'cache-inference': {
          kind: 'json-set',
          root: dir,
          file: 'service.json',
          pointer: ['cacheEnabled'],
          value: true,
          healthUrl: `http://127.0.0.1:${health.address().port}/health`,
          healthField: 'healthy',
          healthValue: true,
          timeoutMs: 1000,
        },
      },
      maxDailyActions: 1,
    }),
  );
  const first = await operate(dir);
  const missionId = first.discovery.missionId;
  const exported = await exportMission(dir, missionId, out);
  const bundle = JSON.parse(await readFile(exported.evidence));
  await importDetachedReview(
    dir,
    await signDetachedReview(
      bundle,
      'accepted',
      'Synthetic reviewer role approved exact file change and assumptions for this demonstration.',
      reviewer.privateKey,
    ),
  );
  const second = await operate(dir);
  if (
    second.progress[0]?.status !== 'applied' ||
    !JSON.parse(await readFile(join(dir, 'service.json'))).cacheEnabled
  )
    throw new Error('Demo action failed');
  await exportMission(dir, missionId, out);
  const reviewed = JSON.parse(await readFile(exported.evidence));
  await importOutcome(
    dir,
    await signOutcome(
      reviewed,
      {
        measuredBenefitUsd: 90,
        measuredCostUsd: 20,
        observedAt: new Date().toISOString(),
        evidence:
          'Synthetic measurement to demonstrate the signed outcome path; not measured savings.',
      },
      reviewer.privateKey,
    ),
  );
  await exportMission(dir, missionId, out);
  const loaded = await loadNode(dir);
  const result = {
    schema: 1,
    realFileChange: true,
    separateSpecialistProcess: true,
    realHttpExchange: true,
    signedReview: true,
    missionId,
    actionStatus: second.progress[0].status,
    replay: (await operate(dir)).discovery.status,
    outcomes: outcomeSummary(loaded),
    limitations: [
      'Synthetic usage and outcome values',
      'Reviewer role controlled by the demo, not an independent person',
      'No live ENS, model inference or token transfers in this demo',
    ],
    runtime: [...loaded.runtime.values()],
  };
  await writeFile(
    join(out, 'runtime.json'),
    JSON.stringify(result, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({
      output: out,
      missionId,
      actionStatus: result.actionStatus,
      separateSpecialistProcess: true,
      replay: result.replay,
    }),
  );
} finally {
  if (peer && peer.exitCode === null) {
    const ended = new Promise((r) => peer.once('exit', r));
    peer.kill('SIGTERM');
    await ended;
  }
  if (health) {
    health.closeAllConnections();
    await new Promise((r) => health.close(r));
  }
  await rm(dir, { recursive: true, force: true });
}
