import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics, register as defaultRegistry } from 'prom-client';

// DCUtR (Direct Connection Upgrade through Relay) metric primitives.
// These stubs mirror the libp2p puncher lifecycle so operators can wire telemetry
// before the transport stack is fully live.

export const dcutrPunchAttemptsTotal = new Counter({
  name: 'dcutr_punch_attempts_total',
  help: 'Total hole punch attempts initiated via DCUtR coordination.',
});

export const dcutrPunchSuccessTotal = new Counter({
  name: 'dcutr_punch_success_total',
  help: 'Successful hole punch upgrades that migrated traffic off the relay.',
});

export const dcutrPunchFailureTotal = new Counter({
  name: 'dcutr_punch_failure_total',
  help: 'Failed hole punch attempts that could not establish a direct path.',
});

export const dcutrFallbackRelayTotal = new Counter({
  name: 'dcutr_fallback_relay_total',
  help: 'Connections that remained on the relay after unsuccessful direct upgrade attempts.',
});

export const dcutrRelayOffloadTotal = new Counter({
  name: 'dcutr_relay_offload_total',
  help: 'Connections that successfully offloaded relay usage after establishing direct connectivity.',
});

export const dcutrRelayDataBytesTotal = new Counter({
  name: 'dcutr_relay_data_bytes_total',
  help: 'Bytes transmitted over relay paths during DCUtR sessions.',
});

export const dcutrDirectDataBytesTotal = new Counter({
  name: 'dcutr_direct_data_bytes_total',
  help: 'Bytes transmitted over direct connections after DCUtR upgrade.',
});

export const dcutrTimeToDirectSeconds = new Histogram({
  name: 'dcutr_time_to_direct_seconds',
  help: 'Elapsed seconds from relay rendezvous to confirmed direct path.',
  buckets: [0.25, 0.5, 1, 2, 4, 8, 12, 20, 30],
});

export const dcutrPathQualityRttMs = new Gauge({
  name: 'dcutr_path_quality_rtt_ms',
  help: 'Round-trip time of the selected direct path in milliseconds.',
});

export const dcutrPathQualityLossRate = new Gauge({
  name: 'dcutr_path_quality_loss_rate',
  help: 'Loss rate percentage observed on the selected direct path.',
});

export const dcutrPunchSuccessRate = new Gauge({
  name: 'dcutr_punch_success_rate',
  help: 'Computed success ratio of hole punch attempts vs successes.',
  async collect() {
    const attempts = (await dcutrPunchAttemptsTotal.get()).values?.[0]?.value ?? 0;
    const successes = (await dcutrPunchSuccessTotal.get()).values?.[0]?.value ?? 0;
    if (attempts === 0) {
      this.set(0);
      return;
    }
    this.set(successes / attempts);
  },
});

const DEFAULT_METRIC_NAMES = new Set([
  'process_cpu_user_seconds_total',
  'process_start_time_seconds',
  'process_resident_memory_bytes',
]);

let metricsRegistered = false;

export function registerDCUtRMetrics(registry: Registry = defaultRegistry): void {
  if (metricsRegistered) {
    return;
  }

  const defaultMetricsAlreadyRegistered = registry
    .getMetricsAsArray()
    .some((metric) => DEFAULT_METRIC_NAMES.has(metric.name));

  if (!defaultMetricsAlreadyRegistered) {
    collectDefaultMetrics({ register: registry });
  }
  registry.registerMetric(dcutrPunchAttemptsTotal);
  registry.registerMetric(dcutrPunchSuccessTotal);
  registry.registerMetric(dcutrPunchFailureTotal);
  registry.registerMetric(dcutrPunchSuccessRate);
  registry.registerMetric(dcutrTimeToDirectSeconds);
  registry.registerMetric(dcutrPathQualityRttMs);
  registry.registerMetric(dcutrPathQualityLossRate);
  registry.registerMetric(dcutrFallbackRelayTotal);
  registry.registerMetric(dcutrRelayOffloadTotal);
  registry.registerMetric(dcutrRelayDataBytesTotal);
  registry.registerMetric(dcutrDirectDataBytesTotal);

  metricsRegistered = true;
}

export function onPunchStart(): void {
  dcutrPunchAttemptsTotal.inc();
}

export function onPunchSuccess(): void {
  dcutrPunchSuccessTotal.inc();
}

export function onPunchFailure(): void {
  dcutrPunchFailureTotal.inc();
}

export function onPunchLatency(seconds: number): void {
  dcutrTimeToDirectSeconds.observe(seconds);
}

export function onDirectRttMs(rtt: number): void {
  dcutrPathQualityRttMs.set(rtt);
}

export function onDirectLossRate(percent: number): void {
  dcutrPathQualityLossRate.set(percent);
}

export function onRelayFallback(): void {
  dcutrFallbackRelayTotal.inc();
}

export function onRelayOffload(): void {
  dcutrRelayOffloadTotal.inc();
}

export function onRelayBytes(bytes: number): void {
  dcutrRelayDataBytesTotal.inc(bytes);
}

export function onDirectBytes(bytes: number): void {
  dcutrDirectDataBytesTotal.inc(bytes);
}
