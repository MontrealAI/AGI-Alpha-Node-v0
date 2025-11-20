import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
  register as defaultRegistry,
} from 'prom-client';

// DCUtR (Direct Connection Upgrade through Relay) metric primitives.
// These stubs mirror the libp2p puncher lifecycle so operators can wire telemetry
// before the transport stack is fully live.

type DCUtRLabelSet = {
  region?: string;
  asn?: string;
  transport?: string;
  relay_id?: string;
};

type NormalizedLabelSet = Required<DCUtRLabelSet>;

const DEFAULT_LABELS: NormalizedLabelSet = {
  region: 'unknown',
  asn: 'unknown',
  transport: 'unknown',
  relay_id: 'unknown',
};

const LABEL_NAMES = ['region', 'asn', 'transport', 'relay_id'] as const;

function normalizeLabels(labels?: DCUtRLabelSet): NormalizedLabelSet {
  return {
    region: labels?.region ?? DEFAULT_LABELS.region,
    asn: labels?.asn ?? DEFAULT_LABELS.asn,
    transport: labels?.transport ?? DEFAULT_LABELS.transport,
    relay_id: labels?.relay_id ?? DEFAULT_LABELS.relay_id,
  };
}

function labelKey(labelSet: NormalizedLabelSet): string {
  return `${labelSet.region}|${labelSet.asn}|${labelSet.transport}|${labelSet.relay_id}`;
}

export const dcutrPunchAttemptsTotal = new Counter({
  name: 'dcutr_punch_attempts_total',
  help: 'Total hole punch attempts initiated via DCUtR coordination.',
  labelNames: LABEL_NAMES,
});

export const dcutrPunchSuccessTotal = new Counter({
  name: 'dcutr_punch_success_total',
  help: 'Successful hole punch upgrades that migrated traffic off the relay.',
  labelNames: LABEL_NAMES,
});

export const dcutrPunchFailureTotal = new Counter({
  name: 'dcutr_punch_failure_total',
  help: 'Failed hole punch attempts that could not establish a direct path.',
  labelNames: LABEL_NAMES,
});

export const dcutrFallbackRelayTotal = new Counter({
  name: 'dcutr_fallback_relay_total',
  help: 'Connections that remained on the relay after unsuccessful direct upgrade attempts.',
  labelNames: LABEL_NAMES,
});

export const dcutrRelayOffloadTotal = new Counter({
  name: 'dcutr_relay_offload_total',
  help: 'Connections that successfully offloaded relay usage after establishing direct connectivity.',
  labelNames: LABEL_NAMES,
});

export const dcutrRelayDataBytesTotal = new Counter({
  name: 'dcutr_relay_data_bytes_total',
  help: 'Bytes transmitted over relay paths during DCUtR sessions.',
  labelNames: LABEL_NAMES,
});

export const dcutrDirectDataBytesTotal = new Counter({
  name: 'dcutr_direct_data_bytes_total',
  help: 'Bytes transmitted over direct connections after DCUtR upgrade.',
  labelNames: LABEL_NAMES,
});

export const dcutrTimeToDirectSeconds = new Histogram({
  name: 'dcutr_time_to_direct_seconds',
  help: 'Elapsed seconds from relay rendezvous to confirmed direct path.',
  buckets: [0.25, 0.5, 1, 2, 4, 8, 12, 20, 30],
  labelNames: LABEL_NAMES,
});

export const dcutrPathQualityRttMs = new Gauge({
  name: 'dcutr_path_quality_rtt_ms',
  help: 'Round-trip time of the selected direct path in milliseconds.',
  labelNames: LABEL_NAMES,
});

export const dcutrPathQualityLossRate = new Gauge({
  name: 'dcutr_path_quality_loss_rate',
  help: 'Loss rate percentage observed on the selected direct path.',
  labelNames: LABEL_NAMES,
});

export const dcutrPunchSuccessRate = new Gauge({
  name: 'dcutr_punch_success_rate',
  help: 'Computed success ratio of hole punch attempts vs successes.',
  labelNames: LABEL_NAMES,
  async collect() {
    const attempts = await dcutrPunchAttemptsTotal.get();
    const successes = await dcutrPunchSuccessTotal.get();

    const attemptMap = new Map<string, { value: number; labels: NormalizedLabelSet }>();
    for (const attempt of attempts.values ?? []) {
      const normalized = normalizeLabels(attempt.labels as DCUtRLabelSet);
      attemptMap.set(labelKey(normalized), { value: attempt.value, labels: normalized });
    }

    const successMap = new Map<string, { value: number; labels: NormalizedLabelSet }>();
    for (const success of successes.values ?? []) {
      const normalized = normalizeLabels(success.labels as DCUtRLabelSet);
      successMap.set(labelKey(normalized), { value: success.value, labels: normalized });
    }

    const labelKeys = new Set([...attemptMap.keys(), ...successMap.keys()]);
    for (const key of labelKeys) {
      const attemptEntry = attemptMap.get(key);
      const successEntry = successMap.get(key);
      const attemptCount = attemptEntry?.value ?? 0;
      const successCount = successEntry?.value ?? 0;
      const labels = attemptEntry?.labels ?? successEntry?.labels ?? DEFAULT_LABELS;
      const rate = attemptCount === 0 ? 0 : successCount / attemptCount;
      this.labels(labels).set(rate);
    }
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

export function onPunchStart(labels?: DCUtRLabelSet): void {
  const normalized = normalizeLabels(labels);
  dcutrPunchAttemptsTotal.labels(normalized).inc();
}

export function onPunchSuccess(labels?: DCUtRLabelSet): void {
  const normalized = normalizeLabels(labels);
  dcutrPunchSuccessTotal.labels(normalized).inc();
}

export function onPunchFailure(labels?: DCUtRLabelSet): void {
  const normalized = normalizeLabels(labels);
  dcutrPunchFailureTotal.labels(normalized).inc();
}

export function onPunchLatency(seconds: number, labels?: DCUtRLabelSet): void {
  const normalized = normalizeLabels(labels);
  dcutrTimeToDirectSeconds.observe(normalized, seconds);
}

export function onDirectRttMs(rtt: number, labels?: DCUtRLabelSet): void {
  const normalized = normalizeLabels(labels);
  dcutrPathQualityRttMs.labels(normalized).set(rtt);
}

export function onDirectLossRate(percent: number, labels?: DCUtRLabelSet): void {
  const normalized = normalizeLabels(labels);
  dcutrPathQualityLossRate.labels(normalized).set(percent);
}

export function onRelayFallback(labels?: DCUtRLabelSet): void {
  const normalized = normalizeLabels(labels);
  dcutrFallbackRelayTotal.labels(normalized).inc();
}

export function onRelayOffload(labels?: DCUtRLabelSet): void {
  const normalized = normalizeLabels(labels);
  dcutrRelayOffloadTotal.labels(normalized).inc();
}

export function onRelayBytes(bytes: number, labels?: DCUtRLabelSet): void {
  const normalized = normalizeLabels(labels);
  dcutrRelayDataBytesTotal.labels(normalized).inc(bytes);
}

export function onDirectBytes(bytes: number, labels?: DCUtRLabelSet): void {
  const normalized = normalizeLabels(labels);
  dcutrDirectDataBytesTotal.labels(normalized).inc(bytes);
}
