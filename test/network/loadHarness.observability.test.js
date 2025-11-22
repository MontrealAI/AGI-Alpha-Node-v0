import { describe, expect, it } from 'vitest';
import { Registry } from 'prom-client';
import {
  buildResourceManagerConfig,
  ResourceManager,
  ConnectionManager,
  buildAbuseHarness
} from '../../src/network/resourceManagerConfig.js';
import { createNetworkMetrics } from '../../src/telemetry/networkMetrics.js';
import { startAgentApi } from '../../src/network/apiServer.js';
import { createPeerScoreRegistry } from '../../src/services/peerScoring.js';
import { applyPeerScoreSnapshot, createPeerScoreMetrics } from '../../src/telemetry/peerScoreMetrics.js';

const noopLogger = { info: () => {}, warn: () => {}, error: () => {} };

describe('p2p load harness observability', () => {
  it('raises NRM metrics and pressure snapshots during connection floods', async () => {
    const registry = new Registry();
    const networkMetrics = createNetworkMetrics({ registry });
    const config = buildResourceManagerConfig({
      config: {
        NRM_SCALE_FACTOR: 0.01,
        MAX_CONNS_PER_IP: 2,
        MAX_CONNS_PER_ASN: 2,
        NRM_LIMITS_JSON: JSON.stringify({ perProtocol: { '/meshsub/1.1.0': { maxStreams: 1 } } })
      }
    });
    const resourceManager = new ResourceManager({ limits: config, metrics: networkMetrics });
    const connectionManager = new ConnectionManager({
      lowWater: 1,
      highWater: 2,
      gracePeriodSeconds: 0,
      metrics: networkMetrics
    });
    const harness = buildAbuseHarness({ resourceManager });

    const connFlood = harness.connectionFlood({ total: 20, ip: '203.0.113.8', asn: 'asn-hose', protocol: '/meshsub/1.1.0' });
    const streamFlood = harness.streamFlood({ total: 10, peerId: 'peer-hose', protocol: '/meshsub/1.1.0' });

    expect(connFlood.denied).toBeGreaterThan(0);
    expect(Object.keys(connFlood.reasons)).toContain('per-ip-cap');
    expect(streamFlood.denied).toBeGreaterThan(0);

    const api = startAgentApi({
      port: 0,
      logger: noopLogger,
      resourceManager,
      networkMetrics,
      connectionManager
    });
    const { port } = api.server.address();
    const base = `http://127.0.0.1:${port}`;

    const debugResponse = await fetch(`${base}/debug/resources?window=15`);
    expect(debugResponse.status).toBe(200);
    const debugPayload = await debugResponse.json();
    expect(debugPayload.nrmDenials.byLimitType.per_ip ?? 0).toBeGreaterThan(0);
    expect(debugPayload.metrics.pressure.connections.utilization ?? 0).toBeGreaterThan(0);
    expect(debugPayload.metrics.denials.byProtocol['/meshsub/1.1.0']).toBeGreaterThan(0);

    await api.stop();

    const metricsJson = await registry.getMetricsAsJSON();
    const nrmMetric = metricsJson.find((metric) => metric.name === 'nrm_denials_total');
    expect(nrmMetric?.values?.some((entry) => entry.value > 0)).toBe(true);

    const usageMetric = metricsJson.find((metric) => metric.name === 'nrm_usage');
    expect(usageMetric?.values?.some((entry) => entry.labels?.resource === 'connections_total')).toBe(true);
  });

  it('projects malformed gossip penalties into peer score and trim metrics', async () => {
    const registry = new Registry();
    const networkMetrics = createNetworkMetrics({ registry });
    const config = buildResourceManagerConfig({ config: {} });
    const resourceManager = new ResourceManager({ limits: config, metrics: networkMetrics });
    const connectionManager = new ConnectionManager({
      lowWater: 1,
      highWater: 2,
      gracePeriodSeconds: 0,
      metrics: networkMetrics
    });
    const harness = buildAbuseHarness({ resourceManager });
    const peerRegistry = createPeerScoreRegistry({ retentionMinutes: 1 });
    const peerMetricsRegistry = new Registry();
    const peerMetrics = createPeerScoreMetrics({ registry: peerMetricsRegistry });

    const penalties = harness.malformedGossip({ invalidMessages: 5, penaltyThreshold: -6 });
    const snapshot = {
      timestamp: new Date(),
      peers: penalties.penalties.map((penalty) => ({ id: penalty.peer, score: penalty.score }))
    };
    peerRegistry.record(snapshot);
    applyPeerScoreSnapshot({
      metrics: peerMetrics,
      snapshot: peerRegistry.getLatest(),
      thresholds: { gossip: -2, publish: -4, graylist: -6, disconnect: -8 }
    });

    const now = Date.now();
    const peers = penalties.penalties.map((penalty, index) => ({
      peerId: penalty.peer,
      score: penalty.score,
      connectedAt: now - (index + 2) * 1_000
    }));
    connectionManager.trim(peers, now, { reason: 'malformed_gossip' });

    const networkMetricsSnapshot = await registry.getMetricsAsJSON();
    const trimMetric = networkMetricsSnapshot
      .find((metric) => metric.name === 'connmanager_trims_total')
      ?.values?.find((entry) => entry.labels.reason === 'malformed_gossip');
    expect(trimMetric?.value ?? 0).toBeGreaterThan(0);

    const peerMetricsSnapshot = await peerMetricsRegistry.getMetricsAsJSON();
    const bucketMetric = peerMetricsSnapshot
      .find((metric) => metric.name === 'peer_score_bucket_total')
      ?.values?.find((entry) => entry.labels.bucket === 'graylist');
    expect(bucketMetric?.value ?? 0).toBeGreaterThan(0);
  });
});
