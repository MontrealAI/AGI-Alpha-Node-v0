import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { setTimeout as delay } from 'node:timers/promises';
import {
  recordAlphaWorkUnitSegment,
  startMonitoringServer,
  updateAlphaWorkUnitEpochMetrics,
  updateJobsRunning,
  incrementJobsCompleted,
  incrementJobsFailed,
  incrementAlphaWuValidated,
  incrementAlphaWuInvalid,
  observeJobLatencyMs,
  observeAlphaWuValidationLatencyMs,
  __resetMonitoringStateForTests
} from '../src/telemetry/monitoring.js';

const noopLogger = { info: () => {}, warn: () => {}, error: () => {} };

async function waitForServer(server) {
  if (server.listening) return;
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
}

describe('monitoring telemetry server', () => {
  let telemetry;

  beforeEach(() => {
    __resetMonitoringStateForTests();
    telemetry = null;
  });

  afterEach(async () => {
    if (telemetry?.server) {
      await new Promise((resolve) => {
        telemetry.server.close(() => resolve());
      });
      telemetry = null;
    }
  });

  it('serves prometheus metrics populated by the gauges', async () => {
    telemetry = startMonitoringServer({ port: 0, logger: noopLogger, enableAlphaWuPerJob: true });
    await waitForServer(telemetry.server);

    const { port } = telemetry.server.address();
    telemetry.stakeGauge.set(123);
    telemetry.heartbeatGauge.set(456);
    telemetry.jobThroughputGauge.set(3);
    telemetry.jobSuccessGauge.set(0.95);
    telemetry.tokenEarningsGauge.set(1500);
    telemetry.agentUtilizationGauge.set({ agent: 'orion' }, 0.87);
    telemetry.providerModeGauge.set({ mode: 'remote' }, 1);
    telemetry.registryProfileGauge.set({ profile: 'sovereign' }, 1);
    telemetry.registryCompatibilityGauge.set({ profile: 'sovereign', reason: 'abi-drift' }, 1);
    telemetry.alphaAcceptanceGauge.set({ window: 'all' }, 0.82);
    telemetry.alphaOnTimeGauge.set({ window: 'all' }, 123);
    telemetry.alphaYieldGauge.set({ window: 'all' }, 0.047);
    telemetry.alphaQualityGauge.set({ window: 'all', dimension: 'global', key: 'overall' }, 0.91);
    telemetry.alphaBreakdownGauge.set(
      { window: 'all', dimension: 'agent', metric: 'minted', key: 'orion' },
      3
    );
    telemetry.jobsRunningGauge.set(4);
    telemetry.jobsCompletedCounter.inc(9);
    telemetry.jobsFailedCounter.inc(1);
    telemetry.jobLatencySummary.observe(2500);
    telemetry.alphaWuValidatedCounter.inc(5);
    telemetry.alphaWuInvalidCounter.inc(2);
    telemetry.alphaWuValidationLatencySummary.observe(1400);

    recordAlphaWorkUnitSegment({
      nodeLabel: 'node-a',
      deviceClass: 'A100-80GB',
      slaProfile: 'STANDARD',
      jobId: 'job-123',
      epochId: 'epoch-1',
      alphaWU: 5,
      jobTotalAlphaWU: 5
    });

    updateAlphaWorkUnitEpochMetrics([
      { epochId: 'epoch-1', totalAlphaWU: 5 },
      { epochId: 'epoch-2', totalAlphaWU: 7 }
    ]);

    // Allow Prometheus registry to observe the gauge updates.
    await delay(10);

    const metricsResponse = await fetch(`http://127.0.0.1:${port}/metrics`);
    expect(metricsResponse.status).toBe(200);
    const metrics = await metricsResponse.text();

    expect(metrics).toContain('agi_alpha_node_stake_balance');
    expect(metrics).toContain('123');
    expect(metrics).toContain('agi_alpha_node_agent_utilization');
    expect(metrics).toContain('agent="orion"');
    expect(metrics).toContain('agi_alpha_node_provider_mode');
    expect(metrics).toContain('mode="remote"');
    expect(metrics).toContain('agi_alpha_node_registry_compatibility_warning');
    expect(metrics).toContain('reason="abi-drift"');
    expect(metrics).toContain('agi_alpha_node_alpha_wu_acceptance_rate');
    expect(metrics).toContain('agi_alpha_node_alpha_wu_on_time_p95_seconds');
    expect(metrics).toContain('agi_alpha_node_alpha_wu_slash_adjusted_yield');
    expect(metrics).toContain('agi_alpha_node_alpha_wu_quality');
    expect(metrics).toContain('agi_alpha_node_alpha_wu_breakdown');
    expect(metrics).toContain('agi_alpha_node_alpha_wu_total');
    expect(metrics).toContain('alpha_wu_total');
    expect(metrics).toContain('node_label="node-a"');
    expect(metrics).toContain('agi_alpha_node_alpha_wu_epoch');
    expect(metrics).toContain('alpha_wu_epoch');
    expect(metrics).toContain('epoch_id="epoch-1"');
    expect(metrics).toContain('agi_alpha_node_alpha_wu_per_job');
    expect(metrics).toContain('alpha_wu_per_job');
    expect(metrics).toContain('job_id="job-123"');
    expect(metrics).toContain('jobs_running');
    expect(metrics).toContain('jobs_completed_total');
    expect(metrics).toContain('jobs_failed_total');
    expect(metrics).toContain('job_latency_ms');
    expect(metrics).toContain('alpha_wu_validated_total');
    expect(metrics).toContain('alpha_wu_invalid_total');
    expect(metrics).toContain('alpha_wu_validation_latency_ms');
  });

  it('returns 404 for unknown routes', async () => {
    telemetry = startMonitoringServer({ port: 0, logger: noopLogger });
    await waitForServer(telemetry.server);
    const { port } = telemetry.server.address();

    const response = await fetch(`http://127.0.0.1:${port}/health`);
    expect(response.status).toBe(404);
  });

  it('replays metrics recorded before the monitoring server starts', async () => {
    updateJobsRunning(2);
    incrementJobsCompleted(3);
    incrementJobsFailed(1);
    incrementAlphaWuValidated(4);
    incrementAlphaWuInvalid(2);

    recordAlphaWorkUnitSegment({
      nodeLabel: 'node-pre',
      deviceClass: 'H100-80GB',
      slaProfile: 'SOVEREIGN',
      jobId: 'job-pre',
      epochId: 'epoch-pre',
      alphaWU: 3,
      jobTotalAlphaWU: 3
    });

    recordAlphaWorkUnitSegment({
      nodeLabel: 'node-pre',
      deviceClass: 'H100-80GB',
      slaProfile: 'SOVEREIGN',
      jobId: 'job-pre',
      epochId: 'epoch-pre',
      alphaWU: 5,
      jobTotalAlphaWU: 8
    });

    updateAlphaWorkUnitEpochMetrics([{ epochId: 'epoch-pre', totalAlphaWU: 8 }]);

    telemetry = startMonitoringServer({ port: 0, logger: noopLogger, enableAlphaWuPerJob: true });
    await waitForServer(telemetry.server);

    observeJobLatencyMs(620);
    observeAlphaWuValidationLatencyMs(480);

    const { port } = telemetry.server.address();
    await delay(10);

    const metricsResponse = await fetch(`http://127.0.0.1:${port}/metrics`);
    expect(metricsResponse.status).toBe(200);
    const metrics = await metricsResponse.text();

    expect(metrics).toContain('jobs_running 2');
    expect(metrics).toContain('jobs_completed_total 3');
    expect(metrics).toContain('jobs_failed_total 1');
    expect(metrics).toContain('alpha_wu_validated_total 4');
    expect(metrics).toContain('alpha_wu_invalid_total 2');
    expect(metrics).toContain('alpha_wu_total{node_label="node-pre",device_class="H100-80GB",sla_profile="SOVEREIGN"} 8');
    expect(metrics).toContain('alpha_wu_per_job{job_id="job-pre"} 8');
    expect(metrics).toContain('alpha_wu_epoch{epoch_id="epoch-pre"} 8');
  });
});
