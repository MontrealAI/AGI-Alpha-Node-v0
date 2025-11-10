import pino from 'pino';
import { runNodeDiagnostics, launchMonitoring } from './nodeRuntime.js';
import { formatTokenAmount } from '../utils/formatters.js';
import { loadOfflineSnapshot } from '../services/offlineSnapshot.js';

function assertPositiveInteger(value, name) {
  if (!Number.isFinite(value) || value <= 0 || Math.floor(value) !== value) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function updateTelemetryGauges(telemetry, diagnostics) {
  if (!telemetry) return;
  const stakeStatus = diagnostics?.stakeStatus ?? null;
  const performance = diagnostics?.performance ?? null;

  if (stakeStatus?.operatorStake !== null && stakeStatus?.operatorStake !== undefined) {
    telemetry.stakeGauge.set(Number(stakeStatus.operatorStake));
  } else {
    telemetry.stakeGauge.set(0);
  }
  if (stakeStatus?.lastHeartbeat !== null && stakeStatus?.lastHeartbeat !== undefined) {
    telemetry.heartbeatGauge.set(Number(stakeStatus.lastHeartbeat));
  } else {
    telemetry.heartbeatGauge.set(0);
  }

  if (telemetry.jobThroughputGauge) {
    const throughput = performance?.throughputPerEpoch ?? 0;
    telemetry.jobThroughputGauge.set(Number.isFinite(throughput) ? throughput : 0);
  }

  if (telemetry.jobSuccessGauge) {
    const success = performance?.successRate ?? 0;
    telemetry.jobSuccessGauge.set(Number.isFinite(success) ? success : 0);
  }

  if (telemetry.tokenEarningsGauge) {
    const projection = performance?.tokenEarningsProjection;
    if (typeof projection === 'bigint') {
      const formatted = Number.parseFloat(formatTokenAmount(projection));
      telemetry.tokenEarningsGauge.set(Number.isFinite(formatted) ? formatted : 0);
    } else {
      telemetry.tokenEarningsGauge.set(0);
    }
  }

  if (telemetry.agentUtilizationGauge) {
    telemetry.agentUtilizationGauge.reset();
    const utilization = Array.isArray(performance?.utilization) ? performance.utilization : [];
    utilization.forEach((entry) => {
      const value = Number.isFinite(entry?.utilization) ? entry.utilization : 0;
      if (entry?.agent) {
        telemetry.agentUtilizationGauge.set({ agent: entry.agent }, value);
      }
    });
  }
}

function buildSnapshotResolver(path, logger) {
  if (!path) {
    return () => null;
  }
  return () => {
    try {
      return loadOfflineSnapshot(path);
    } catch (error) {
      logger.error(error, 'Unable to load offline snapshot');
      return null;
    }
  };
}

export async function startMonitorLoop({
  config,
  intervalSeconds = 60,
  projectedRewards = null,
  offlineSnapshotPath = null,
  logger = pino({ level: 'info', name: 'monitor-loop' }),
  maxIterations = Infinity
}) {
  if (!config) {
    throw new Error('config is required');
  }

  const intervalValue = Number.parseInt(intervalSeconds, 10);
  assertPositiveInteger(intervalValue, 'intervalSeconds');

  const resolver = buildSnapshotResolver(offlineSnapshotPath, logger);
  let telemetryServer = null;
  let iterationsCompleted = 0;
  let shuttingDown = false;
  let timer = null;
  let pendingResolve = null;

  const wait = () =>
    new Promise((resolve) => {
      pendingResolve = resolve;
      timer = setTimeout(() => {
        pendingResolve = null;
        resolve();
      }, intervalValue * 1000);
    });

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (pendingResolve) {
      const resolver = pendingResolve;
      pendingResolve = null;
      resolver();
    }
  };

  const stop = async () => {
    shuttingDown = true;
    clearTimer();
    if (telemetryServer?.server) {
      await new Promise((resolve) => {
        telemetryServer.server.close(() => resolve());
      });
    }
  };

  const loop = (async () => {
    while (!shuttingDown && iterationsCompleted < maxIterations) {
      try {
        const diagnostics = await runNodeDiagnostics({
          rpcUrl: config.RPC_URL,
          label: config.NODE_LABEL,
          parentDomain: config.ENS_PARENT_DOMAIN,
          operatorAddress: config.OPERATOR_ADDRESS,
          stakeManagerAddress: config.STAKE_MANAGER_ADDRESS,
          incentivesAddress: config.PLATFORM_INCENTIVES_ADDRESS,
          systemPauseAddress: config.SYSTEM_PAUSE_ADDRESS,
          desiredMinimumStake: config.DESIRED_MINIMUM_STAKE,
          autoResume: config.AUTO_RESUME,
          projectedRewards,
          offlineSnapshot: resolver(),
          logger
        });

        if (!telemetryServer) {
          telemetryServer = await launchMonitoring({
            port: config.METRICS_PORT,
            stakeStatus: diagnostics.stakeStatus,
            performance: diagnostics.performance,
            logger
          });
        } else {
          updateTelemetryGauges(telemetryServer, diagnostics);
        }

        const actionSummary = diagnostics.ownerDirectives?.actions
          ?.map((action) => action.type)
          .join(', ');
        logger.info(
          {
            node: diagnostics.verification?.nodeName,
            healthy: diagnostics.stakeEvaluation?.meets,
            priority: diagnostics.ownerDirectives?.priority,
            actions: actionSummary ?? 'none'
          },
          'Monitor iteration completed'
        );
      } catch (error) {
        logger.error(error, 'Monitor iteration failed');
      }

      iterationsCompleted += 1;
      if (shuttingDown || iterationsCompleted >= maxIterations) {
        break;
      }
      await wait();
    }
    clearTimer();
  })();

  loop.catch((error) => {
    logger.error(error, 'Monitor loop crashed');
  });

  return {
    loopPromise: loop,
    stop,
    getTelemetry: () => telemetryServer,
    getIterations: () => iterationsCompleted
  };
}
