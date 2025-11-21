import { describe, expect, it, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { Registry } from 'prom-client';
import {
  dcutrDirectDataBytesTotal,
  dcutrPunchAttemptsTotal,
  dcutrPunchFailureTotal,
  dcutrPunchSuccessTotal,
  dcutrRelayDataBytesTotal,
  dcutrRelayOffloadTotal,
  registerDCUtRMetrics,
} from '../../observability/prometheus/metrics_dcutr.js';
import { wireDCUtRMetricBridge, wireLibp2pDCUtRMetrics } from '../../src/observability/dcutrEvents.js';

async function sumValues(metric: { get: () => Promise<any> }): Promise<number> {
  const values = (await metric.get())?.values ?? [];
  return values.reduce((acc: number, entry: any) => acc + (entry.value ?? 0), 0);
}

function resetMetrics() {
  dcutrPunchAttemptsTotal.reset();
  dcutrPunchSuccessTotal.reset();
  dcutrPunchFailureTotal.reset();
  dcutrRelayOffloadTotal.reset();
  dcutrRelayDataBytesTotal.reset();
  dcutrDirectDataBytesTotal.reset();
}

class FakeEventTarget extends EventEmitter {
  addEventListener(event: string, handler: (...args: any[]) => void): void {
    this.on(event, handler);
  }

  removeEventListener(event: string, handler: (...args: any[]) => void): void {
    this.off(event, handler);
  }
}

describe('wireDCUtRMetricBridge', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it('records attempts once even when relay and hole punch start both fire', async () => {
    const registry = new Registry();
    registerDCUtRMetrics(registry);
    const emitter = new EventEmitter();
    const detach = wireDCUtRMetricBridge(emitter, registry);

    emitter.emit('holePunchStart', { labels: { region: 'iad', relay_id: 'relay-a', transport: 'quic' } });
    emitter.emit('relayDialSuccess', { labels: { region: 'iad', relay_id: 'relay-a', transport: 'quic' }, relayBytes: 1024 });

    expect(await sumValues(dcutrPunchAttemptsTotal)).toBe(1);
    expect(await sumValues(dcutrRelayDataBytesTotal)).toBe(1024);

    emitter.emit('directPathConfirmed', {
      labels: { region: 'iad', relay_id: 'relay-a', transport: 'quic' },
      elapsedSeconds: 1.2,
      directBytes: 4096,
    });

    expect(await sumValues(dcutrPunchSuccessTotal)).toBe(1);
    expect(await sumValues(dcutrRelayOffloadTotal)).toBe(1);
    expect(await sumValues(dcutrDirectDataBytesTotal)).toBe(4096);

    emitter.emit('holePunchStart', { labels: { region: 'iad', relay_id: 'relay-a', transport: 'quic' } });
    expect(await sumValues(dcutrPunchAttemptsTotal)).toBe(2);

    detach();
  });
});

describe('wireLibp2pDCUtRMetrics', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it('binds common libp2p hole punch events to Prometheus metrics', async () => {
    const registry = new Registry();
    registerDCUtRMetrics(registry);
    const libp2p = new FakeEventTarget();
    const detach = wireLibp2pDCUtRMetrics(libp2p, registry);

    libp2p.emit('relay:connect', { detail: { relayId: 'relay-b', transport: 'quic', region: 'lhr' } });
    libp2p.emit('hole-punch:start', { detail: { relayId: 'relay-b', transport: 'quic', region: 'lhr' } });
    libp2p.emit('hole-punch:success', {
      detail: { relayId: 'relay-b', transport: 'quic', region: 'lhr', elapsedSeconds: 0.75, directBytes: 2048 },
    });
    libp2p.emit('stream:migrate', { detail: { relayId: 'relay-b', transport: 'quic', region: 'lhr', directBytes: 512 } });

    expect(await sumValues(dcutrPunchAttemptsTotal)).toBe(1);
    expect(await sumValues(dcutrPunchSuccessTotal)).toBe(1);
    expect(await sumValues(dcutrRelayOffloadTotal)).toBe(2); // direct confirm + stream migration
    expect(await sumValues(dcutrDirectDataBytesTotal)).toBe(2560);

    detach();
  });
});
