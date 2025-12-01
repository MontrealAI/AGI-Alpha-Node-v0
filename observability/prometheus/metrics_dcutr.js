import { Counter, Gauge, Histogram, collectDefaultMetrics, register as defaultRegistry } from 'prom-client';

/**
 * @typedef {object} DCUtRLabelSet
 * @property {string} [region]
 * @property {string} [asn]
 * @property {string} [transport]
 * @property {string} [relay_id]
 */

/** @typedef {Required<DCUtRLabelSet>} NormalizedLabelSet */

/** @type {NormalizedLabelSet} */
const DEFAULT_LABELS = {
  region: 'unknown',
  asn: 'unknown',
  transport: 'unknown',
  relay_id: 'unknown',
};

const LABEL_NAMES = ['region', 'asn', 'transport', 'relay_id'];

function getOrCreateCounter(registry, options) {
  const existing = registry.getSingleMetric(options.name);
  if (existing instanceof Counter) return existing;
  if (existing) {
    registry.removeSingleMetric(options.name);
  }
  return new Counter({ ...options, registers: [] });
}

function getOrCreateGauge(registry, options) {
  const existing = registry.getSingleMetric(options.name);
  if (existing instanceof Gauge) return existing;
  if (existing) {
    registry.removeSingleMetric(options.name);
  }
  return new Gauge({ ...options, registers: [] });
}

function getOrCreateHistogram(registry, options) {
  const existing = registry.getSingleMetric(options.name);
  if (existing instanceof Histogram) return existing;
  if (existing) {
    registry.removeSingleMetric(options.name);
  }
  return new Histogram({ ...options, registers: [] });
}

/**
 * @param {DCUtRLabelSet} [labels]
 * @returns {NormalizedLabelSet}
 */
function normalizeLabels(labels) {
  return {
    region: labels?.region ?? DEFAULT_LABELS.region,
    asn: labels?.asn ?? DEFAULT_LABELS.asn,
    transport: labels?.transport ?? DEFAULT_LABELS.transport,
    relay_id: labels?.relay_id ?? DEFAULT_LABELS.relay_id,
  };
}

/**
 * @param {NormalizedLabelSet} labelSet
 * @returns {string}
 */
function labelKey(labelSet) {
  return `${labelSet.region}|${labelSet.asn}|${labelSet.transport}|${labelSet.relay_id}`;
}

export const dcutrPunchAttemptsTotal = getOrCreateCounter(defaultRegistry, {
  name: 'dcutr_punch_attempts_total',
  help: 'Total hole punch attempts initiated via DCUtR coordination.',
  labelNames: LABEL_NAMES,
});

export const dcutrPunchSuccessTotal = getOrCreateCounter(defaultRegistry, {
  name: 'dcutr_punch_success_total',
  help: 'Successful hole punch upgrades that migrated traffic off the relay.',
  labelNames: LABEL_NAMES,
});

export const dcutrPunchFailureTotal = getOrCreateCounter(defaultRegistry, {
  name: 'dcutr_punch_failure_total',
  help: 'Failed hole punch attempts that could not establish a direct path.',
  labelNames: LABEL_NAMES,
});

export const dcutrFallbackRelayTotal = getOrCreateCounter(defaultRegistry, {
  name: 'dcutr_fallback_relay_total',
  help: 'Connections that remained on the relay after unsuccessful direct upgrade attempts.',
  labelNames: LABEL_NAMES,
});

export const dcutrRelayOffloadTotal = getOrCreateCounter(defaultRegistry, {
  name: 'dcutr_relay_offload_total',
  help: 'Connections that successfully offloaded relay usage after establishing direct connectivity.',
  labelNames: LABEL_NAMES,
});

export const dcutrRelayDataBytesTotal = getOrCreateCounter(defaultRegistry, {
  name: 'dcutr_relay_data_bytes_total',
  help: 'Bytes transmitted over relay paths during DCUtR sessions.',
  labelNames: LABEL_NAMES,
});

export const dcutrDirectDataBytesTotal = getOrCreateCounter(defaultRegistry, {
  name: 'dcutr_direct_data_bytes_total',
  help: 'Bytes transmitted over direct connections after DCUtR upgrade.',
  labelNames: LABEL_NAMES,
});

export const dcutrTimeToDirectSeconds = getOrCreateHistogram(defaultRegistry, {
  name: 'dcutr_time_to_direct_seconds',
  help: 'Elapsed seconds from relay rendezvous to confirmed direct path.',
  buckets: [0.25, 0.5, 1, 2, 4, 8, 12, 20, 30],
  labelNames: LABEL_NAMES,
});

export const dcutrPathQualityRttMs = getOrCreateGauge(defaultRegistry, {
  name: 'dcutr_path_quality_rtt_ms',
  help: 'Round-trip time of the selected direct path in milliseconds.',
  labelNames: LABEL_NAMES,
});

export const dcutrPathQualityLossRate = getOrCreateGauge(defaultRegistry, {
  name: 'dcutr_path_quality_loss_rate',
  help: 'Loss rate percentage observed on the selected direct path.',
  labelNames: LABEL_NAMES,
});

export const dcutrPunchSuccessRate = getOrCreateGauge(defaultRegistry, {
  name: 'dcutr_punch_success_rate',
  help: 'Computed success ratio of hole punch attempts vs successes.',
  labelNames: LABEL_NAMES,
  async collect() {
    const attempts = await dcutrPunchAttemptsTotal.get();
    const successes = await dcutrPunchSuccessTotal.get();

    const attemptMap = new Map();
    for (const attempt of attempts.values ?? []) {
      const normalized = normalizeLabels(attempt.labels);
      attemptMap.set(labelKey(normalized), { value: attempt.value, labels: normalized });
    }

    const successMap = new Map();
    for (const success of successes.values ?? []) {
      const normalized = normalizeLabels(success.labels);
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

const registeredRegistries = new WeakSet();

/**
 * @param {Registry} [registry]
 */
export function registerDCUtRMetrics(registry = defaultRegistry) {
  if (registeredRegistries.has(registry)) {
    return;
  }

  const metrics = [
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
  ];

  const defaultMetricsAlreadyRegistered = registry
    .getMetricsAsArray()
    .some((metric) => DEFAULT_METRIC_NAMES.has(metric.name));

  if (!defaultMetricsAlreadyRegistered) {
    collectDefaultMetrics({ register: registry });
  }
  for (const metric of metrics) {
    if (!registry.getSingleMetric(metric.name)) {
      registry.registerMetric(metric);
    }
  }

  registeredRegistries.add(registry);
}

/**
 * @param {DCUtRLabelSet} [labels]
 */
export function onPunchStart(labels) {
  const normalized = normalizeLabels(labels);
  dcutrPunchAttemptsTotal.labels(normalized).inc();
}

/**
 * @param {DCUtRLabelSet} [labels]
 */
export function onPunchSuccess(labels) {
  const normalized = normalizeLabels(labels);
  dcutrPunchSuccessTotal.labels(normalized).inc();
}

/**
 * @param {DCUtRLabelSet} [labels]
 */
export function onPunchFailure(labels) {
  const normalized = normalizeLabels(labels);
  dcutrPunchFailureTotal.labels(normalized).inc();
}

/**
 * @param {number} seconds
 * @param {DCUtRLabelSet} [labels]
 */
export function onPunchLatency(seconds, labels) {
  const normalized = normalizeLabels(labels);
  dcutrTimeToDirectSeconds.observe(normalized, seconds);
}

/**
 * @param {number} rtt
 * @param {DCUtRLabelSet} [labels]
 */
export function onDirectRttMs(rtt, labels) {
  const normalized = normalizeLabels(labels);
  dcutrPathQualityRttMs.labels(normalized).set(rtt);
}

/**
 * @param {number} percent
 * @param {DCUtRLabelSet} [labels]
 */
export function onDirectLossRate(percent, labels) {
  const normalized = normalizeLabels(labels);
  dcutrPathQualityLossRate.labels(normalized).set(percent);
}

/**
 * @param {DCUtRLabelSet} [labels]
 */
export function onRelayFallback(labels) {
  const normalized = normalizeLabels(labels);
  dcutrFallbackRelayTotal.labels(normalized).inc();
}

/**
 * @param {DCUtRLabelSet} [labels]
 */
export function onRelayOffload(labels) {
  const normalized = normalizeLabels(labels);
  dcutrRelayOffloadTotal.labels(normalized).inc();
}

/**
 * @param {number} bytes
 * @param {DCUtRLabelSet} [labels]
 */
export function onRelayBytes(bytes, labels) {
  const normalized = normalizeLabels(labels);
  dcutrRelayDataBytesTotal.labels(normalized).inc(bytes);
}

/**
 * @param {number} bytes
 * @param {DCUtRLabelSet} [labels]
 */
export function onDirectBytes(bytes, labels) {
  const normalized = normalizeLabels(labels);
  dcutrDirectDataBytesTotal.labels(normalized).inc(bytes);
}

export { normalizeLabels };
