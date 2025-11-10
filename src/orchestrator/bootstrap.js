import chalk from 'chalk';
import pino from 'pino';
import { loadConfig } from '../config/env.js';
import { runNodeDiagnostics } from './nodeRuntime.js';
import { startMonitorLoop } from './monitorLoop.js';
import { formatTokenAmount } from '../utils/formatters.js';
import { AGIALPHA_TOKEN_DECIMALS, AGIALPHA_TOKEN_SYMBOL } from '../constants/token.js';
import { loadOfflineSnapshot } from '../services/offlineSnapshot.js';
import { handleStakeActivation } from './stakeActivator.js';
import { startAgentApi } from '../network/apiServer.js';
import { hydrateOperatorPrivateKey } from '../services/secretManager.js';
import { createProvider, createWallet } from '../services/provider.js';
import { createJobLifecycle } from '../services/jobLifecycle.js';

function assertConfigField(value, field) {
  if (!value) {
    throw new Error(`${field} must be configured for container bootstrap`);
  }
}

function summarizeStake(diagnostics, logger) {
  if (!diagnostics?.stakeEvaluation) {
    logger.warn('Stake evaluation unavailable – cannot derive owner directives summary.');
    return;
  }

  const evaluation = diagnostics.stakeEvaluation;
  const directives = diagnostics.ownerDirectives;
  const deficitValue = evaluation.deficit
    ? formatTokenAmount(evaluation.deficit, AGIALPHA_TOKEN_DECIMALS)
    : '0';
  const deficit = `${deficitValue} ${AGIALPHA_TOKEN_SYMBOL}`;
  const summary = {
    meetsMinimum: evaluation.meets,
    deficit,
    penaltyActive: evaluation.penaltyActive,
    heartbeatStale: evaluation.heartbeatStale,
    recommendedAction: evaluation.recommendedAction ?? 'none'
  };

  logger.info(summary, 'Stake posture summary');

  if (directives?.actions?.length) {
    directives.actions.forEach((action, index) => {
      logger.warn({
        index: index + 1,
        type: action.type,
        reason: action.reason,
        target: action.formattedAmount ?? null,
        to: action.tx?.to ?? null
      });
    });
  } else {
    logger.info('No immediate owner directives required.');
  }
}

function summarizePerformance(diagnostics, logger) {
  const performance = diagnostics?.performance;
  if (!performance) {
    logger.warn('Performance profile unavailable – skipping metrics summary.');
    return;
  }

  const summary = {
    throughputPerEpoch: performance.throughputPerEpoch,
    successRate: Number(performance.successRate?.toFixed?.(3) ?? performance.successRate ?? 0),
    averageReward: Number(performance.averageReward?.toFixed?.(3) ?? performance.averageReward ?? 0),
    projectedEarnings: performance.tokenEarningsProjection
      ? formatTokenAmount(performance.tokenEarningsProjection, AGIALPHA_TOKEN_DECIMALS)
      : '0'
  };

  logger.info(summary, 'Performance telemetry snapshot');
}

export async function bootstrapContainer({
  overrides = {},
  skipMonitor = false,
  intervalSeconds = 60,
  projectedRewards = null,
  offlineSnapshotPath = null,
  maxIterations = Infinity,
  logger = pino({ level: 'info', name: 'container-bootstrap' })
} = {}) {
  const config = loadConfig(
    Object.fromEntries(
      Object.entries(overrides).filter(([, value]) => value !== undefined)
    )
  );

  await hydrateOperatorPrivateKey(config, { logger });

  assertConfigField(config.NODE_LABEL, 'NODE_LABEL');
  assertConfigField(config.OPERATOR_ADDRESS, 'OPERATOR_ADDRESS');

  let offlineSnapshot = null;
  const snapshotPath = offlineSnapshotPath ?? config.OFFLINE_SNAPSHOT_PATH ?? null;

  if (snapshotPath) {
    try {
      offlineSnapshot = loadOfflineSnapshot(snapshotPath);
    } catch (error) {
      logger.error(error, 'Failed to load offline snapshot for bootstrap');
      throw error;
    }
  }

  let provider = null;
  let defaultSigner = null;
  if (!config.OFFLINE_MODE) {
    try {
      provider = createProvider(config.RPC_URL);
      if (config.OPERATOR_PRIVATE_KEY) {
        defaultSigner = createWallet(config.OPERATOR_PRIVATE_KEY, provider);
      }
    } catch (error) {
      logger.error(error, 'Failed to initialize provider or signer');
      throw error;
    }
  }

  let jobLifecycle = null;
  let stopJobWatchers = null;
  if (config.JOB_REGISTRY_ADDRESS) {
    try {
      jobLifecycle = createJobLifecycle({
        provider,
        jobRegistryAddress: config.JOB_REGISTRY_ADDRESS,
        defaultSigner,
        defaultSubdomain: config.NODE_LABEL,
        defaultProof: config.JOB_APPLICATION_PROOF ?? '0x',
        discoveryBlockRange: config.JOB_DISCOVERY_BLOCK_RANGE,
        offlineJobs: offlineSnapshot?.jobs ?? [],
        logger
      });
      await jobLifecycle.discover();
      stopJobWatchers = jobLifecycle.watch();
    } catch (error) {
      logger.error(error, 'Failed to initialize job lifecycle');
      throw error;
    }
  }

  let apiServer = null;
  try {
    apiServer = startAgentApi({
      port: config.API_PORT,
      offlineMode: config.OFFLINE_MODE,
      jobLifecycle,
      logger
    });
  } catch (error) {
    logger.error(error, 'Failed to start agent API server');
    stopJobWatchers?.();
    jobLifecycle?.stop();
    throw error;
  }

  const metricsProvider = () => {
    const apiMetrics = apiServer ? apiServer.getMetrics() : {};
    const lifecycleMetrics = jobLifecycle ? jobLifecycle.getMetrics() : {};
    return {
      ...apiMetrics,
      lifecycle: lifecycleMetrics,
      throughput: apiMetrics.throughput ?? lifecycleMetrics.discovered ?? 0,
      successRate: apiMetrics.successRate ?? 1,
      lastJobProvider: apiMetrics.lastJobProvider ?? lifecycleMetrics.lastJobProvider ?? 'local'
    };
  };

  let diagnostics;
  try {
    diagnostics = await runNodeDiagnostics({
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
      offlineSnapshot,
      jobMetricsProvider: metricsProvider,
      logger
    });
    if (apiServer?.setOwnerDirectives) {
      apiServer.setOwnerDirectives(diagnostics.ownerDirectives);
    }
  } catch (error) {
    if (apiServer) {
      await apiServer.stop();
    }
    stopJobWatchers?.();
    jobLifecycle?.stop();
    throw error;
  }

  console.log(
    chalk.bold(`Container bootstrap verification for ${diagnostics.verification.nodeName}`)
  );
  console.table({
    expected: diagnostics.verification.expectedAddress,
    resolved: diagnostics.verification.resolvedAddress,
    registry: diagnostics.verification.registryOwner,
    wrapper: diagnostics.verification.wrapperOwner,
    success: diagnostics.verification.success
  });

  summarizeStake(diagnostics, logger);
  summarizePerformance(diagnostics, logger);

  await handleStakeActivation({ diagnostics, config, logger });

  if (skipMonitor) {
    if (apiServer) {
      await apiServer.stop();
    }
    stopJobWatchers?.();
    jobLifecycle?.stop();
    return { config, diagnostics, monitor: null, apiServer: null, jobLifecycle: null };
  }

  let monitor;
  try {
    const onDiagnostics = (diag) => {
      if (apiServer?.setOwnerDirectives && diag?.ownerDirectives) {
        apiServer.setOwnerDirectives(diag.ownerDirectives);
      }
    };
    monitor = await startMonitorLoop({
      config,
      intervalSeconds,
      projectedRewards,
      offlineSnapshotPath,
      logger,
      maxIterations,
      jobMetricsProvider: metricsProvider,
      onDiagnostics
    });
  } catch (error) {
    if (apiServer) {
      await apiServer.stop();
    }
    stopJobWatchers?.();
    jobLifecycle?.stop();
    throw error;
  }

  return {
    config,
    diagnostics,
    monitor,
    apiServer,
    jobLifecycle,
    stopJobWatchers
  };
}
