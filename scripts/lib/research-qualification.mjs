import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import {
  initializeNode,
  loadNode,
  exportMission,
  verifyEvidenceBundle,
  pauseNode,
} from '../../src/alpha/node.js';
import { operate } from '../../src/alpha/runtime/engine.js';
import {
  backupNode,
  restoreNode,
} from '../../src/alpha/runtime/maintenance.js';
import { qualifyNode } from '../../src/alpha/qualification.js';

export async function qualifyResearch(dir, provider, out) {
  const node = await loadNode(dir),
    processes = [];
  let recoveryRoot;
  const snapshots = [
    'evidence/v3.0.0/validation.json',
    'docs/completion-contract.md',
  ];
  const sources = [];
  for (const [i, file] of snapshots.entries()) {
    const raw = await readFile(
      new URL(`../../${file}`, import.meta.url),
      'utf8',
    );
    const text = file.endsWith('.json')
      ? JSON.stringify(
          (({ results, limitations }) => ({ results, limitations }))(
            JSON.parse(raw),
          ),
        )
      : raw;
    sources.push({ id: `S${i + 1}`, title: file, text });
  }
  const mission = {
    id: 'repository-readiness',
    title: '$AGIALPHA repository readiness review',
    objective:
      'Produce a useful release-readiness brief from actual repository evidence: what is demonstrated, what remains open, and concrete next acceptance experiments. Distinguish tested code from deployed operation. The zero-dollar screening values grant analytical admission only; they are not economic forecasts.',
    sources,
    opportunities: [
      {
        id: 'readiness-review',
        title: 'Analyze the recorded release evidence',
        benefit: 0,
        cost: 0,
        probability: 1,
        downside: 0,
        sourceIds: ['S1', 'S2'],
        rationale:
          'Read-only analysis, no forecasted economic benefit or external action.',
      },
    ],
    policy: {
      maxCost: 0,
      maxDownside: 0,
      minExpectedNet: 0,
      stressBenefitBps: 10000,
    },
    unit: 'USD, no benefit forecast',
  };
  const close = async () => {
    for (const child of processes)
      if (child.exitCode === null) {
        await new Promise((resolve) => {
          const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
          child.once('exit', () => {
            clearTimeout(timer);
            resolve();
          });
          child.kill('SIGTERM');
        });
      }
  };
  try {
    const peers = [];
    for (const [i, capability] of [
      'research-synthesis',
      'adversarial-review',
    ].entries()) {
      const peerDir = join(dir, `peer-${i}`);
      const identity = await initializeNode(peerDir, {
        ensName: `research${i}.alpha.node.agi.eth`,
      });
      const config = JSON.parse(await readFile(join(peerDir, 'config.json')));
      config.provider = provider;
      await writeFile(join(peerDir, 'config.json'), JSON.stringify(config));
      await writeFile(
        join(peerDir, 'specialist.json'),
        JSON.stringify({
          allowedCallers: [node.config.address],
          capabilities: [capability],
          priceMicroUsd: 1,
          maxDailyRequests: 2,
          reserveMicroUsdPerRequest: 1,
          maxDailyReservedMicroUsd: 2,
        }),
      );
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
      processes.push(child);
      const info = await new Promise((resolve, reject) => {
        let text = '';
        const timer = setTimeout(
          () => reject(new Error('Research specialist startup timed out')),
          10000,
        );
        child.once('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.once('exit', (code) => {
          clearTimeout(timer);
          reject(new Error(`Research specialist exited: ${code}`));
        });
        child.stdout.on('data', (chunk) => {
          text += chunk;
          if (text.length > 10000) {
            clearTimeout(timer);
            reject(new Error('Unexpected specialist startup output'));
            return;
          }
          try {
            const info = JSON.parse(text);
            clearTimeout(timer);
            resolve(info);
          } catch {}
        });
      });
      peers.push({ address: identity.address, url: info.url });
    }
    const config = JSON.parse(await readFile(join(dir, 'config.json')));
    config.provider = null;
    await writeFile(join(dir, 'config.json'), JSON.stringify(config));
    const pipeline = JSON.parse(
      await readFile(
        new URL('../../examples/alpha/pipeline.json', import.meta.url),
      ),
    );
    Object.assign(pipeline, {
      sourceKind: 'mission',
      source: 'source.json',
      policy: mission.policy,
    });
    await writeFile(join(dir, 'pipeline.json'), JSON.stringify(pipeline));
    await writeFile(
      join(dir, 'source.json'),
      JSON.stringify({
        schema: 1,
        observedAt: new Date().toISOString(),
        mission,
      }),
    );
    await writeFile(
      join(dir, 'engine.json'),
      JSON.stringify({
        schema: 1,
        peers,
        specialistCapabilities: ['research-synthesis', 'adversarial-review'],
        maxSpecialistPriceMicroUsd: 1,
      }),
    );
    const started = Date.now(),
      result = await operate(dir);
    const exported = await exportMission(dir, result.discovery.missionId, out);
    const bundle = JSON.parse(await readFile(exported.evidence));
    const verification = verifyEvidenceBundle(bundle, {
      expectedNode: node.config.address,
      expectedReviewer: node.config.reviewer,
    });
    const replay = await operate(dir);
    const records = await Promise.all(
      [0, 1].map(
        async (i) =>
          [...(await loadNode(join(dir, `peer-${i}`))).runtime.values()].filter(
            (e) => e.id.endsWith(':reserved'),
          ).length,
      ),
    );
    if (records.some((n) => n !== 1) || replay.discovery.status !== 'replayed')
      throw new Error('Research replay repeated work');
    await close();
    await pauseNode(dir, true);
    const before = await loadNode(dir),
      password = 'temporary-qualification-password-not-for-production';
    recoveryRoot = await mkdtemp(join(tmpdir(), 'alpha-research-recovery-'));
    const backup = join(recoveryRoot, 'backup.json'),
      restore = join(recoveryRoot, 'restored');
    await backupNode(dir, backup, password);
    try {
      await restoreNode(backup, restore, password);
    } finally {
      await rm(backup, { force: true });
    }
    const recovered = await loadNode(restore);
    if (before.head !== recovered.head || !recovered.paused)
      throw new Error('Research recovery verification failed');
    const qualification = await qualifyNode(dir);
    return {
      actualInference: true,
      actualRepositorySources: true,
      paidProvider: false,
      independentPeople: false,
      elapsedMs: Date.now() - started,
      separateSpecialistProcesses: 2,
      verification,
      replay: replay.discovery.status,
      modelCalls: records.reduce((a, b) => a + b, 0),
      specialists: bundle.run.runtimeContext.specialists.map((e) => ({
        address: e.sender,
        capability: e.payload.capability,
        result: e.payload.result,
      })),
      recovery: {
        ledgerHeadMatched: recovered.head === before.head,
        restoredPaused: recovered.paused,
      },
      qualification,
      limitations: [
        'Two separately keyed processes use the same local model; this is not independent human review.',
        'Actual repository-source analysis, not paid buyer acceptance, measured economic benefit, mainnet operation or general intelligence certification.',
        'Reservations and quotes are synthetic micro-dollar allowances; they are not invoices or peer payments.',
      ],
    };
  } finally {
    await close();
    if (recoveryRoot) await rm(recoveryRoot, { recursive: true, force: true });
  }
}
