import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Wallet } from 'ethers';
import {
  initializeNode,
  loadNode,
  atomicJson,
  exportMission,
  readJson,
  signDetachedReview,
  importDetachedReview,
  verifyEvidenceBundle,
  pauseNode,
} from '../../src/alpha/node.js';
import { operate } from '../../src/alpha/runtime/engine.js';
import { verifyWorkFiles, workDigest } from '../../src/alpha/work.js';
import {
  backupNode,
  restoreNode,
} from '../../src/alpha/runtime/maintenance.js';
import {
  qualifyNode,
  softwareFingerprint,
} from '../../src/alpha/qualification.js';

export async function demonstrateWork(root, out, { provider = null } = {}) {
  await mkdir(out, { recursive: true });
  if ((await readdir(out)).length)
    throw new Error(
      'Choose an empty output directory to preserve earlier work evidence',
    );
  const nodeDir = join(root, 'node'),
    peerDir = join(root, 'peer'),
    reviewer = Wallet.createRandom();
  const identity = await initializeNode(nodeDir, {
    ensName: 'work.alpha.node.agi.eth',
    reviewer: reviewer.address,
  });
  const config = (await loadNode(nodeDir)).config;
  config.provider = provider;
  await atomicJson(join(nodeDir, 'config.json'), config);
  const peer = await initializeNode(peerDir, {
    ensName: 'specialist.alpha.node.agi.eth',
  });
  await atomicJson(join(peerDir, 'specialist.json'), {
    allowedCallers: [identity.address],
    capabilities: ['evidence-analysis'],
    priceMicroUsd: 1,
    maxDailyRequests: 10,
  });
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL('../../src/alpha/cli.js', import.meta.url)),
      '--home',
      peerDir,
      'specialist',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const close = async () => {
    if (child.exitCode !== null) return;
    await new Promise((resolve) => {
      const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill('SIGTERM');
    });
  };
  try {
    const peerInfo = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(
        () => reject(new Error('Specialist startup timed out')),
        10000,
      );
      child.once('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Specialist exited ${code}`));
      });
      child.stdout.on('data', (chunk) => {
        output += chunk;
        if (output.length > 10000) {
          clearTimeout(timer);
          reject(new Error('Unexpected specialist output'));
          return;
        }
        try {
          const info = JSON.parse(output);
          clearTimeout(timer);
          resolve(info);
        } catch {}
      });
    });
    const pipeline = JSON.parse(
      await readFile(
        new URL('../../examples/alpha/pipeline.json', import.meta.url),
      ),
    );
    Object.assign(pipeline, {
      sourceKind: 'work',
      source: 'source.json',
      reviewMinutesPerMission: 15,
      maxPendingReviewMinutes: 30,
      maxDailyReviewMinutes: 60,
    });
    pipeline.policy.minExpectedNet = 0;
    await atomicJson(join(nodeDir, 'pipeline.json'), pipeline);
    await atomicJson(join(nodeDir, 'engine.json'), {
      schema: 1,
      peers: [{ address: peer.address, url: peerInfo.url }],
      specialistCapabilities: ['evidence-analysis'],
      maxSpecialistPriceMicroUsd: 1,
    });
    const records = [],
      started = Date.now();
    for (const name of ['invoices', 'allocation', 'quality']) {
      const source = JSON.parse(
        await readFile(
          new URL(`../../examples/alpha/work-${name}.json`, import.meta.url),
        ),
      );
      source.observedAt = new Date().toISOString();
      await atomicJson(join(nodeDir, 'source.json'), source);
      const run = await operate(nodeDir),
        id = run.discovery?.missionId;
      if (run.discovery?.status !== 'awaiting-review')
        throw new Error('Work was not admitted');
      const output = join(out, name);
      await mkdir(output);
      await atomicJson(join(output, 'source.json'), source);
      let bundle = await readJson(
        (await exportMission(nodeDir, id, output)).evidence,
      );
      await importDetachedReview(
        nodeDir,
        await signDetachedReview(
          bundle,
          'accepted',
          'Controlled demonstration role: recomputed structured work, checked supplied inputs and exported artifacts. Not independent human acceptance.',
          reviewer.privateKey,
        ),
      );
      bundle = await readJson(
        (await exportMission(nodeDir, id, output)).evidence,
      );
      const verified = verifyEvidenceBundle(bundle),
        artifacts = await verifyWorkFiles(output, bundle.run.analysis.work);
      const replay = await operate(nodeDir);
      if (replay.discovery?.status !== 'replayed')
        throw new Error('Replay repeated work');
      records.push({
        kind: bundle.run.analysis.work.kind,
        missionId: id,
        runHash: bundle.run.hash,
        resultDigest: workDigest(bundle.run.analysis.work),
        summary: bundle.run.analysis.work.summary,
        provider: bundle.run.provider,
        verification: verified,
        artifacts,
        replay: replay.discovery.status,
      });
    }
    await close();
    const node = await loadNode(nodeDir),
      peerNode = await loadNode(peerDir);
    const peerReservations = [...peerNode.runtime.values()].filter((e) =>
      e.id.endsWith(':reserved'),
    ).length;
    if (node.runs.size !== 3 || peerReservations !== 3)
      throw new Error('Unexpected work replay or specialist reservation count');
    await pauseNode(nodeDir, true);
    const password = Wallet.createRandom().privateKey;
    await backupNode(nodeDir, join(root, 'backup.json'), password);
    await restoreNode(
      join(root, 'backup.json'),
      join(root, 'restored'),
      password,
    );
    const restored = await loadNode(join(root, 'restored'));
    if (!restored.paused || restored.head !== node.head)
      throw new Error('Restored ledger differs or is active');
    const qualification = await qualifyNode(nodeDir);
    if (qualification.gatePassed)
      throw new Error(
        'Synthetic demonstration cannot establish live qualification',
      );
    const result = {
      schema: 1,
      actualExecution: true,
      actualInference: !!provider,
      modelCalls: provider ? 3 : 0,
      elapsedMs: Date.now() - started,
      separateSpecialistProcesses: 1,
      specialistRequests: peerReservations,
      records,
      recovery: { ledgerHeadMatched: true, restoredPaused: true },
      softwareFingerprint: await softwareFingerprint(),
      qualification,
      limitations: [
        'Inputs, estimates and reviewer roles are controlled examples, not buyer invoices or independent people.',
        'Model prioritization selects existing computed facts; this is not a general reasoning benchmark.',
        'No model training, live token payments, mainnet commissioning or measured economic profit.',
      ],
    };
    await writeFile(
      join(out, 'execution.json'),
      JSON.stringify(result, null, 2) + '\n',
    );
    return result;
  } finally {
    await close();
  }
}
