import { it, expect, vi } from 'vitest';
import { startAgentApi } from '../../src/network/apiServer.js';
import {
  ResourceManager,
  buildResourceManagerConfig,
  createBanList,
} from '../../src/network/resourceManagerConfig.js';
import { createNetworkMetrics } from '../../src/telemetry/networkMetrics.js';
const logger = { info() {}, warn() {}, error() {} };
const token = 'boundary-owner-token';
const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
};
it('rejects malformed owner directives atomically and preserves an authorized valid snapshot', async () => {
  const api = startAgentApi({ port: 0, ownerToken: token, logger });
  const base = `http://127.0.0.1:${api.server.address().port}`;
  const post = (body) =>
    fetch(`${base}/governance/directives`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  try {
    expect((await fetch(`${base}/governance/directives`)).status).toBe(401);
    expect(
      (
        await fetch(`${base}/governance/directives`, {
          method: 'POST',
          body: '{}',
        })
      ).status,
    ).toBe(401);
    const good = await post({
      priority: 'urgent',
      actions: [
        {
          type: ' pause ',
          level: 3,
          reason: false,
          nested: { proof: 'fixture' },
        },
      ],
      notices: [null, 2, true],
      context: { source: 'owner' },
    });
    expect(good.status).toBe(200);
    const saved = api.getOwnerDirectives();
    expect(saved.actions[0]).toMatchObject({
      type: 'pause',
      level: '3',
      reason: 'false',
    });
    expect(saved.notices).toEqual(['', '2', 'true']);
    for (const bad of [
      null,
      [],
      { priority: 1 },
      { actions: {} },
      { actions: [null] },
      { actions: [{}] },
      { notices: {} },
      { notices: [{}] },
      { context: [] },
    ]) {
      expect((await post(bad)).status).toBe(400);
      expect(api.getOwnerDirectives()).toEqual(saved);
    }
    expect((await post({ context: null })).status).toBe(200);
    api.setOwnerDirectives(null);
    api.setOwnerDirectives({ actions: [{}] });
    expect(api.getOwnerDirectives()).toEqual(saved);
    expect(
      (await fetch(`${base}/governance/directives`, { headers })).status,
    ).toBe(200);
  } finally {
    await api.stop();
  }
});
it('requires authority for ban changes, fails closed without a manager and reverses all authorized ban types', async () => {
  const manager = new ResourceManager({
    limits: buildResourceManagerConfig(),
    logger,
  });
  const api = startAgentApi({
    port: 0,
    ownerToken: token,
    resourceManager: manager,
    logger,
  });
  const base = `http://127.0.0.1:${api.server.address().port}`;
  try {
    for (const method of ['GET', 'POST', 'DELETE'])
      expect((await fetch(`${base}/governance/bans`, { method })).status).toBe(
        401,
      );
    const body = JSON.stringify({
      ips: ['10.0.0.1', '10.0.0.2'],
      peers: 'peer-a,peer-b',
      asns: ['asn-a'],
    });
    expect(
      (
        await fetch(`${base}/governance/bans`, {
          method: 'POST',
          headers,
          body,
        })
      ).status,
    ).toBe(200);
    expect(manager.requestStream({ ip: '10.0.0.1' }).accepted).toBe(false);
    expect(manager.requestStream({ peerId: 'peer-a' }).accepted).toBe(false);
    expect(manager.requestStream({ asn: 'asn-a' }).accepted).toBe(false);
    const removed = await fetch(`${base}/governance/bans`, {
      method: 'DELETE',
      headers,
      body,
    });
    expect(removed.status).toBe(200);
    const remaining = (await removed.json()).bans;
    expect(remaining.ips).toEqual([]);
    expect(remaining.peers).toEqual([]);
    expect(remaining.asns).toEqual([]);
    expect(
      manager.requestStream({ ip: '10.0.0.1', peerId: 'peer-a', asn: 'asn-a' })
        .accepted,
    ).toBe(true);
  } finally {
    await api.stop();
  }
  const empty = startAgentApi({ port: 0, ownerToken: token, logger });
  const origin = `http://127.0.0.1:${empty.server.address().port}`;
  try {
    for (const route of [
      '/debug/resources',
      '/debug/network',
      '/debug/peerscore',
    ])
      expect((await fetch(origin + route)).status).toBe(503);
    for (const method of ['GET', 'POST', 'DELETE'])
      expect(
        (await fetch(`${origin}/governance/bans`, { method, headers })).status,
      ).toBe(503);
  } finally {
    await empty.stop();
  }
});
it('reports changing resource counters across observations and releases per-peer capacity', async () => {
  const metrics = createNetworkMetrics();
  const limits = buildResourceManagerConfig({
    config: {
      NRM_LIMITS_JSON: JSON.stringify({
        perPeer: { alice: { maxStreams: 1 } },
      }),
    },
  });
  const manager = new ResourceManager({ limits, metrics, logger });
  expect(
    manager.requestStream({ peerId: 'alice', protocol: 'test' }).accepted,
  ).toBe(true);
  expect(
    manager.requestStream({ peerId: 'alice', protocol: 'test' }).accepted,
  ).toBe(false);
  manager.closeStream({ peerId: 'alice', protocol: 'test' });
  expect(
    manager.requestStream({ peerId: 'alice', protocol: 'test' }).accepted,
  ).toBe(true);
  manager.requestConnection({
    protocol: 'test',
    ip: '10.1.1.1',
    asn: 'AS1',
    direction: 'outbound',
  });
  manager.closeConnection({
    protocol: 'test',
    ip: '10.1.1.1',
    asn: 'AS1',
    direction: 'outbound',
  });
  expect(manager.currentConnections()).toBe(0);
  const api = startAgentApi({
    port: 0,
    resourceManager: manager,
    networkMetrics: metrics,
    logger,
  });
  const base = `http://127.0.0.1:${api.server.address().port}`;
  try {
    for (let i = 0; i < 2; i++) {
      metrics.nrmDenialsTotal.inc({ limit_type: 'streams', protocol: 'test' });
      metrics.connmanagerTrimsTotal.inc({ reason: 'capacity' });
      metrics.connectionsOpen.inc({ direction: 'out' });
      metrics.connectionsClose.inc({ direction: 'out', reason: 'reset' });
      metrics.netDialSuccessTotal.inc({ transport: 'quic' });
      metrics.netDialFailTotal.inc({ transport: 'tcp', reason: 'timeout' });
      metrics.inboundConnections.inc({ transport: 'tcp' });
      const response = await fetch(`${base}/debug/resources?window=1000`);
      expect(response.status).toBe(200);
      const resources = await response.json();
      expect(resources.windowMinutes).toBe(90);
      expect(resources.nrmDenials.byLimitType.streams).toBeGreaterThan(0);
      expect((await fetch(`${base}/debug/network?window=invalid`)).status).toBe(
        200,
      );
    }
  } finally {
    await api.stop();
  }
  const bans = createBanList({ ips: ['old'] });
  bans.addIp('new');
  bans.addPeer('p');
  bans.addAsn('a');
  expect(bans.hasIp('old')).toBe(true);
  expect(bans.hasPeer('p')).toBe(true);
  expect(bans.hasAsn('a')).toBe(true);
  bans.removeIp('new');
  bans.removePeer('p');
  bans.removeAsn('a');
  expect(bans.hasIp('new') || bans.hasPeer('p') || bans.hasAsn('a')).toBe(
    false,
  );
});
