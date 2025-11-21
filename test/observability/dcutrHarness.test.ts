import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Registry } from 'prom-client';
import { startSyntheticDCUtRGenerator } from '../../src/observability/dcutrHarness.js';
import {
  dcutrDirectDataBytesTotal,
  dcutrFallbackRelayTotal,
  dcutrPunchAttemptsTotal,
  dcutrPunchFailureTotal,
  dcutrPunchSuccessTotal,
  dcutrRelayDataBytesTotal,
  registerDCUtRMetrics,
} from '../../observability/prometheus/metrics_dcutr.js';

describe('DCUtR synthetic harness', () => {
  const registry = new Registry();

  beforeEach(() => {
    vi.useFakeTimers();
    registerDCUtRMetrics(registry);
  });

  afterEach(() => {
    vi.useRealTimers();
    registry.resetMetrics();
  });

  it('emits a mix of successes and failures with metrics wired', async () => {
    const deterministic = [0.1, 0.9, 0.2, 0.8, 0.4, 0.6, 0.3, 0.7];
    let idx = 0;
    const rng = () => deterministic[idx++ % deterministic.length];

    startSyntheticDCUtRGenerator({ intervalMs: 10, totalEvents: 6, registry, rng, successRate: 0.5 });

    await vi.advanceTimersByTimeAsync(120);

    const sumValues = async (metric: { get: () => Promise<{ values?: Array<{ value?: number }> } | { values?: Array<{ value?: number }> }> }) => {
      const snapshot = await metric.get();
      return (snapshot?.values ?? []).reduce((acc, entry) => acc + (entry?.value ?? 0), 0);
    };

    const attempts = await sumValues(dcutrPunchAttemptsTotal);
    const success = await sumValues(dcutrPunchSuccessTotal);
    const failure = await sumValues(dcutrPunchFailureTotal);
    const fallbacks = await sumValues(dcutrFallbackRelayTotal);
    const relayBytes = await sumValues(dcutrRelayDataBytesTotal);
    const directBytes = await sumValues(dcutrDirectDataBytesTotal);

    expect(attempts).toBeGreaterThanOrEqual(6);
    expect(success + failure).toBeGreaterThanOrEqual(4);
    expect(fallbacks).toBeGreaterThan(0);
    expect(relayBytes).toBeGreaterThan(0);
    expect(directBytes).toBeGreaterThan(0);
  });
});
