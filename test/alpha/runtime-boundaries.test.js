import { it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtemp,
  readFile,
  writeFile,
  rm,
  symlink,
  link,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { Wallet, id } from 'ethers';
import {
  initializeNode,
  loadNode,
  recordRuntime,
  pauseNode,
  exportMission,
  signDetachedReview,
  importDetachedReview,
} from '../../src/alpha/node.js';
import { operate } from '../../src/alpha/runtime/engine.js';
import { describeAction } from '../../src/alpha/runtime/actions.js';
import {
  coordinateSpecialist,
  specialistServer,
  executeSpecialist,
  peerUrl,
  signEnvelope,
  verifyEnvelope,
} from '../../src/alpha/runtime/specialists.js';
import {
  backupNode,
  serviceConfiguration,
} from '../../src/alpha/runtime/maintenance.js';
import { rpcQuorum } from '../../src/alpha/runtime/rpc.js';
import { inferNarrative } from '../../src/alpha/mission.js';
import { operatorServer } from '../../src/alpha/operator.js';
const mission = JSON.parse(
  await readFile('examples/alpha/opportunity-scan.json'),
);
const pipeline = JSON.parse(await readFile('examples/alpha/pipeline.json'));
let dir, reviewer, servers;
const save = (name, value) => writeFile(join(dir, name), JSON.stringify(value));
const usage = () => ({
  schema: 1,
  observedAt: new Date().toISOString(),
  period: 'Boundary fixture',
  services: [
    {
      id: 'inference',
      name: 'Fixture',
      requests: 100,
      repeatedRequests: 60,
      costUsd: 500,
    },
  ],
});
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'alpha-boundaries-'));
  reviewer = Wallet.createRandom();
  servers = [];
  await initializeNode(dir, {
    ensName: 'boundary.alpha.node.agi.eth',
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
async function http(handler) {
  const s = createServer(handler);
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  servers.push(s);
  return `http://127.0.0.1:${s.address().port}`;
}
async function baseEngine(extra = {}) {
  await save('pipeline.json', pipeline);
  await save('usage.json', usage());
  await save('engine.json', { schema: 1, ...extra });
}
async function accept(missionId) {
  const exported = await exportMission(dir, missionId, join(dir, 'out'));
  const review = await signDetachedReview(
    JSON.parse(await readFile(exported.evidence)),
    'accepted',
    'Boundary fixture review',
    reviewer.privateKey,
  );
  await importDetachedReview(dir, review);
}

it('collects a real HTTP observation, verifies freshness, persists provenance and rejects stale or oversized replacements', async () => {
  let observation = usage();
  let status = 200;
  const url = await http((_, res) => {
    res.writeHead(status);
    res.end(
      typeof observation === 'string'
        ? observation
        : JSON.stringify(observation),
    );
  });
  await baseEngine({ collector: { url: `${url}/usage` } });
  const result = await operate(dir);
  expect(result.discovery.status).toBe('awaiting-review');
  expect(
    [...(await loadNode(dir)).runtime.values()].some(
      (e) => e.topic === 'source',
    ),
  ).toBe(true);
  const original = await readFile(join(dir, 'usage.json'), 'utf8');
  observation.observedAt = new Date(0).toISOString();
  await expect(operate(dir)).rejects.toThrow('stale');
  observation = 'x'.repeat(100001);
  await expect(operate(dir)).rejects.toThrow('limit');
  status = 503;
  await expect(operate(dir)).rejects.toThrow('503');
  expect(await readFile(join(dir, 'usage.json'), 'utf8')).toBe(original);
  await save('engine.json', {
    schema: 1,
    collector: { url: `${url}/usage?secret=x` },
  });
  await expect(operate(dir)).rejects.toThrow('credentials');
});
it('does not execute after owner action authorization changes and abstains when the target is already active', async () => {
  await save('settings.json', { nested: { enabled: false } });
  const action = {
    kind: 'json-set',
    root: dir,
    file: 'settings.json',
    pointer: ['nested', 'enabled'],
    value: true,
    healthUrl: `${await http((_, r) => r.end('{"healthy":true}'))}/health`,
    healthField: 'healthy',
    healthValue: true,
  };
  await baseEngine({ actions: { 'cache-inference': action } });
  const first = await operate(dir);
  await accept(first.discovery.missionId);
  await save('engine.json', { schema: 1 });
  expect((await operate(dir)).progress[0].status).toBe(
    'action-authorization-changed',
  );
  expect(
    JSON.parse(await readFile(join(dir, 'settings.json'))).nested.enabled,
  ).toBe(false);
  await save('settings.json', { nested: { enabled: true } });
  await baseEngine({ actions: { 'cache-inference': action } });
  const fresh = usage();
  fresh.services[0].costUsd = 501;
  await save('usage.json', fresh);
  // The old reviewed action fails its precondition first, preserving the active target.
  await expect(operate(dir)).rejects.toThrow('precondition');
  const other = join(dir, 'fresh');
  await initializeNode(other, { ensName: 'fresh.alpha.node.agi.eth' });
  await writeFile(
    join(other, 'pipeline.json'),
    JSON.stringify({ ...pipeline, source: join(dir, 'usage.json') }),
  );
  await writeFile(
    join(other, 'engine.json'),
    JSON.stringify({ schema: 1, actions: { 'cache-inference': action } }),
  );
  expect((await operate(other)).discovery.status).toBe('abstained');
});
it('enforces runtime locking, pause and specialist reservation limits before external work', async () => {
  await baseEngine();
  await pauseNode(dir, true);
  await expect(operate(dir)).rejects.toThrow('paused');
  await pauseNode(dir, false);
  await writeFile(join(dir, 'engine.lock'), 'stale');
  await expect(operate(dir)).rejects.toThrow('interrupted');
  await rm(join(dir, 'engine.lock'));
  await baseEngine({
    specialistCapabilities: ['risk-review'],
    maxSpecialistPriceMicroUsd: pipeline.reserveMicroUsdPerRun + 1,
  });
  await expect(operate(dir)).rejects.toThrow('reservation');
  expect((await loadNode(dir)).runs.size).toBe(0);
});
it('rejects unsafe action capabilities before writing any target', async () => {
  await save('settings.json', {
    nested: { flag: false },
    object: {},
    nullable: null,
  });
  const action = {
    kind: 'json-set',
    root: dir,
    file: 'settings.json',
    pointer: ['nested', 'flag'],
    value: true,
    healthUrl: 'http://127.0.0.1/health',
    healthField: 'ok',
    healthValue: true,
  };
  for (const update of [
    { pointer: ['missing', 'flag'] },
    { pointer: ['nested', 'missing'] },
    { pointer: ['__proto__'] },
    { pointer: ['object'], value: null },
    { value: 1 },
    { file: '/tmp/escape' },
    { healthUrl: 'http://remote.example/health' },
    { healthUrl: 'https://user:secret@example.com/health' },
  ])
    await expect(describeAction({ ...action, ...update })).rejects.toThrow();
  await link(join(dir, 'settings.json'), join(dir, 'hard.json'));
  await expect(describeAction(action)).rejects.toThrow('hard links');
});
it('authenticates and replays all specialist capabilities and refuses excess capacity', async () => {
  const peerDir = join(dir, 'peer');
  const peerConfig = await initializeNode(peerDir, {
    ensName: 'peer.alpha.node.agi.eth',
  });
  const node = await loadNode(dir);
  const peer = await specialistServer(peerDir, {
    allowedCallers: [node.config.address],
    capabilities: ['evidence-analysis', 'risk-review', 'implementation-plan'],
    priceMicroUsd: 2,
    maxDailyRequests: 3,
  });
  servers.push(peer.server);
  const peers = [{ address: peerConfig.address, url: peer.url }];
  for (const capability of [
    'evidence-analysis',
    'risk-review',
    'implementation-plan',
  ]) {
    const first = await coordinateSpecialist(
      dir,
      mission,
      capability,
      peers,
      2,
    );
    expect(
      (await coordinateSpecialist(dir, mission, capability, peers, 2)).hash,
    ).toBe(first.hash);
  }
  await expect(
    coordinateSpecialist(
      dir,
      { ...mission, id: 'fresh-request' },
      'risk-review',
      peers,
      2,
    ),
  ).rejects.toThrow('400');
  await expect(
    coordinateSpecialist(dir, mission, 'risk-review', peers, 1),
  ).rejects.toThrow('No authenticated');
  await expect(
    coordinateSpecialist(dir, mission, 'risk-review', peers, -1),
  ).rejects.toThrow('budget');
  await pauseNode(dir, true);
  await expect(
    coordinateSpecialist(dir, mission, 'risk-review', peers, 2),
  ).rejects.toThrow('paused');
  expect((await fetch(`${peer.url}/unknown`)).status).toBe(404);
  expect(() => executeSpecialist('shell', mission)).toThrow('Unsupported');
  expect(() => peerUrl('https://example.com/path')).toThrow('origin');
  await expect(
    specialistServer(
      peerDir,
      {
        allowedCallers: [node.config.address],
        capabilities: ['risk-review'],
        priceMicroUsd: 0,
        maxDailyRequests: 1,
      },
      { host: '0.0.0.0' },
    ),
  ).rejects.toThrow('loopback');
});
it('rejects future, overlong and recipient-substituted specialist envelopes', async () => {
  const sender = Wallet.createRandom(),
    receiver = Wallet.createRandom();
  for (const options of [
    { now: Date.now() + 60000 },
    { ttlMs: 300001 },
    { ttlMs: 0 },
  ]) {
    const signed = await signEnvelope(
      sender,
      'request',
      receiver.address,
      {},
      options,
    );
    expect(() =>
      verifyEnvelope(signed, {
        sender: sender.address,
        recipient: receiver.address,
        kind: 'request',
      }),
    ).toThrow('invalid');
  }
  const signed = await signEnvelope(sender, 'request', receiver.address, {});
  expect(() =>
    verifyEnvelope(signed, {
      sender: sender.address,
      recipient: sender.address,
      kind: 'request',
    }),
  ).toThrow('binding');
});
it('protects backups from active locks, symlinks and weak secrets without overwriting files', async () => {
  await pauseNode(dir, true);
  const target = join(dir, '..', `${dir.split('/').at(-1)}-backup`);
  try {
    await expect(
      backupNode(dir, join(dir, 'backup'), 'long enough password'),
    ).rejects.toThrow('outside');
    await expect(backupNode(dir, target, 'short')).rejects.toThrow('16');
    await writeFile(join(dir, 'action.lock'), 'busy');
    await expect(
      backupNode(dir, target, 'long enough password'),
    ).rejects.toThrow('workers');
    await rm(join(dir, 'action.lock'));
    await symlink(join(dir, 'config.json'), join(dir, 'alias'));
    await expect(
      backupNode(dir, target, 'long enough password'),
    ).rejects.toThrow('symlinks');
    expect(() =>
      serviceConfiguration('windows', {
        nodePath: '/node',
        cliPath: '/cli',
        home: '/home',
      }),
    ).toThrow('Supported');
  } finally {
    await rm(target, { force: true });
  }
});
it('rejects malformed, inconsistent and oversized RPC evidence before signing transactions', async () => {
  const urls = ['https://one.example', 'https://two.example'];
  expect(() => rpcQuorum([])).toThrow('Two');
  expect(() => rpcQuorum([urls[0], urls[0]])).toThrow('Distinct');
  expect(() => rpcQuorum(['http://one.example', urls[1]])).toThrow('HTTPS');
  for (const response of [
    new Response('', { status: 503 }),
    Response.json({ error: { message: 'internal secret' } }),
    new Response('x'.repeat(1000001)),
  ]) {
    const rpc = rpcQuorum(urls, { fetchImpl: async () => response });
    await expect(rpc.one(0, 'eth_chainId', [])).rejects.toThrow(
      /HTTP|rejected|limit/,
    );
  }
  const disagree = rpcQuorum(urls, {
    fetchImpl: async (url) =>
      Response.json({ result: url.hostname === 'one.example' ? '0x1' : '0x2' }),
  });
  await expect(disagree.agree('eth_chainId', [])).rejects.toThrow(
    'disagreement',
  );
  await expect(disagree.snapshot()).rejects.toThrow('mainnet');
  const unavailable = rpcQuorum(urls, {
    fetchImpl: async (_, options) =>
      Response.json({
        result:
          JSON.parse(options.body).method === 'eth_chainId' ? '0x1' : null,
      }),
  });
  await expect(unavailable.snapshot()).rejects.toThrow('unavailable');
  const forked = rpcQuorum(urls, {
    fetchImpl: async (url, options) =>
      Response.json({
        result:
          JSON.parse(options.body).method === 'eth_chainId'
            ? '0x1'
            : { number: '0x10', hash: id(url.hostname) },
      }),
  });
  await expect(forked.snapshot()).rejects.toThrow('disagreement');
  await expect(forked.pin(reviewer.address, 'bad', {})).rejects.toThrow('hash');
});
it('rejects provider credentials in URLs, invalid budgets, missing keys, oversized and truncated output', async () => {
  const base = {
    url: 'https://provider.example/chat',
    model: 'fixture',
    maxTokens: 100,
  };
  for (const update of [
    { url: 'https://user:secret@provider.example' },
    { maxTokens: 0 },
    { maxTokens: 8193 },
    { model: '' },
    { keyEnv: 'ALPHA_NONEXISTENT_TEST_SECRET' },
  ])
    await expect(
      inferNarrative(mission, {}, { ...base, ...update }),
    ).rejects.toThrow();
  await expect(
    inferNarrative(mission, {}, base, {
      fetchImpl: async () => new Response('x'.repeat(1000001)),
    }),
  ).rejects.toThrow('limit');
  await expect(
    inferNarrative(mission, {}, base, {
      fetchImpl: async () =>
        Response.json({
          choices: [
            { message: { content: 'partial' }, finish_reason: 'length' },
          ],
        }),
    }),
  ).rejects.toThrow('Incomplete');
});
it('serves complete review evidence and runtime status while hiding raw transaction intents', async () => {
  await baseEngine();
  const op = await operatorServer(dir);
  servers.push(op.server);
  const url = op.url.split('/#')[0],
    headers = {
      Authorization: `Bearer ${op.token}`,
      'Content-Type': 'application/json',
    };
  const response = await fetch(`${url}/api/operate`, {
    method: 'POST',
    headers,
    body: '{}',
  });
  const result = await response.json();
  expect(response.status).toBe(200);
  const evidence = await (
    await fetch(`${url}/api/evidence?id=${result.discovery.missionId}`, {
      headers,
    })
  ).json();
  const review = await signDetachedReview(
    evidence,
    'accepted',
    'HTTP operator fixture',
    reviewer.privateKey,
  );
  expect(
    (
      await fetch(`${url}/api/review`, {
        method: 'POST',
        headers,
        body: JSON.stringify(review),
      })
    ).status,
  ).toBe(200);
  await recordRuntime(dir, 'transaction-prepared', 'private-example', {
    raw: 'PRIVATE_BROADCASTABLE_BYTES',
    hash: id('tx'),
    purpose: 'fixture',
  });
  const status = await (await fetch(`${url}/api/status`, { headers })).text();
  expect(status).toContain('transaction-prepared');
  expect(status).not.toContain('PRIVATE_BROADCASTABLE_BYTES');
  expect(
    (await fetch(`${url}/api/evidence?id=absent`, { headers })).status,
  ).toBe(404);
  expect((await fetch(`${url}/unknown`, { headers })).status).toBe(404);
  expect(
    (await fetch(`${url}/unknown`, { method: 'POST', headers, body: '{}' }))
      .status,
  ).toBe(404);
  expect(
    (
      await fetch(`${url}/api/pause`, {
        method: 'POST',
        headers: { Authorization: headers.Authorization },
      })
    ).status,
  ).toBe(415);
  expect(
    (await fetch(`${url}/api/pause`, { method: 'POST', headers, body: '{' }))
      .status,
  ).toBe(400);
  await pauseNode(dir, true);
  expect(
    (await fetch(`${url}/api/resume`, { method: 'POST', headers, body: '{}' }))
      .status,
  ).toBe(200);
  expect((await loadNode(dir)).paused).toBe(false);
});
