import { describe, expect, it } from 'vitest';
import { Registry } from 'prom-client';
import { createNetworkMetrics } from '../../src/telemetry/networkMetrics.js';
import {
  estimatePayloadBytes,
  instrumentProtocolHandler,
  observeProtocolExchange,
  trackProtocolMessage
} from '../../src/network/protocols/metrics.js';

describe('protocol metrics instrumentation', () => {
  it('wraps protocol handlers to emit latency and traffic', async () => {
    const registry = new Registry();
    const metrics = createNetworkMetrics({ registry });

    const handler = instrumentProtocolHandler({
      metrics,
      protocol: 'agi/control/1.0.0',
      direction: 'in'
    })(async (payload) => {
      await new Promise((resolve) => setTimeout(resolve, 3));
      return { ack: true, payload };
    });

    await handler(Buffer.from('hello'));

    const snapshot = await registry.getMetricsAsJSON();
    const latencyMetric = snapshot.find((metric) => metric.name === 'net_protocol_latency_ms');
    const bytesMetric = snapshot.find((metric) => metric.name === 'net_bytes_total');
    const msgsMetric = snapshot.find((metric) => metric.name === 'net_msgs_total');

    const latencyCount = latencyMetric?.values?.find(
      (entry) => entry.labels.protocol === 'agi/control/1.0.0' && entry.labels.le === '+Inf'
    )?.value;
    const bytesEntry = bytesMetric?.values?.find(
      (entry) => entry.labels.protocol === 'agi/control/1.0.0' && entry.labels.direction === 'in'
    );
    const msgsEntry = msgsMetric?.values?.find(
      (entry) => entry.labels.protocol === 'agi/control/1.0.0' && entry.labels.direction === 'in'
    );

    expect(latencyCount).toBeGreaterThanOrEqual(1);
    expect(bytesEntry?.value).toBeGreaterThanOrEqual(5);
    expect(msgsEntry?.value).toBe(1);
  });

  it('tracks outbound payload sizes and message counts', async () => {
    const registry = new Registry();
    const metrics = createNetworkMetrics({ registry });

    const firstBytes = trackProtocolMessage(metrics, {
      protocol: 'agi/jobs/1.0.0',
      direction: 'out',
      payload: { jobId: '123', status: 'ok' }
    });
    const secondBytes = trackProtocolMessage(metrics, {
      protocol: 'agi/jobs/1.0.0',
      direction: 'out',
      payload: 'ping',
      overheadBytes: 4
    });

    const snapshot = await registry.getMetricsAsJSON();
    const bytesMetric = snapshot.find((metric) => metric.name === 'net_bytes_total');
    const msgsMetric = snapshot.find((metric) => metric.name === 'net_msgs_total');

    const bytesEntry = bytesMetric?.values?.find(
      (entry) => entry.labels.protocol === 'agi/jobs/1.0.0' && entry.labels.direction === 'out'
    );
    const msgsEntry = msgsMetric?.values?.find(
      (entry) => entry.labels.protocol === 'agi/jobs/1.0.0' && entry.labels.direction === 'out'
    );

    expect(firstBytes).toBeGreaterThan(0);
    expect(secondBytes).toBeGreaterThan(0);
    expect(bytesEntry?.value).toBe(firstBytes + secondBytes);
    expect(msgsEntry?.value).toBe(2);
  });

  it('captures round-trip protocol exchanges with latency and byte totals', async () => {
    const registry = new Registry();
    const metrics = createNetworkMetrics({ registry });

    const response = await observeProtocolExchange(
      metrics,
      { protocol: 'agi/settlement/1.0.0', direction: 'out', payload: { job: 'abc', bid: 10 } },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 2));
        return { ok: true, receipt: '0xabc' };
      }
    );

    expect(response.ok).toBe(true);

    const snapshot = await registry.getMetricsAsJSON();
    const latencyMetric = snapshot.find((metric) => metric.name === 'net_protocol_latency_ms');
    const bytesMetric = snapshot.find((metric) => metric.name === 'net_bytes_total');

    const latencyCount = latencyMetric?.values?.find(
      (entry) => entry.labels.protocol === 'agi/settlement/1.0.0' && entry.labels.le === '+Inf'
    )?.value;
    const bytesEntry = bytesMetric?.values?.find(
      (entry) => entry.labels.protocol === 'agi/settlement/1.0.0' && entry.labels.direction === 'out'
    );

    expect(latencyCount).toBeGreaterThanOrEqual(1);
    expect(bytesEntry?.value).toBeGreaterThan(0);
  });

  it('estimates payload sizes across primitives and objects', () => {
    expect(estimatePayloadBytes('abc')).toBe(3);
    expect(estimatePayloadBytes(Buffer.from('abc'))).toBe(3);
    expect(estimatePayloadBytes({ hello: 'world' })).toBeGreaterThan(0);
    expect(estimatePayloadBytes(42)).toBe(String(42).length);
  });
});
