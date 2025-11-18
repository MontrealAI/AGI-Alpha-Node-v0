import { describe, expect, it } from 'vitest';
import { Registry } from 'prom-client';
import {
  bindAutonatReachability,
  bindReachabilityGauge,
  createNetworkMetrics,
  recordAutonatProbe,
  recordConnectionClose,
  recordConnectionOpen,
  updateReachabilityMetric
} from '../../src/telemetry/networkMetrics.js';
import { createReachabilityState } from '../../src/network/transportConfig.js';

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

  it('normalizes inbound/outbound directions for churn metrics', async () => {
    const registry = new Registry();
    const metrics = createNetworkMetrics({ registry });

    recordConnectionOpen(metrics, { direction: 'inbound' });
    recordConnectionClose(metrics, { direction: 'inbound', reason: 'reset' });
    recordConnectionOpen(metrics, { direction: 'outbound' });
    recordConnectionClose(metrics, { direction: { stat: { direction: 'outbound' } }, reason: 'protocol' });

    const snapshot = await registry.getMetricsAsJSON();
    const openMetrics = snapshot.find((metric) => metric.name === 'net_connections_open_total');
    const closeMetrics = snapshot.find((metric) => metric.name === 'net_connections_close_total');
    const liveMetrics = snapshot.find((metric) => metric.name === 'net_connections_live');

    expect(openMetrics?.values?.find((entry) => entry.labels.direction === 'in')?.value).toBe(1);
    expect(openMetrics?.values?.find((entry) => entry.labels.direction === 'out')?.value).toBe(1);
    expect(closeMetrics?.values?.find((entry) => entry.labels.direction === 'in')?.value).toBe(1);
    expect(closeMetrics?.values?.find((entry) => entry.labels.direction === 'out')?.value).toBe(1);
    expect(liveMetrics?.values?.find((entry) => entry.labels.direction === 'in')?.value).toBe(0);
    expect(liveMetrics?.values?.find((entry) => entry.labels.direction === 'out')?.value).toBe(0);
  });
  it('binds reachability state changes to the reachability gauge', async () => {
    const registry = new Registry();
    const metrics = createNetworkMetrics({ registry });
    const reachabilityState = createReachabilityState({ initial: 'private' });

    const unsubscribe = bindReachabilityGauge({ reachabilityState, metrics });
    reachabilityState.updateManual('public');

    const snapshot = await registry.getMetricsAsJSON();
    const reachabilityMetric = snapshot.find((metric) => metric.name === 'net_reachability_state');

    expect(reachabilityMetric?.values?.[0]?.value).toBe(2);

    unsubscribe();
  });

  it('captures AutoNAT reachability callbacks and probes', async () => {
    const registry = new Registry();
    const metrics = createNetworkMetrics({ registry });
    const reachabilityState = createReachabilityState();
    const events = [];

    const autonat = createMockEmitter();
    const unbindGauge = bindReachabilityGauge({ reachabilityState, metrics });
    const unbindAutonat = bindAutonatReachability({
      autonat,
      reachabilityState,
      metrics,
      logger: { info: (payload) => events.push(payload) }
    });

    autonat.dispatch('autonat:result', { reachability: 'public' });
    autonat.dispatch('autonat:probe', { error: new Error('timeout') });

    const snapshot = await registry.getMetricsAsJSON();
    const reachabilityMetric = snapshot.find((metric) => metric.name === 'net_reachability_state');
    const probeMetric = snapshot.find((metric) => metric.name === 'net_autonat_probes_total');
    const failureMetric = snapshot.find((metric) => metric.name === 'net_autonat_failures_total');

    expect(reachabilityState.getState()).toBe('unknown');
    expect(events[0].reachability).toBe('public');
    expect(reachabilityMetric?.values?.[0]?.value).toBe(0);
    expect(probeMetric?.values?.[0]?.value).toBe(2);
    expect(failureMetric?.values?.[0]?.value).toBe(1);

    unbindGauge();
    unbindAutonat();
  });
});

function createMockEmitter() {
  const listeners = new Map();
  return {
    addEventListener(event, handler) {
      const current = listeners.get(event) ?? [];
      listeners.set(event, [...current, handler]);
    },
    removeEventListener(event, handler) {
      const current = listeners.get(event) ?? [];
      listeners.set(
        event,
        current.filter((candidate) => candidate !== handler)
      );
    },
    dispatch(event, detail) {
      const handlers = listeners.get(event) ?? [];
      handlers.forEach((handler) => handler({ detail }));
    }
  };
}
