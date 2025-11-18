import { describe, expect, it } from 'vitest';
import { Registry } from 'prom-client';
import {
  createNetworkMetrics,
  recordAutonatProbe,
  recordConnectionClose,
  recordConnectionOpen,
  updateReachabilityMetric
} from '../../src/telemetry/networkMetrics.js';

describe('networkMetrics', () => {
  it('tracks reachability posture and autonat probes', async () => {
    const registry = new Registry();
    const metrics = createNetworkMetrics({ registry });

    updateReachabilityMetric(metrics, 'public');
    recordAutonatProbe(metrics, { success: true });
    recordAutonatProbe(metrics, { success: false });

    const snapshot = await registry.getMetricsAsJSON();
    const reachabilityMetric = snapshot.find((metric) => metric.name === 'net_reachability_state');
    const probeMetric = snapshot.find((metric) => metric.name === 'net_autonat_probes_total');
    const failureMetric = snapshot.find((metric) => metric.name === 'net_autonat_failures_total');

    expect(reachabilityMetric?.values?.[0]?.value).toBe(2);
    expect(probeMetric?.values?.[0]?.value).toBe(2);
    expect(failureMetric?.values?.[0]?.value).toBe(1);
  });

  it('records connection churn and live counts by direction', async () => {
    const registry = new Registry();
    const metrics = createNetworkMetrics({ registry });

    recordConnectionOpen(metrics, { direction: 'in' });
    recordConnectionOpen(metrics, { direction: 'out' });
    recordConnectionClose(metrics, { direction: 'out', reason: 'timeout' });

    const snapshot = await registry.getMetricsAsJSON();
    const openMetrics = snapshot.find((metric) => metric.name === 'net_connections_open_total');
    const closeMetrics = snapshot.find((metric) => metric.name === 'net_connections_close_total');
    const liveMetrics = snapshot.find((metric) => metric.name === 'net_connections_live');

    expect(openMetrics?.values?.find((entry) => entry.labels.direction === 'in')?.value).toBe(1);
    expect(openMetrics?.values?.find((entry) => entry.labels.direction === 'out')?.value).toBe(1);
    expect(closeMetrics?.values?.find((entry) => entry.labels.reason === 'timeout')?.value).toBe(1);
    expect(liveMetrics?.values?.find((entry) => entry.labels.direction === 'in')?.value).toBe(1);
    expect(liveMetrics?.values?.find((entry) => entry.labels.direction === 'out')?.value).toBe(0);
  });
});
