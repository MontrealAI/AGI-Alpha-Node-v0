import { describe, expect, it } from 'vitest';
import { startAgentApi } from '../src/network/apiServer.js';
import { createPeerScoreRegistry } from '../src/services/peerScoring.js';

async function waitForListening(server) {
  if (server.listening) return;
  await new Promise((resolve) => server.once('listening', resolve));
}

describe('agent API peer score debug surface', () => {
  it('returns peer score summaries when configured', async () => {
    const registry = createPeerScoreRegistry({ retentionMinutes: 1 });
    registry.record({
      timestamp: new Date('2024-01-02T00:00:00Z'),
      peers: [
        { id: 'peer-positive', score: 5.2 },
        { id: 'peer-negative', score: -7.4 }
      ]
    });

    const api = startAgentApi({ port: 0, peerScoreStore: registry });
    await waitForListening(api.server);
    const port = api.server.address().port;

    const response = await fetch(`http://127.0.0.1:${port}/debug/peerscore`);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.totalPeers).toBe(2);
    expect(payload.topPositive[0].id).toBe('peer-positive');
    expect(payload.topNegative[0].id).toBe('peer-negative');

    await api.stop();
  });
});
