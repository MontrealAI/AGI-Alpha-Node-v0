import { describe, beforeAll, afterEach, it, expect } from 'vitest';
import { Registry } from 'prom-client';
import {
  dcutrPunchAttemptsTotal,
  dcutrPunchSuccessTotal,
  dcutrPunchFailureTotal,
  dcutrPunchSuccessRate,
  dcutrTimeToDirectSeconds,
  dcutrPathQualityRttMs,
  dcutrPathQualityLossRate,
  dcutrFallbackRelayTotal,
  dcutrRelayOffloadTotal,
  dcutrRelayDataBytesTotal,
  dcutrDirectDataBytesTotal,
  onPunchStart,
  onPunchSuccess,
  onPunchFailure,
  onPunchLatency,
  onDirectRttMs,
  onDirectLossRate,
  onRelayFallback,
  onRelayOffload,
  onRelayBytes,
  onDirectBytes,
  registerDCUtRMetrics,
} from '../../observability/prometheus/metrics_dcutr.js';

describe('DCUtR Prometheus metrics stub', () => {
  const registry = new Registry();

  beforeAll(() => {
    registerDCUtRMetrics(registry);
  });

  afterEach(() => {
    dcutrPunchAttemptsTotal.reset();
    dcutrPunchSuccessTotal.reset();
    dcutrPunchFailureTotal.reset();
    dcutrPunchSuccessRate.reset();
    dcutrTimeToDirectSeconds.reset();
    dcutrPathQualityRttMs.reset();
    dcutrPathQualityLossRate.reset();
    dcutrFallbackRelayTotal.reset();
    dcutrRelayOffloadTotal.reset();
    dcutrRelayDataBytesTotal.reset();
    dcutrDirectDataBytesTotal.reset();
  });

  it('registers all DCUtR metrics once', () => {
    const names = registry.getMetricsAsArray().map((metric) => metric.name);

    expect(names).toEqual(
      expect.arrayContaining([
        'dcutr_punch_attempts_total',
        'dcutr_punch_success_total',
        'dcutr_punch_failure_total',
        'dcutr_punch_success_rate',
        'dcutr_time_to_direct_seconds',
        'dcutr_path_quality_rtt_ms',
        'dcutr_path_quality_loss_rate',
        'dcutr_fallback_relay_total',
        'dcutr_relay_offload_total',
        'dcutr_relay_data_bytes_total',
        'dcutr_direct_data_bytes_total',
      ]),
    );
  });

  it('collects punch lifecycle gauges, counters, and histograms', async () => {
    // Two attempts: one success, one failure.
    onPunchStart();
    onPunchSuccess();
    onPunchStart();
    onPunchFailure();

    onPunchLatency(2.5);
    onDirectRttMs(42);
    onDirectLossRate(0.5);
    onRelayFallback();
    onRelayOffload();
    onRelayBytes(2048);
    onDirectBytes(4096);

    // Trigger gauge collection for derived success rate.
    await registry.metrics();

    const getSingleValue = async (name: string) => {
      const metric = registry.getSingleMetric(name);
      if (!metric) return 0;
      const { values } = await metric.get();
      return values?.[0]?.value ?? 0;
    };

    const attemptsValue = await getSingleValue('dcutr_punch_attempts_total');
    const successValue = await getSingleValue('dcutr_punch_success_total');
    const failureValue = await getSingleValue('dcutr_punch_failure_total');
    const successRateValue = await getSingleValue('dcutr_punch_success_rate');
    const rttValue = await getSingleValue('dcutr_path_quality_rtt_ms');
    const lossValue = await getSingleValue('dcutr_path_quality_loss_rate');
    const fallbackValue = await getSingleValue('dcutr_fallback_relay_total');
    const offloadValue = await getSingleValue('dcutr_relay_offload_total');
    const relayBytesValue = await getSingleValue('dcutr_relay_data_bytes_total');
    const directBytesValue = await getSingleValue('dcutr_direct_data_bytes_total');

    const latencyBuckets = (await registry.getSingleMetric('dcutr_time_to_direct_seconds')?.get())?.values ?? [];
    const latencySum = latencyBuckets.find((bucket) => bucket.metricName === 'dcutr_time_to_direct_seconds_sum')?.value ?? 0;
    const latencyCount = latencyBuckets.find((bucket) => bucket.metricName === 'dcutr_time_to_direct_seconds_count')?.value ?? 0;

    expect(attemptsValue).toBe(2);
    expect(successValue).toBe(1);
    expect(failureValue).toBe(1);
    expect(successRateValue).toBeCloseTo(0.5);
    expect(rttValue).toBe(42);
    expect(lossValue).toBe(0.5);
    expect(fallbackValue).toBe(1);
    expect(offloadValue).toBe(1);
    expect(relayBytesValue).toBe(2048);
    expect(directBytesValue).toBe(4096);
    expect(latencySum).toBeCloseTo(2.5);
    expect(latencyCount).toBe(1);
  });
});
