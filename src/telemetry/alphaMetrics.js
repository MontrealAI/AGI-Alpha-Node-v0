function toFiniteNumber(value) {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'bigint') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function applyQualityEntries(gauge, windowLabel, quality = {}) {
  if (!gauge) return;
  const globalValue = toFiniteNumber(quality.global);
  gauge.set({ window: windowLabel, dimension: 'global', key: 'overall' }, globalValue);

  const perAgent = quality.perAgent && typeof quality.perAgent === 'object' ? quality.perAgent : {};
  for (const [key, value] of Object.entries(perAgent)) {
    gauge.set({ window: windowLabel, dimension: 'agent', key }, toFiniteNumber(value));
  }

  const perNode = quality.perNode && typeof quality.perNode === 'object' ? quality.perNode : {};
  for (const [key, value] of Object.entries(perNode)) {
    gauge.set({ window: windowLabel, dimension: 'node', key }, toFiniteNumber(value));
  }

  const perValidator =
    quality.perValidator && typeof quality.perValidator === 'object' ? quality.perValidator : {};
  for (const [key, value] of Object.entries(perValidator)) {
    gauge.set({ window: windowLabel, dimension: 'validator', key }, toFiniteNumber(value));
  }
}

function applyBreakdownEntries(gauge, windowLabel, dimension, breakdown) {
  if (!gauge || !breakdown || typeof breakdown !== 'object') {
    return;
  }
  for (const [key, metrics] of Object.entries(breakdown)) {
    if (!metrics || typeof metrics !== 'object') {
      continue;
    }
    for (const [metricName, value] of Object.entries(metrics)) {
      if (metricName === 'durations') {
        continue;
      }
      gauge.set({ window: windowLabel, dimension, metric: metricName, key }, toFiniteNumber(value));
    }
  }
}

export function applyAlphaWorkUnitMetricsToTelemetry(telemetry, alphaMetrics) {
  if (!telemetry || !alphaMetrics) {
    return;
  }

  const acceptanceGauge = telemetry.alphaAcceptanceGauge;
  const onTimeGauge = telemetry.alphaOnTimeGauge;
  const yieldGauge = telemetry.alphaYieldGauge;
  const qualityGauge = telemetry.alphaQualityGauge;
  const breakdownGauge = telemetry.alphaBreakdownGauge;

  if (acceptanceGauge?.reset) acceptanceGauge.reset();
  if (onTimeGauge?.reset) onTimeGauge.reset();
  if (yieldGauge?.reset) yieldGauge.reset();
  if (qualityGauge?.reset) qualityGauge.reset();
  if (breakdownGauge?.reset) breakdownGauge.reset();

  const overallMetrics = alphaMetrics.overall ?? alphaMetrics;
  const windows = Array.isArray(alphaMetrics.windows) ? alphaMetrics.windows : [];

  const entries = [
    { label: overallMetrics.window ?? 'all', metrics: overallMetrics },
    ...windows.map((entry) => ({ label: entry.window ?? entry.label ?? 'window', metrics: entry }))
  ];

  entries.forEach(({ label, metrics }) => {
    if (!metrics) return;
    const windowLabel = typeof label === 'string' && label.trim().length > 0 ? label : 'window';
    if (acceptanceGauge) {
      acceptanceGauge.set({ window: windowLabel }, toFiniteNumber(metrics.acceptanceRate));
    }
    if (onTimeGauge) {
      onTimeGauge.set({ window: windowLabel }, toFiniteNumber(metrics.onTimeP95Seconds));
    }
    if (yieldGauge) {
      yieldGauge.set({ window: windowLabel }, toFiniteNumber(metrics.slashingAdjustedYield));
    }
    applyQualityEntries(qualityGauge, windowLabel, metrics.quality);
    if (breakdownGauge && metrics.breakdowns) {
      const { breakdowns } = metrics;
      applyBreakdownEntries(breakdownGauge, windowLabel, 'agent', breakdowns.agents);
      applyBreakdownEntries(breakdownGauge, windowLabel, 'node', breakdowns.nodes);
      applyBreakdownEntries(breakdownGauge, windowLabel, 'validator', breakdowns.validators);
    }
  });
}
