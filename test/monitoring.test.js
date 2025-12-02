import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { Registry } from 'prom-client';
import { EventEmitter } from 'node:events';
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
import { createPeerScoreRegistry } from '../src/services/peerScoring.js';
import { createReachabilityState } from '../src/network/transportConfig.js';
import {
  dcutrDirectDataBytesTotal,
  dcutrPunchAttemptsTotal,
  dcutrPunchSuccessTotal,
  dcutrRelayDataBytesTotal,
  dcutrRelayOffloadTotal
} from '../observability/prometheus/metrics_dcutr.js';

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
    dcutrPunchAttemptsTotal.reset();
    dcutrPunchSuccessTotal.reset();
    dcutrRelayOffloadTotal.reset();
    dcutrRelayDataBytesTotal.reset();
    dcutrDirectDataBytesTotal.reset();
    telemetry = null;
  });

  afterEach(async () => {
    if (telemetry?.stop) {
      await telemetry.stop();
    } else if (telemetry?.server) {
      await new Promise((resolve) => {
        telemetry.server.close(() => resolve());
      });
    }
    telemetry = null;
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

  it('returns a 500 when the registry fails to produce metrics', async () => {
    const failingRegistry = new Registry();
    failingRegistry.metrics = async () => {
      throw new Error('registry exploded');
    };

    telemetry = startMonitoringServer({ port: 0, logger: noopLogger, registry: failingRegistry });
    await waitForServer(telemetry.server);

    const { port } = telemetry.server.address();
    const response = await fetch(`http://127.0.0.1:${port}/metrics`);

    expect(response.status).toBe(500);
    expect(await response.text()).toContain('failed to collect metrics');
  });

  it('streams reachability gauge updates from a provided reachability state', async () => {
    const reachabilityState = createReachabilityState({ initial: 'private' });
    telemetry = startMonitoringServer({ port: 0, logger: noopLogger, reachabilityState });
    await waitForServer(telemetry.server);
    const { port } = telemetry.server.address();

    await delay(10);
    let metricsResponse = await fetch(`http://127.0.0.1:${port}/metrics`);
    let metrics = await metricsResponse.text();
    expect(metrics).toContain('net_reachability_state 1');

    reachabilityState.updateManual('public');
    await delay(10);

    metricsResponse = await fetch(`http://127.0.0.1:${port}/metrics`);
    metrics = await metricsResponse.text();
    expect(metrics).toContain('net_reachability_state 2');
  });

  it('returns 404 for unknown routes', async () => {
    telemetry = startMonitoringServer({ port: 0, logger: noopLogger });
    await waitForServer(telemetry.server);
    const { port } = telemetry.server.address();

    const response = await fetch(`http://127.0.0.1:${port}/health`);
    expect(response.status).toBe(404);
  });

  it('does not cache per-job totals when the feature is disabled', async () => {
    recordAlphaWorkUnitSegment({
      nodeLabel: 'node-disabled',
      deviceClass: 'L40S',
      slaProfile: 'STANDARD',
      jobId: 'job-disabled',
      epochId: 'epoch-disabled',
      alphaWU: 1,
      jobTotalAlphaWU: 1
    });

    telemetry = startMonitoringServer({ port: 0, logger: noopLogger, enableAlphaWuPerJob: false });
    await waitForServer(telemetry.server);
    const { port: disabledPort } = telemetry.server.address();
    await delay(10);

    let metricsResponse = await fetch(`http://127.0.0.1:${disabledPort}/metrics`);
    expect(metricsResponse.status).toBe(200);
    let metrics = await metricsResponse.text();
    expect(metrics).not.toContain('alpha_wu_per_job');
    expect(metrics).not.toContain('job_id="job-disabled"');

    await new Promise((resolve) => telemetry.server.close(resolve));
    telemetry = null;

    telemetry = startMonitoringServer({ port: 0, logger: noopLogger, enableAlphaWuPerJob: true });
    await waitForServer(telemetry.server);

    recordAlphaWorkUnitSegment({
      nodeLabel: 'node-enabled',
      deviceClass: 'H100-80GB',
      slaProfile: 'SOVEREIGN',
      jobId: 'job-enabled',
      epochId: 'epoch-enabled',
      alphaWU: 2,
      jobTotalAlphaWU: 2
    });

    await delay(10);
    const { port } = telemetry.server.address();
    metricsResponse = await fetch(`http://127.0.0.1:${port}/metrics`);
    expect(metricsResponse.status).toBe(200);
    metrics = await metricsResponse.text();
    expect(metrics).not.toContain('job_id="job-disabled"');
    expect(metrics).toContain('job_id="job-enabled"');
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

  it('bridges DCUtR lifecycle events into the telemetry registry', async () => {
    const dcutrEmitter = new EventEmitter();
    telemetry = startMonitoringServer({ port: 0, logger: noopLogger, dcutrEvents: dcutrEmitter });
    await waitForServer(telemetry.server);

    const labels = { region: 'iad', relay_id: 'relay-x', transport: 'quic' };
    dcutrEmitter.emit('relayDialSuccess', { labels, relayBytes: 2048 });
    dcutrEmitter.emit('directPathConfirmed', { labels, elapsedSeconds: 0.42, directBytes: 1024 });
    dcutrEmitter.emit('streamMigration', { labels, directBytes: 512 });

    const sumValues = async (metric) =>
      (await metric.get()).values?.reduce((total, sample) => total + Number(sample.value ?? 0), 0) ?? 0;

    expect(await sumValues(dcutrPunchAttemptsTotal)).toBe(1);
    expect(await sumValues(dcutrPunchSuccessTotal)).toBe(1);
    expect(await sumValues(dcutrRelayOffloadTotal)).toBe(2);
    expect(await sumValues(dcutrDirectDataBytesTotal)).toBe(1536);
    expect(await sumValues(dcutrRelayDataBytesTotal)).toBe(2048);

    const { port } = telemetry.server.address();
    const response = await fetch(`http://127.0.0.1:${port}/metrics`);
    const metrics = await response.text();

    expect(response.status).toBe(200);
    expect(metrics).toContain('dcutr_punch_attempts_total');
    expect(metrics).toContain('dcutr_punch_success_total');
    expect(metrics).toContain('dcutr_relay_offload_total');
  });

  it('exports peer score metrics when a registry is provided', async () => {
    const peerRegistry = createPeerScoreRegistry({ retentionMinutes: 1 });
    peerRegistry.record({
      timestamp: new Date('2024-01-01T00:00:00Z'),
      peers: [
        { id: 'peer-good', score: 3.2, topics: { 'agi.jobs': { score: 1.25 } }, behaviourPenalty: -0.1 },
        { id: 'peer-gray', score: -6.2, topics: { 'agi.jobs': { score: -1.1 }, 'agi.metrics': { score: 0.2 } } }
      ]
    });

    telemetry = startMonitoringServer({
      port: 0,
      logger: noopLogger,
      peerScoreRegistry: peerRegistry,
      peerScoreThresholds: { gossip: -2, publish: -4, graylist: -6, disconnect: -8 }
    });
    await waitForServer(telemetry.server);

    peerRegistry.record({
      timestamp: new Date('2024-01-01T00:00:05Z'),
      peers: [
        { id: 'peer-good', score: 4.1, topics: { 'agi.jobs': { score: 1.5 } }, appSpecific: 0.25 },
        { id: 'peer-gray', score: -6.5, topics: { 'agi.jobs': { score: -1.25 } } }
      ]
    });

    await delay(10);
    const { port } = telemetry.server.address();
    const response = await fetch(`http://127.0.0.1:${port}/metrics`);
    expect(response.status).toBe(200);
    const metrics = await response.text();

    expect(metrics).toContain('peer_score_bucket_total{bucket="positive"} 1');
    expect(metrics).toContain('peer_score_bucket_total{bucket="graylist"} 1');
    expect(metrics).toContain('peer_score_topic_contribution{topic="agi.jobs",component="total"}');
    expect(metrics).toContain('peer_score_topic_contribution{topic="app_specific",component="total"} 0.25');
    expect(metrics).toContain('peer_score_snapshot_seconds');
  });
});
