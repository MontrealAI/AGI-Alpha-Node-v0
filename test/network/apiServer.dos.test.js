import { describe, expect, it } from 'vitest';
import { startAgentApi } from '../../src/network/apiServer.js';
import { ResourceManager, buildResourceManagerConfig } from '../../src/network/resourceManagerConfig.js';

describe('agent API DoS surfaces', () => {
  it('exposes resource metrics and ban mutations', async () => {
    const ownerToken = 'secret-owner-token';
    const config = buildResourceManagerConfig({ config: { MAX_CONNS_PER_IP: 2, MAX_CONNS_PER_ASN: 1 } });
    const resourceManager = new ResourceManager({ limits: config });

    const api = startAgentApi({
      port: 0,
      ownerToken,
      resourceManager,
      connectionManager: null
    });

    const port = api.server.address().port;
    const base = `http://127.0.0.1:${port}`;

    const debugResponse = await fetch(`${base}/debug/resources`);
    expect(debugResponse.status).toBe(200);
    const debugPayload = await debugResponse.json();
    expect(debugPayload.metrics.connections).toBe(0);
    expect(debugPayload.metrics.pressure.connections.limit).toBeDefined();
    expect(debugPayload.limits.global.connections).toBeGreaterThan(0);
    expect(debugPayload.usage.global.connections.used).toBe(0);

    const addBan = await fetch(`${base}/governance/bans`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ip: '10.10.10.10', peerId: 'peer-banned', asn: 'asn-banned' })
    });
    expect(addBan.status).toBe(200);
    const addPayload = await addBan.json();
    expect(addPayload.bans.ips).toContain('10.10.10.10');
    expect(addPayload.bans.peers).toContain('peer-banned');

    const bansResponse = await fetch(`${base}/governance/bans`, {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    expect(bansResponse.status).toBe(200);
    const bansPayload = await bansResponse.json();
    expect(bansPayload.bans.asns).toContain('asn-banned');

    await api.stop();
  });
});
