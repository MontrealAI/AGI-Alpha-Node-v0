import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { startMonitorLoop } from '../src/orchestrator/monitorLoop.js';
import { runNodeDiagnostics, launchMonitoring } from '../src/orchestrator/nodeRuntime.js';

const mockDiagnostics = {
  verification: { nodeName: '1.alpha.node.agi.eth' },
  stakeStatus: { operatorStake: 100n, lastHeartbeat: 10n },
  stakeEvaluation: { meets: true },
  ownerDirectives: { actions: [] },
  runtimeMode: 'online',
  performance: {
    throughputPerEpoch: 3,
    successRate: 0.92,
    tokenEarningsProjection: 1500n,
    utilization: [
      { agent: 'orion', utilization: 0.9 },
      { agent: 'helix', utilization: 0.75 }
    ],
    jobMetrics: { lastJobProvider: 'remote' },
    alphaWorkUnits: {
      overall: {
        window: 'all',
        acceptanceRate: 0.8,
        onTimeP95Seconds: 120,
        slashingAdjustedYield: 0.05,
        quality: {
          global: 0.91,
          perAgent: { orion: 0.9 },
          perNode: { '1.alpha.node.agi.eth': 0.88 },
          perValidator: { '0x00000000000000000000000000000000000000aa': 0.87 }
        },
        breakdowns: {
          agents: {
            orion: {
              minted: 2,
              accepted: 2,
              acceptanceRate: 1,
              onTimeP95Seconds: 120,
              stake: 300,
              slashes: 0,
              slashingAdjustedYield: 0.006
            }
          },
          nodes: {
            '1.alpha.node.agi.eth': {
              minted: 2,
              accepted: 2,
              acceptanceRate: 1,
              onTimeP95Seconds: 120,
              stake: 300,
              slashes: 0,
              slashingAdjustedYield: 0.006
            }
          },
          validators: {
            '0x00000000000000000000000000000000000000aa': {
              minted: 2,
              validated: 2,
              validations: 2,
              accepted: 2,
              acceptanceRate: 1,
              onTimeP95Seconds: 120,
              stake: 200,
              slashes: 0,
              slashingAdjustedYield: 0.01
            }
          }
        }
      },
      windows: [
        {
          window: '7d',
          acceptanceRate: 0.75,
          onTimeP95Seconds: 140,
          slashingAdjustedYield: 0.045,
          quality: { global: 0.85 },
          breakdowns: {
            agents: {},
            nodes: {},
            validators: {}
          }
        }
      ]
    }
  }
};

const telemetryMock = {
  server: { close: vi.fn((cb) => cb && cb()) },
  stakeGauge: { set: vi.fn() },
  heartbeatGauge: { set: vi.fn() },
  jobThroughputGauge: { set: vi.fn() },
  jobSuccessGauge: { set: vi.fn() },
  tokenEarningsGauge: { set: vi.fn() },
  agentUtilizationGauge: { set: vi.fn(), reset: vi.fn() },
  providerModeGauge: { set: vi.fn(), reset: vi.fn() },
  registryProfileGauge: { set: vi.fn(), reset: vi.fn() },
  registryCompatibilityGauge: { set: vi.fn(), reset: vi.fn() },
  alphaAcceptanceGauge: { set: vi.fn(), reset: vi.fn() },
  alphaOnTimeGauge: { set: vi.fn(), reset: vi.fn() },
  alphaYieldGauge: { set: vi.fn(), reset: vi.fn() },
  alphaQualityGauge: { set: vi.fn(), reset: vi.fn() },
  alphaBreakdownGauge: { set: vi.fn(), reset: vi.fn() }
};

vi.mock('../src/orchestrator/nodeRuntime.js', () => ({
  runNodeDiagnostics: vi.fn(() => Promise.resolve(mockDiagnostics)),
  launchMonitoring: vi.fn(() => Promise.resolve(telemetryMock))
}));

vi.mock('../src/services/offlineSnapshot.js', () => ({
  loadOfflineSnapshot: vi.fn(() => ({ snapshot: true }))
}));

describe('monitorLoop', () => {
  const config = {
    RPC_URL: 'https://rpc.example',
    NODE_LABEL: '1',
    ENS_PARENT_DOMAIN: 'alpha.node.agi.eth',
    OPERATOR_ADDRESS: '0x0000000000000000000000000000000000000001',
    STAKE_MANAGER_ADDRESS: undefined,
    PLATFORM_INCENTIVES_ADDRESS: undefined,
    SYSTEM_PAUSE_ADDRESS: undefined,
    DESIRED_MINIMUM_STAKE: undefined,
    AUTO_RESUME: false,
    METRICS_PORT: 9464
  };

  const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };

  beforeEach(() => {
    runNodeDiagnostics.mockClear();
    launchMonitoring.mockClear();
    telemetryMock.server.close.mockClear();
    telemetryMock.stakeGauge.set.mockClear();
    telemetryMock.heartbeatGauge.set.mockClear();
    telemetryMock.jobThroughputGauge.set.mockClear();
    telemetryMock.jobSuccessGauge.set.mockClear();
    telemetryMock.tokenEarningsGauge.set.mockClear();
    telemetryMock.agentUtilizationGauge.set.mockClear();
    telemetryMock.agentUtilizationGauge.reset.mockClear();
    telemetryMock.registryProfileGauge.reset.mockClear();
    telemetryMock.registryProfileGauge.set.mockClear();
    telemetryMock.registryCompatibilityGauge.reset.mockClear();
    telemetryMock.registryCompatibilityGauge.set.mockClear();
    telemetryMock.alphaAcceptanceGauge.reset.mockClear();
    telemetryMock.alphaAcceptanceGauge.set.mockClear();
    telemetryMock.alphaOnTimeGauge.reset.mockClear();
    telemetryMock.alphaOnTimeGauge.set.mockClear();
    telemetryMock.alphaYieldGauge.reset.mockClear();
    telemetryMock.alphaYieldGauge.set.mockClear();
    telemetryMock.alphaQualityGauge.reset.mockClear();
    telemetryMock.alphaQualityGauge.set.mockClear();
    telemetryMock.alphaBreakdownGauge.reset.mockClear();
    telemetryMock.alphaBreakdownGauge.set.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs for the specified number of iterations', async () => {
    const monitor = await startMonitorLoop({
      config,
      intervalSeconds: 60,
      projectedRewards: null,
      offlineSnapshotPath: null,
      logger,
      maxIterations: 1
    });

    await monitor.loopPromise;

    expect(runNodeDiagnostics).toHaveBeenCalledTimes(1);
    expect(launchMonitoring).toHaveBeenCalledTimes(1);
    expect(launchMonitoring.mock.calls[0][0]).toMatchObject({
      performance: mockDiagnostics.performance,
      runtimeMode: 'online'
    });
  });

  it('stops gracefully when stop is invoked', async () => {
    const monitor = await startMonitorLoop({
      config,
      intervalSeconds: 1,
      projectedRewards: null,
      offlineSnapshotPath: null,
      logger,
      maxIterations: Infinity
    });

    while (launchMonitoring.mock.calls.length === 0) {
      // Wait for the first iteration to complete and telemetry to start.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await monitor.stop();
    await monitor.loopPromise;

    expect(telemetryMock.server.close).toHaveBeenCalled();
  });

  it('throws when interval is invalid', async () => {
    await expect(
      startMonitorLoop({
        config,
        intervalSeconds: 0,
        projectedRewards: null,
        offlineSnapshotPath: null,
        logger,
        maxIterations: 1
      })
    ).rejects.toThrow(/positive integer/);
  });

  it('invokes diagnostics callback when provided', async () => {
    const callback = vi.fn();
    const monitor = await startMonitorLoop({
      config,
      intervalSeconds: 60,
      projectedRewards: null,
      offlineSnapshotPath: null,
      logger,
      maxIterations: 1,
      onDiagnostics: callback
    });

    await monitor.loopPromise;

    expect(callback).toHaveBeenCalledWith(mockDiagnostics);
  });
});
