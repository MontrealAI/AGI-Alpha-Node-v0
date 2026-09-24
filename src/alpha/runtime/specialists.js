import { createServer } from 'node:http';
import { open, unlink } from 'node:fs/promises';
import { Wallet, getAddress } from 'ethers';
import {
  signEnvelope,
  verifyEnvelope,
  executeSpecialist,
} from './specialist-protocol.js';
import { join } from 'node:path';
import { z } from 'zod';
import { digest, missionSchema } from '../mission.js';
import { loadNode, readJson, recordRuntime, verifyIdentity } from '../node.js';
import { synthesizeEvidence, validateModelResult } from './synthesis.js';

const address = (x) => getAddress(x).toLowerCase();
const capabilities = [
  'evidence-analysis',
  'risk-review',
  'implementation-plan',
  'research-synthesis',
  'adversarial-review',
];
const configSchema = z
  .object({
    allowedCallers: z.array(z.string()).min(1).max(100),
    capabilities: z
      .array(z.enum(capabilities))
      .min(1)
      .max(5)
      .refine((a) => new Set(a).size === a.length, 'Duplicate capabilities'),
    priceMicroUsd: z.number().int().nonnegative().max(1e9),
    maxDailyRequests: z.number().int().min(1).max(1000),
    reserveMicroUsdPerRequest: z.number().int().min(0).max(1e9).default(0),
    maxDailyReservedMicroUsd: z.number().int().min(0).max(1e12).default(0),
  })
  .strict();
export {
  signEnvelope,
  verifyEnvelope,
  executeSpecialist,
} from './specialist-protocol.js';
async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 250000) throw new Error('Request exceeds 250 KB');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function specialistServer(
  dir,
  configuration,
  { port = 0, host = '127.0.0.1' } = {},
) {
  const config = configSchema.parse(configuration);
  if (!['127.0.0.1', '::1'].includes(host))
    throw new Error(
      'Specialist binds loopback; deploy remote access behind an owner-managed TLS proxy',
    );
  const initial = await loadNode(dir);
  const wallet = new Wallet(
    (await readJson(join(dir, 'identity.key.json'))).privateKey,
  );
  if (address(wallet.address) !== address(initial.config.address))
    throw new Error('Signer mismatch');
  const callers = new Set(config.allowedCallers.map(address));
  let busy = false;
  const server = createServer(async (req, res) => {
    const send = (status, data) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(JSON.stringify(data));
    };
    try {
      if (req.method === 'GET' && req.url === '/offer')
        return send(
          200,
          await signEnvelope(wallet, 'offer', null, {
            schema: 1,
            capabilities: config.capabilities,
            priceMicroUsd: config.priceMicroUsd,
            payment:
              'Quote only; funding and settlement are separate explicit escrow operations',
          }),
        );
      if (
        req.method !== 'POST' ||
        req.url !== '/execute' ||
        req.headers['content-type'] !== 'application/json'
      )
        return send(404, { error: 'Unknown endpoint' });
      const request = await body(req);
      if (!callers.has(address(request.sender)))
        return send(403, { error: 'Caller not authorized' });
      const payload = verifyEnvelope(request, {
        sender: request.sender,
        recipient: wallet.address,
        kind: 'request',
      });
      if (
        !config.capabilities.includes(payload.capability) ||
        !Number.isSafeInteger(payload.maxPriceMicroUsd) ||
        payload.maxPriceMicroUsd < config.priceMicroUsd ||
        !/^0x[0-9a-f]{64}$/.test(payload.requestId)
      )
        throw new Error('Capability, price or request ID rejected');
      const mission = missionSchema.parse(payload.mission);
      if (
        payload.requestId !==
        digest({
          sender: request.sender,
          recipient: address(wallet.address),
          capability: payload.capability,
          mission,
        })
      )
        throw new Error('Request ID does not bind inputs');
      if (busy) return send(409, { error: 'Specialist busy' });
      busy = true;
      let executionLock;
      try {
        try {
          executionLock = await open(join(dir, 'specialist.lock'), 'wx', 0o600);
        } catch (e) {
          if (e.code === 'EEXIST')
            throw new Error(
              'Specialist busy or interrupted; inspect before recovery',
            );
          throw e;
        }
        await executionLock.writeFile(String(process.pid));
        await executionLock.sync();
        const id = `specialist:${payload.requestId}`;
        const n = await loadNode(dir);
        if (n.paused) throw new Error('Specialist paused');
        const existing = n.runtime.get(`${id}:result`);
        if (existing) return send(200, existing.data.envelope);
        if (n.runtime.has(`${id}:reserved`))
          throw new Error(
            'Specialist request interrupted or failed; automatic retry forbidden',
          );
        const isModel = ['research-synthesis', 'adversarial-review'].includes(
          payload.capability,
        );
        if (
          isModel &&
          (!n.config.provider || config.reserveMicroUsdPerRequest <= 0)
        )
          throw new Error(
            'Model specialist requires a provider and positive cost reservation',
          );
        await verifyIdentity(n.config);
        await recordRuntime(
          dir,
          'specialist',
          `${id}:reserved`,
          {
            requestId: payload.requestId,
            capability: payload.capability,
            caller: request.sender,
            ...(isModel
              ? { reservedMicroUsd: config.reserveMicroUsdPerRequest }
              : {}),
          },
          (node) => {
            const today = new Date().toISOString().slice(0, 10);
            const used = [...node.runtime.values()].filter(
              (e) =>
                e.topic === 'specialist' &&
                e.id.endsWith(':reserved') &&
                e.at.slice(0, 10) >= today,
            ).length;
            if (node.paused || used >= config.maxDailyRequests)
              throw new Error('Specialist paused or daily capacity reached');
            const reserved = [...node.runtime.values()]
              .filter(
                (e) =>
                  e.topic === 'specialist' &&
                  e.id.endsWith(':reserved') &&
                  e.at.slice(0, 10) >= today,
              )
              .reduce((sum, e) => sum + (e.data.reservedMicroUsd ?? 0), 0);
            if (
              isModel &&
              reserved + config.reserveMicroUsdPerRequest >
                config.maxDailyReservedMicroUsd
            )
              throw new Error('Specialist daily inference budget exhausted');
          },
        );
        const result = isModel
          ? await synthesizeEvidence(
              payload.capability,
              mission,
              n.config.provider,
            )
          : executeSpecialist(payload.capability, mission);
        const envelope = await signEnvelope(wallet, 'result', request.sender, {
          requestId: payload.requestId,
          capability: payload.capability,
          priceMicroUsd: config.priceMicroUsd,
          inputDigest: digest(mission),
          result,
        });
        await recordRuntime(
          dir,
          'specialist',
          `${id}:result`,
          { envelope },
          (node) => {
            if (node.paused)
              throw new Error('Specialist paused during execution');
          },
        );
        return send(200, envelope);
      } finally {
        if (executionLock) {
          await executionLock.close();
          await unlink(join(dir, 'specialist.lock'));
        }
        busy = false;
      }
    } catch (e) {
      return send(400, { error: e.message });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.maxConnections = 32;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  return {
    server,
    address: wallet.address,
    url: `http://127.0.0.1:${server.address().port}`,
  };
}
export function peerUrl(value) {
  const u = new URL(value);
  if (
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname !== '/' ||
    (u.protocol !== 'https:' &&
      !(u.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(u.hostname)))
  )
    throw new Error(
      'Peer URL must be an HTTPS origin or explicit loopback HTTP origin',
    );
  return u.origin;
}
async function fetchJson(url, options = {}, timeoutMs = 15000) {
  const response = await fetch(url, {
    ...options,
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 500000) throw new Error('Specialist response too large');
    chunks.push(chunk);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!response.ok)
    throw new Error(
      `Specialist HTTP ${response.status}: ${typeof parsed.error === 'string' ? parsed.error.slice(0, 500) : 'request rejected'}`,
    );
  return parsed;
}
export async function coordinateSpecialist(
  dir,
  mission,
  capability,
  peers,
  maxPriceMicroUsd,
) {
  if (!Number.isSafeInteger(maxPriceMicroUsd) || maxPriceMicroUsd < 0)
    throw new Error('Invalid specialist budget');
  const n = await loadNode(dir);
  if (n.paused) throw new Error('Node paused');
  const wallet = new Wallet(
    (await readJson(join(dir, 'identity.key.json'))).privateKey,
  );
  if (address(wallet.address) !== address(n.config.address))
    throw new Error('Node signer mismatch');
  const offers = [];
  for (const peer of peers.slice(0, 20)) {
    try {
      const url = peerUrl(peer.url);
      const signed = await fetchJson(`${url}/offer`);
      const offer = verifyEnvelope(signed, {
        sender: peer.address,
        recipient: null,
        kind: 'offer',
      });
      if (
        offer.capabilities.includes(capability) &&
        Number.isSafeInteger(offer.priceMicroUsd) &&
        offer.priceMicroUsd >= 0 &&
        offer.priceMicroUsd <= maxPriceMicroUsd
      )
        offers.push({ peer, url, offer });
    } catch {
      /* Unreachable or untrusted peers cannot win selection. */
    }
  }
  offers.sort(
    (a, b) =>
      a.offer.priceMicroUsd - b.offer.priceMicroUsd ||
      address(a.peer.address).localeCompare(address(b.peer.address)),
  );
  const choice = offers[0];
  if (!choice)
    throw new Error(
      'No authenticated specialist within capability and price bounds',
    );
  const requestId = digest({
    sender: address(wallet.address),
    recipient: address(choice.peer.address),
    capability,
    mission,
  });
  const prior = n.runtime.get(`peer:${requestId}`);
  if (prior) return prior.data.envelope;
  const request = await signEnvelope(wallet, 'request', choice.peer.address, {
    requestId,
    capability,
    mission,
    maxPriceMicroUsd,
  });
  const isModel = ['research-synthesis', 'adversarial-review'].includes(
    capability,
  );
  const envelope = await fetchJson(
    `${choice.url}/execute`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    },
    isModel ? 190000 : 15000,
  );
  const result = verifyEnvelope(envelope, {
    sender: choice.peer.address,
    recipient: wallet.address,
    kind: 'result',
    allowExpired: true,
  });
  if (
    result.requestId !== requestId ||
    result.capability !== capability ||
    result.inputDigest !== digest(mission) ||
    result.priceMicroUsd !== choice.offer.priceMicroUsd ||
    result.priceMicroUsd > maxPriceMicroUsd
  )
    throw new Error('Specialist result/input/price binding mismatch');
  // These capabilities are deterministic; recompute instead of trusting a signature as truth.
  if (isModel) validateModelResult(result.result, mission, capability);
  else if (
    digest(result.result) !== digest(executeSpecialist(capability, mission))
  )
    throw new Error('Specialist result failed local validation');
  await recordRuntime(dir, 'specialist', `peer:${requestId}`, {
    envelope,
    peer: address(choice.peer.address),
  });
  return envelope;
}
