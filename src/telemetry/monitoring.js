import http from 'node:http';
import { collectDefaultMetrics, Counter, Gauge, Registry, Summary } from 'prom-client';

const alphaWuMetricState = {
  totalCounters: [],
  epochGauges: [],
  perJobGauges: [],
  perJobEnabled: false
};

const jobMetricState = {
  runningGauge: null,
  completedCounter: null,
  failedCounter: null,
  latencySummary: null,
  runningCount: 0,
  completedTotal: 0,
  failedTotal: 0
};

const alphaValidationMetricState = {
  validatedCounter: null,
  invalidCounter: null,
  latencySummary: null,
  validatedTotal: 0,
  invalidTotal: 0
};

function registerAlphaWuMetricHandles({
  totalCounters = [],
  epochGauges = [],
  perJobGauges = [],
  perJobEnabled = false
} = {}) {
  alphaWuMetricState.totalCounters = Array.isArray(totalCounters)
    ? totalCounters.filter(Boolean)
    : [totalCounters].filter(Boolean);
  alphaWuMetricState.epochGauges = Array.isArray(epochGauges)
    ? epochGauges.filter(Boolean)
    : [epochGauges].filter(Boolean);
  alphaWuMetricState.perJobGauges = Array.isArray(perJobGauges)
    ? perJobGauges.filter(Boolean)
    : [perJobGauges].filter(Boolean);
  alphaWuMetricState.perJobEnabled = Boolean(perJobEnabled && alphaWuMetricState.perJobGauges.length > 0);
}

function registerJobMetricHandles({ runningGauge = null, completedCounter = null, failedCounter = null, latencySummary = null } = {}) {
  jobMetricState.runningGauge = runningGauge ?? null;
  jobMetricState.completedCounter = completedCounter ?? null;
  jobMetricState.failedCounter = failedCounter ?? null;
  jobMetricState.latencySummary = latencySummary ?? null;

  if (jobMetricState.runningGauge) {
    jobMetricState.runningGauge.set(Number.isFinite(jobMetricState.runningCount) ? jobMetricState.runningCount : 0);
  }
  if (jobMetricState.completedCounter && Number.isFinite(jobMetricState.completedTotal) && jobMetricState.completedTotal > 0) {
    jobMetricState.completedCounter.inc(jobMetricState.completedTotal);
  }
  if (jobMetricState.failedCounter && Number.isFinite(jobMetricState.failedTotal) && jobMetricState.failedTotal > 0) {
    jobMetricState.failedCounter.inc(jobMetricState.failedTotal);
  }
}

function registerAlphaValidationMetricHandles({
  validatedCounter = null,
  invalidCounter = null,
  latencySummary = null
} = {}) {
  alphaValidationMetricState.validatedCounter = validatedCounter ?? null;
  alphaValidationMetricState.invalidCounter = invalidCounter ?? null;
  alphaValidationMetricState.latencySummary = latencySummary ?? null;

  if (
    alphaValidationMetricState.validatedCounter &&
    Number.isFinite(alphaValidationMetricState.validatedTotal) &&
    alphaValidationMetricState.validatedTotal > 0
  ) {
    alphaValidationMetricState.validatedCounter.inc(alphaValidationMetricState.validatedTotal);
  }
  if (
    alphaValidationMetricState.invalidCounter &&
    Number.isFinite(alphaValidationMetricState.invalidTotal) &&
    alphaValidationMetricState.invalidTotal > 0
  ) {
    alphaValidationMetricState.invalidCounter.inc(alphaValidationMetricState.invalidTotal);
  }
}

function normaliseLabel(value, fallback = 'unknown') {
  if (value === null || value === undefined) {
    return fallback;
  }
  const stringValue = String(value).trim();
  return stringValue.length > 0 ? stringValue : fallback;
}

export function recordAlphaWorkUnitSegment({
  nodeLabel,
  deviceClass,
  slaProfile,
  jobId,
  epochId,
  alphaWU,
  jobTotalAlphaWU
}) {
  if (
    alphaWuMetricState.totalCounters.length === 0 &&
    !alphaWuMetricState.perJobEnabled &&
    alphaWuMetricState.epochGauges.length === 0
  ) {
    return;
  }

  const numericAlphaWu = Number(alphaWU ?? 0);
  if (Number.isFinite(numericAlphaWu) && numericAlphaWu > 0 && alphaWuMetricState.totalCounters.length > 0) {
    const labels = {
      node_label: normaliseLabel(nodeLabel),
      device_class: normaliseLabel(deviceClass, 'UNKNOWN'),
      sla_profile: normaliseLabel(slaProfile, 'UNKNOWN')
    };
    alphaWuMetricState.totalCounters.forEach((counter) => {
      counter.inc(labels, numericAlphaWu);
    });
  }

  if (alphaWuMetricState.perJobEnabled && jobId) {
    const jobTotal = Number(jobTotalAlphaWU ?? 0);
    if (Number.isFinite(jobTotal)) {
      const labels = { job_id: normaliseLabel(jobId) };
      alphaWuMetricState.perJobGauges.forEach((gauge) => {
        gauge.set(labels, jobTotal);
      });
    }
  }

  if (alphaWuMetricState.epochGauges.length > 0 && epochId && Number.isFinite(numericAlphaWu) && numericAlphaWu > 0) {
    const labels = { epoch_id: normaliseLabel(epochId) };
    alphaWuMetricState.epochGauges.forEach((gauge) => {
      // epochGauge is populated via monitor loop rollups. Ensure the label is registered early
      gauge.set(labels, 0);
    });
  }
}

export function updateAlphaWorkUnitEpochMetrics(summaries = []) {
  if (alphaWuMetricState.epochGauges.length === 0) {
    return;
  }
  alphaWuMetricState.epochGauges.forEach((gauge) => gauge.reset());
  summaries.forEach((summary) => {
    if (!summary) return;
    const total = Number(summary.totalAlphaWU ?? 0);
    if (!Number.isFinite(total)) {
      return;
    }
    const epochId = normaliseLabel(summary.epochId);
    alphaWuMetricState.epochGauges.forEach((gauge) => {
      gauge.set({ epoch_id: epochId }, total);
    });
  });
}

export function startMonitoringServer({ port = 9464, logger, enableAlphaWuPerJob = false } = {}) {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: 'agi_alpha_node_' });

  const stakeGauge = new Gauge({
    name: 'agi_alpha_node_stake_balance',
    help: 'Current $AGIALPHA stake recorded for this operator',
    registers: [registry]
  });

  const heartbeatGauge = new Gauge({
    name: 'agi_alpha_node_last_heartbeat',
    help: 'Last heartbeat timestamp observed for the operator',
    registers: [registry]
  });

  const jobThroughputGauge = new Gauge({
    name: 'agi_alpha_node_job_throughput',
    help: 'Jobs completed per monitor interval based on swarm orchestration',
    registers: [registry]
  });

  const jobSuccessGauge = new Gauge({
    name: 'agi_alpha_node_job_success_rate',
    help: 'Rolling success ratio of historical jobs (0-1 scale)',
    registers: [registry]
  });

  const tokenEarningsGauge = new Gauge({
    name: 'agi_alpha_node_token_earnings_projection',
    help: 'Projected $AGIALPHA earnings for the upcoming epoch',
    registers: [registry]
  });

  const agentUtilizationGauge = new Gauge({
    name: 'agi_alpha_node_agent_utilization',
    help: 'Utilization ratio per sub-agent derived from the orchestrator',
    labelNames: ['agent'],
    registers: [registry]
  });

  const providerModeGauge = new Gauge({
    name: 'agi_alpha_node_provider_mode',
    help: 'Current intelligence provider mode (remote, local, offline)',
    labelNames: ['mode'],
    registers: [registry]
  });

  const registryProfileGauge = new Gauge({
    name: 'agi_alpha_node_registry_profile',
    help: 'Active JobRegistry profile indicator',
    labelNames: ['profile'],
    registers: [registry]
  });

  const registryCompatibilityGauge = new Gauge({
    name: 'agi_alpha_node_registry_compatibility_warning',
    help: 'ABI compatibility warnings detected for the active JobRegistry profile',
    labelNames: ['profile', 'reason'],
    registers: [registry]
  });

  const healthGateGauge = new Gauge({
    name: 'agi_alpha_node_health_gate_state',
    help: 'Current health gate posture based on ENS allowlist and stake readiness',
    labelNames: ['state'],
    registers: [registry]
  });

  const alphaAcceptanceGauge = new Gauge({
    name: 'agi_alpha_node_alpha_wu_acceptance_rate',
    help: 'Acceptance rate for alpha work units (0-1 scale)',
    labelNames: ['window'],
    registers: [registry]
  });

  const alphaOnTimeGauge = new Gauge({
    name: 'agi_alpha_node_alpha_wu_on_time_p95_seconds',
    help: 'p95 completion latency for alpha work units in seconds',
    labelNames: ['window'],
    registers: [registry]
  });

  const alphaYieldGauge = new Gauge({
    name: 'agi_alpha_node_alpha_wu_slash_adjusted_yield',
    help: 'Slashing-adjusted yield for alpha work units',
    labelNames: ['window'],
    registers: [registry]
  });

  const alphaQualityGauge = new Gauge({
    name: 'agi_alpha_node_alpha_wu_quality',
    help: 'Validator-weighted quality score for alpha work units by dimension',
    labelNames: ['window', 'dimension', 'key'],
    registers: [registry]
  });

  const alphaBreakdownGauge = new Gauge({
    name: 'agi_alpha_node_alpha_wu_breakdown',
    help: 'Alpha work unit KPI breakdowns by dimension and metric',
    labelNames: ['window', 'dimension', 'metric', 'key'],
    registers: [registry]
  });

  const alphaWuTotalCounterCompat = new Counter({
    name: 'agi_alpha_node_alpha_wu_total',
    help: 'Cumulative alpha work units recorded by node/device/SLA profile',
    labelNames: ['node_label', 'device_class', 'sla_profile'],
    registers: [registry]
  });

  const alphaWuEpochGaugeCompat = new Gauge({
    name: 'agi_alpha_node_alpha_wu_epoch',
    help: 'Alpha work units aggregated per epoch',
    labelNames: ['epoch_id'],
    registers: [registry]
  });

  const alphaWuPerJobGaugeCompat = enableAlphaWuPerJob
    ? new Gauge({
        name: 'agi_alpha_node_alpha_wu_per_job',
        help: 'Alpha work units accumulated per job (high cardinality metric)',
        labelNames: ['job_id'],
        registers: [registry]
      })
    : null;

  const alphaWuTotalCounter = new Counter({
    name: 'alpha_wu_total',
    help: 'Cumulative alpha work units recorded by node/device/SLA profile',
    labelNames: ['node_label', 'device_class', 'sla_profile'],
    registers: [registry]
  });

  const alphaWuEpochGauge = new Gauge({
    name: 'alpha_wu_epoch',
    help: 'Alpha work units aggregated per epoch',
    labelNames: ['epoch_id'],
    registers: [registry]
  });

  const alphaWuPerJobGauge = enableAlphaWuPerJob
    ? new Gauge({
        name: 'alpha_wu_per_job',
        help: 'Alpha work units accumulated per job (high cardinality metric)',
        labelNames: ['job_id'],
        registers: [registry]
      })
    : null;

  registerAlphaWuMetricHandles({
    totalCounters: [alphaWuTotalCounterCompat, alphaWuTotalCounter],
    epochGauges: [alphaWuEpochGaugeCompat, alphaWuEpochGauge],
    perJobGauges: [alphaWuPerJobGaugeCompat, alphaWuPerJobGauge].filter(Boolean),
    perJobEnabled: enableAlphaWuPerJob
  });

  const jobsRunningGauge = new Gauge({
    name: 'jobs_running',
    help: 'Number of jobs currently executing on this node',
    registers: [registry]
  });

  const jobsCompletedCounter = new Counter({
    name: 'jobs_completed_total',
    help: 'Total number of jobs completed successfully by this node',
    registers: [registry]
  });

  const jobsFailedCounter = new Counter({
    name: 'jobs_failed_total',
    help: 'Total number of jobs that failed or were cancelled on this node',
    registers: [registry]
  });

  const jobLatencySummary = new Summary({
    name: 'job_latency_ms',
    help: 'End-to-end job latency (application to completion) in milliseconds',
    percentiles: [0.5, 0.95, 0.99],
    maxAgeSeconds: 300,
    ageBuckets: 5,
    registers: [registry]
  });

  const alphaWuValidatedCounter = new Counter({
    name: 'alpha_wu_validated_total',
    help: 'Count of alpha work units validated successfully',
    registers: [registry]
  });

  const alphaWuInvalidCounter = new Counter({
    name: 'alpha_wu_invalid_total',
    help: 'Count of alpha work units rejected or slashed during validation',
    registers: [registry]
  });

  const alphaWuValidationLatencySummary = new Summary({
    name: 'alpha_wu_validation_latency_ms',
    help: 'Latency between alpha work unit minting and validation in milliseconds',
    percentiles: [0.5, 0.95, 0.99],
    maxAgeSeconds: 300,
    ageBuckets: 5,
    registers: [registry]
  });

  registerJobMetricHandles({
    runningGauge: jobsRunningGauge,
    completedCounter: jobsCompletedCounter,
    failedCounter: jobsFailedCounter,
    latencySummary: jobLatencySummary
  });

  registerAlphaValidationMetricHandles({
    validatedCounter: alphaWuValidatedCounter,
    invalidCounter: alphaWuInvalidCounter,
    latencySummary: alphaWuValidationLatencySummary
  });

  const server = http.createServer(async (req, res) => {
    if (req.url === '/metrics') {
      const metrics = await registry.metrics();
      res.writeHead(200, { 'Content-Type': registry.contentType });
      res.end(metrics);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(port, () => {
    logger?.info?.({ port }, 'Telemetry server listening');
  });

  return {
    registry,
    server,
    stakeGauge,
    heartbeatGauge,
    jobThroughputGauge,
    jobSuccessGauge,
    tokenEarningsGauge,
    agentUtilizationGauge,
    providerModeGauge,
    registryProfileGauge,
    registryCompatibilityGauge,
    healthGateGauge,
    alphaAcceptanceGauge,
    alphaOnTimeGauge,
    alphaYieldGauge,
    alphaQualityGauge,
    alphaBreakdownGauge,
    alphaWuTotalCounter,
    alphaWuEpochGauge,
    alphaWuPerJobGauge,
    alphaWuTotalCounterCompat,
    alphaWuEpochGaugeCompat,
    alphaWuPerJobGaugeCompat,
    jobsRunningGauge,
    jobsCompletedCounter,
    jobsFailedCounter,
    jobLatencySummary,
    alphaWuValidatedCounter,
    alphaWuInvalidCounter,
    alphaWuValidationLatencySummary
  };
}

export function updateJobsRunning(count) {
  const numeric = Number(count);
  const safeValue = Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
  jobMetricState.runningCount = safeValue;
  if (jobMetricState.runningGauge) {
    jobMetricState.runningGauge.set(safeValue);
  }
}

export function incrementJobsCompleted(count = 1) {
  const numeric = Number(count);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return;
  }
  jobMetricState.completedTotal += numeric;
  if (jobMetricState.completedCounter) {
    jobMetricState.completedCounter.inc(numeric);
  }
}

export function incrementJobsFailed(count = 1) {
  const numeric = Number(count);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return;
  }
  jobMetricState.failedTotal += numeric;
  if (jobMetricState.failedCounter) {
    jobMetricState.failedCounter.inc(numeric);
  }
}

export function observeJobLatencyMs(durationMs) {
  const numeric = Number(durationMs);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return;
  }
  if (jobMetricState.latencySummary) {
    jobMetricState.latencySummary.observe(numeric);
  }
}

export function incrementAlphaWuValidated(count = 1) {
  const numeric = Number(count);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return;
  }
  alphaValidationMetricState.validatedTotal += numeric;
  if (alphaValidationMetricState.validatedCounter) {
    alphaValidationMetricState.validatedCounter.inc(numeric);
  }
}

export function incrementAlphaWuInvalid(count = 1) {
  const numeric = Number(count);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return;
  }
  alphaValidationMetricState.invalidTotal += numeric;
  if (alphaValidationMetricState.invalidCounter) {
    alphaValidationMetricState.invalidCounter.inc(numeric);
  }
}

export function observeAlphaWuValidationLatencyMs(durationMs) {
  const numeric = Number(durationMs);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return;
  }
  if (alphaValidationMetricState.latencySummary) {
    alphaValidationMetricState.latencySummary.observe(numeric);
  }
}
