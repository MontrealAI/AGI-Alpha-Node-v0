import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { startMonitorLoop } from '../src/orchestrator/monitorLoop.js';
import { runNodeDiagnostics, launchMonitoring } from '../src/orchestrator/nodeRuntime.js';

const mockDiagnostics = {
  verification: { nodeName: '1.alpha.node.agi.eth' },
  stakeStatus: { operatorStake: 100n, lastHeartbeat: 10n },
  stakeEvaluation: { meets: true },
  ownerDirectives: { actions: [] },
  performance: {
    throughputPerEpoch: 3,
    successRate: 0.92,
    tokenEarningsProjection: 1500n,
    utilization: [
      { agent: 'orion', utilization: 0.9 },
      { agent: 'helix', utilization: 0.75 }
    ]
  }
};

const telemetryMock = {
  server: { close: vi.fn((cb) => cb && cb()) },
  stakeGauge: { set: vi.fn() },
  heartbeatGauge: { set: vi.fn() },
  jobThroughputGauge: { set: vi.fn() },
  jobSuccessGauge: { set: vi.fn() },
  tokenEarningsGauge: { set: vi.fn() },
  agentUtilizationGauge: { set: vi.fn(), reset: vi.fn() }
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

  const logger = { info: vi.fn(), error: vi.fn() };

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
      performance: mockDiagnostics.performance
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
});
