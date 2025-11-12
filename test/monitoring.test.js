import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { setTimeout as delay } from 'node:timers/promises';
import { startMonitoringServer } from '../src/telemetry/monitoring.js';

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
    telemetry = startMonitoringServer({ port: 0, logger: noopLogger });
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
  });

  it('returns 404 for unknown routes', async () => {
    telemetry = startMonitoringServer({ port: 0, logger: noopLogger });
    await waitForServer(telemetry.server);
    const { port } = telemetry.server.address();

    const response = await fetch(`http://127.0.0.1:${port}/health`);
    expect(response.status).toBe(404);
  });
});
