import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtemp,
  writeFile,
  readFile,
  rm,
  symlink,
  mkdir,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { Wallet } from 'ethers';
import {
  recordRuntime,
  initializeNode,
  loadNode,
  exportMission,
  signDetachedReview,
  importDetachedReview,
  pauseNode,
  runMission,
  signOutcome,
  importOutcome,
} from '../../src/alpha/node.js';
import {
  measurementContract,
  measurementFixture,
} from './fixtures/measurement.js';
import { planMission } from '../../src/alpha/runtime/planner.js';
import {
  specialistServer,
  coordinateSpecialist,
  verifyEnvelope,
} from '../../src/alpha/runtime/specialists.js';
import { operate } from '../../src/alpha/runtime/engine.js';
import {
  describeAction,
  executeAction,
} from '../../src/alpha/runtime/actions.js';
const fixture = JSON.parse(
  await readFile('examples/alpha/opportunity-scan.json', 'utf8'),
);
const pipeline = JSON.parse(
  await readFile('examples/alpha/pipeline.json', 'utf8'),
);
let dir, reviewer, servers;
const write = (name, value) =>
  writeFile(join(dir, name), JSON.stringify(value));
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'alpha-runtime-'));
  reviewer = Wallet.createRandom();
  servers = [];
  await initializeNode(dir, {
    ensName: 'runtime.alpha.node.agi.eth',
    reviewer: reviewer.address,
  });
});
afterEach(async () => {
  for (const s of servers) {
    s.closeAllConnections();
    await new Promise((r) => s.close(r));
  }
  await rm(dir, { recursive: true, force: true });
});
async function review(id) {
  const out = await exportMission(dir, id, join(dir, 'out'));
  const bundle = JSON.parse(await readFile(out.evidence, 'utf8'));
  await importDetachedReview(
    dir,
    await signDetachedReview(
      bundle,
      'accepted',
      'Fixture role-separated acceptance of the exact proposed action.',
      reviewer.privateKey,
    ),
  );
}
async function health(ok = true) {
  const server = createServer((req, res) =>
    res.end(JSON.stringify({ healthy: ok })),
  );
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}/health`;
}
async function action(ok = true) {
  await write('service.json', { cacheEnabled: false });
  return {
    kind: 'json-set',
    root: dir,
    file: 'service.json',
    pointer: ['cacheEnabled'],
    value: true,
    healthUrl: await health(ok),
    healthField: 'healthy',
    healthValue: true,
    timeoutMs: 1000,
  };
}
async function setupEngine(actionValue, peers = []) {
  await write('pipeline.json', pipeline);
  await write('usage.json', {
    schema: 1,
    observedAt: new Date().toISOString(),
    period: 'Runtime fixture',
    services: [
      {
        id: 'inference',
        name: 'Fixture inference',
        requests: 1000,
        repeatedRequests: 600,
        costUsd: 500,
      },
    ],
  });
  await write('engine.json', {
    schema: 1,
    adaptive: { enabled: true },
    peers,
    specialistCapabilities: peers.length ? ['risk-review'] : [],
    maxSpecialistPriceMicroUsd: 10,
    actions: { 'cache-inference': actionValue },
    maxDailyActions: 2,
  });
}
describe('integrated runtime', () => {
  it('discovers, coordinates a separately keyed HTTP specialist, obtains review, executes a real file change and replays safely', async () => {
    const peerDir = join(dir, 'peer');
    const config = await initializeNode(peerDir, {
      ensName: 'peer.alpha.node.agi.eth',
    });
    const node = await loadNode(dir);
    const peer = await specialistServer(peerDir, {
      allowedCallers: [node.config.address],
      capabilities: ['risk-review'],
      priceMicroUsd: 10,
      maxDailyRequests: 3,
    });
    servers.push(peer.server);
    await setupEngine(await action(), [
      { address: config.address, url: peer.url },
    ]);
    const first = await operate(dir);
    const id = first.discovery.missionId;
    expect(first.discovery.status).toBe('awaiting-review');
    expect(
      JSON.parse(await readFile(join(dir, 'service.json'))).cacheEnabled,
    ).toBe(false);
    const run = (await loadNode(dir)).runs.get(id);
    expect(run.runtimeContext.specialists).toHaveLength(1);
    expect(run.report).toContain('Runtime authorization');
    expect(run.report).toContain(
      JSON.stringify(run.runtimeContext.action, null, 2),
    );
    await review(id);
    const second = await operate(dir);
    expect(second.progress[0].status).toBe('applied');
    expect(
      JSON.parse(await readFile(join(dir, 'service.json'))).cacheEnabled,
    ).toBe(true);
    expect((await operate(dir)).discovery.status).toBe('replayed');
    expect(
      [...(await loadNode(peerDir)).runtime.values()].filter((e) =>
        e.id.endsWith(':result'),
      ),
    ).toHaveLength(1);
  });
  it('rolls back a failed health check and pauses the runtime', async () => {
    await setupEngine(await action(false));
    const first = await operate(dir);
    await review(first.discovery.missionId);
    const result = await operate(dir);
    expect(result.status).toBe('paused-after-rollback');
    expect((await loadNode(dir)).paused).toBe(true);
    expect(
      JSON.parse(await readFile(join(dir, 'service.json'))).cacheEnabled,
    ).toBe(false);
  });
  it('rejects unreviewed actions, external changes and path escapes', async () => {
    const a = await action();
    await setupEngine(a);
    const first = await operate(dir);
    const run = (await loadNode(dir)).runs.get(first.discovery.missionId);
    await expect(
      executeAction(dir, run.mission.id, run.runtimeContext.action),
    ).rejects.toThrow('accepted');
    await review(run.mission.id);
    await write('service.json', { cacheEnabled: false, external: true });
    await expect(
      executeAction(dir, run.mission.id, run.runtimeContext.action),
    ).rejects.toThrow('precondition');
    await expect(
      describeAction({ ...a, file: '../escape.json' }),
    ).rejects.toThrow('inside');
    await symlink(join(dir, 'service.json'), join(dir, 'link.json'));
    await expect(describeAction({ ...a, file: 'link.json' })).rejects.toThrow(
      'Symlink',
    );
  });
  it('recovers an action committed before its completion record without changing the reviewed target again', async () => {
    await setupEngine(await action());
    const result = await operate(dir);
    await review(result.discovery.missionId);
    const node = await loadNode(dir);
    const run = node.runs.get(result.discovery.missionId);
    const descriptor = run.runtimeContext.action;
    const before = await readFile(join(dir, 'service.json'), 'utf8');
    await mkdir(join(dir, 'action-backups'), { mode: 0o700 });
    await writeFile(join(dir, 'action-backups', `${run.hash}.json`), before);
    await recordRuntime(dir, 'action-prepared', `action:${run.hash}:prepared`, {
      missionId: run.mission.id,
      descriptor,
    });
    await writeFile(
      join(dir, 'service.json'),
      JSON.stringify({ cacheEnabled: true }, null, 2) + '\n',
    );
    const recovered = await executeAction(dir, run.mission.id, descriptor);
    expect(recovered.status).toBe('applied');
    expect(recovered.recovered).toBe(true);
    expect((await executeAction(dir, run.mission.id, descriptor)).status).toBe(
      'applied',
    );
  });
  it('rejects unauthorized specialist calls, substituted results and expired offers', async () => {
    const peerDir = join(dir, 'peer');
    const p = await initializeNode(peerDir, {
      ensName: 'peer.alpha.node.agi.eth',
    });
    const peer = await specialistServer(peerDir, {
      allowedCallers: [Wallet.createRandom().address],
      capabilities: ['risk-review'],
      priceMicroUsd: 10,
      maxDailyRequests: 1,
    });
    servers.push(peer.server);
    await expect(
      coordinateSpecialist(
        dir,
        fixture,
        'risk-review',
        [{ address: p.address, url: peer.url }],
        10,
      ),
    ).rejects.toThrow('403');
    const offer = await (await fetch(`${peer.url}/offer`)).json();
    expect(() =>
      verifyEnvelope(offer, {
        sender: p.address,
        recipient: null,
        kind: 'offer',
        now: offer.expiresAt + 1,
      }),
    ).toThrow('Expired');
    offer.payload.priceMicroUsd = 0;
    expect(() =>
      verifyEnvelope(offer, {
        sender: p.address,
        recipient: null,
        kind: 'offer',
      }),
    ).toThrow('signature');
  });
  it('learns only from comparable authenticated measurements and abstains after repeated losses', async () => {
    const measuredFixture = { ...fixture, measurement: measurementContract };
    const now = Date.now();
    for (let i = 0; i < 3; i++) {
      const mission = { ...measuredFixture, id: `learning-${i}` };
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(now - 200000);
      await runMission(dir, mission);
      vi.useRealTimers();
      await review(mission.id);
      const out = await exportMission(dir, mission.id, join(dir, 'out'));
      const bundle = JSON.parse(await readFile(out.evidence));
      await importOutcome(
        dir,
        await signOutcome(
          bundle,
          measurementFixture(i, { now, baselineCost: 0, candidateCost: 20 }),
          reviewer.privateKey,
        ),
      );
    }
    const plan = planMission(measuredFixture, await loadNode(dir), {
      enabled: true,
      minSamples: 3,
      lossPauseCount: 3,
    });
    const original = fixture.opportunities.find((o) => o.id === 'cache');
    const changed = plan.mission.opportunities.find((o) => o.id === 'cache');
    expect(changed.probability).toBeLessThan(original.probability);
    expect(changed.benefit).toBeLessThan(original.benefit);
    expect(plan.models.find((m) => m.recommendation === 'cache').samples).toBe(
      3,
    );
    expect(plan.scenarios).toHaveLength(4);
    expect(plan.selected).not.toBe('cache');
    expect(
      planMission(measuredFixture, await loadNode(dir), { enabled: false })
        .selected,
    ).toBe('cache');
  });
});
