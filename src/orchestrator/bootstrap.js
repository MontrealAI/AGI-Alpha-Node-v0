import chalk from 'chalk';
import pino from 'pino';
import { loadConfig } from '../config/env.js';
import { runNodeDiagnostics, bindExecutionLoopMetering } from './nodeRuntime.js';
import { startMonitorLoop } from './monitorLoop.js';
import { formatTokenAmount } from '../utils/formatters.js';
import { AGIALPHA_TOKEN_DECIMALS, AGIALPHA_TOKEN_SYMBOL } from '../constants/token.js';
import { loadOfflineSnapshot } from '../services/offlineSnapshot.js';
import { handleStakeActivation } from './stakeActivator.js';
import { startAgentApi } from '../network/apiServer.js';
import { startVerifierServer } from '../network/verifierServer.js';
import { hydrateOperatorPrivateKey } from '../services/secretManager.js';
import { createProvider, createWallet } from '../services/provider.js';
import { createJobLifecycle } from '../services/jobLifecycle.js';
import { createLifecycleJournal } from '../services/lifecycleJournal.js';
import { createHealthGate } from '../services/healthGate.js';
import { createAlphaWuTelemetry } from '../telemetry/alphaWuTelemetry.js';
import { startValidatorRuntime } from '../validator/runtime.js';
import { createQuorumEngine } from '../settlement/quorumEngine.js';
import { getNodeEnsName } from '../ens/ens_config.js';

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

  const nodeRole = config.NODE_ROLE ?? 'mixed';
  const orchestratorEnabled = ['orchestrator', 'executor', 'mixed'].includes(nodeRole);
  const validatorEnabled = ['validator', 'mixed'].includes(nodeRole);

  if (!orchestratorEnabled && !validatorEnabled) {
    throw new Error('NODE_ROLE must enable at least one capability');
  }

  if (!orchestratorEnabled) {
    const validatorLogger = typeof logger.child === 'function' ? logger.child({ subsystem: 'validator-runtime' }) : logger;
    const validatorRuntime = validatorEnabled
      ? await startValidatorRuntime({ config, logger: validatorLogger })
      : null;
    return {
      config,
      diagnostics: null,
      monitor: null,
      apiServer: null,
      jobLifecycle: null,
      stopJobWatchers: null,
      executionBinding: null,
      healthGate: null,
      validatorRuntime
    };
  }

  assertConfigField(config.NODE_LABEL, 'NODE_LABEL');
  assertConfigField(config.OPERATOR_ADDRESS, 'OPERATOR_ADDRESS');

  let validatorRuntime = null;
  let quorumEngine = null;
  let unsubscribeValidation = null;
  const cleanupTasks = [];

  const healthGateLogger = typeof logger.child === 'function' ? logger.child({ subsystem: 'health-gate' }) : logger;
  const healthGate = createHealthGate({
    allowlist: config.HEALTH_GATE_ALLOWLIST,
    initialHealthy: config.HEALTH_GATE_INITIAL_STATE,
    logger: healthGateLogger
  });

  const canonicalEnsName = getNodeEnsName({ config });
  const derivedEnsName = canonicalEnsName
    ?? (config.NODE_LABEL && config.ENS_PARENT_DOMAIN
      ? `${config.NODE_LABEL}.${config.ENS_PARENT_DOMAIN}`
      : null);
  const initialEnsName = config.HEALTH_GATE_OVERRIDE_ENS ?? canonicalEnsName ?? derivedEnsName;
  if (initialEnsName) {
    healthGate.setStatus({
      isHealthy: config.HEALTH_GATE_INITIAL_STATE,
      ensName: initialEnsName,
      source: 'bootstrap-initial'
    });
  }

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
  let executionBinding = null;
  const telemetryLogger = typeof logger.child === 'function' ? logger.child({ subsystem: 'alpha-telemetry' }) : logger;
  const alphaTelemetry = createAlphaWuTelemetry({
    nodeEnsName: canonicalEnsName ?? initialEnsName,
    attestorAddress: config.OPERATOR_ADDRESS,
    logger: telemetryLogger
  });
  if (config.JOB_REGISTRY_ADDRESS) {
    try {
      const lifecycleJournal = createLifecycleJournal({ directory: config.LIFECYCLE_LOG_DIR ?? '.agi/lifecycle' });
      jobLifecycle = createJobLifecycle({
        provider,
        jobRegistryAddress: config.JOB_REGISTRY_ADDRESS,
        defaultSigner,
        defaultSubdomain: config.NODE_LABEL,
        defaultProof: config.JOB_APPLICATION_PROOF ?? '0x',
        discoveryBlockRange: config.JOB_DISCOVERY_BLOCK_RANGE,
        offlineJobs: offlineSnapshot?.jobs ?? [],
        profile: config.JOB_REGISTRY_PROFILE,
        profileOverrides: config.JOB_PROFILE_SPEC ?? null,
        journal: lifecycleJournal,
        logger,
        healthGate,
        alphaTelemetry
      });
      await jobLifecycle.discover();
      stopJobWatchers = jobLifecycle.watch();
      executionBinding = bindExecutionLoopMetering({
        jobLifecycle,
        logger: typeof logger.child === 'function' ? logger.child({ subsystem: 'execution-loop' }) : logger,
        alphaTelemetry
      });
    } catch (error) {
      logger.error(error, 'Failed to initialize job lifecycle');
      throw error;
    }
  }

  if (validatorEnabled) {
    try {
      const validatorLogger = typeof logger.child === 'function' ? logger.child({ subsystem: 'validator-runtime' }) : logger;
      validatorRuntime = await startValidatorRuntime({ config, logger: validatorLogger });
      const quorumLogger = typeof logger.child === 'function' ? logger.child({ subsystem: 'quorum-engine' }) : logger;
      quorumEngine = createQuorumEngine({
        quorumNumerator: config.VALIDATION_QUORUM_BPS,
        quorumDenominator: 10_000,
        minimumVotes: config.VALIDATION_MINIMUM_VOTES,
        logger: quorumLogger
      });

      const settledHandler = (payload) => {
        if (!jobLifecycle) {
          return;
        }
        const timestampSeconds = Number.isFinite(Date.parse(payload.finalizedAt))
          ? Math.floor(Date.parse(payload.finalizedAt) / 1000)
          : Math.floor(Date.now() / 1000);
        if (payload.status === 'accepted') {
          try {
            jobLifecycle.recordAlphaWorkUnitEvent('accepted', { id: payload.wuId, timestamp: timestampSeconds });
          } catch (error) {
            logger.warn?.(error, 'Failed to record α-WU acceptance event');
          }
        } else if (payload.status === 'rejected') {
          try {
            jobLifecycle.recordAlphaWorkUnitEvent('slashed', {
              id: payload.wuId,
              validator: null,
              amount: 0,
              timestamp: timestampSeconds
            });
          } catch (error) {
            logger.warn?.(error, 'Failed to record α-WU rejection event');
          }
        }
      };
      quorumEngine.on('settled', settledHandler);
      cleanupTasks.push(() => quorumEngine.off('settled', settledHandler));

      if (jobLifecycle?.on) {
        const mintHandler = (event) => {
          if (!event || !event.unit?.id) {
            return;
          }
          const normalizedType = event.type?.toLowerCase?.() ?? '';
          if (normalizedType === 'mint' || normalizedType === 'minted') {
            quorumEngine.registerWorkUnit({ wuId: event.unit.id, jobId: event.unit.id.split(':')[0] ?? null });
          }
        };
        jobLifecycle.on('alpha-wu:event', mintHandler);
        cleanupTasks.push(() => jobLifecycle.off?.('alpha-wu:event', mintHandler));
      }

      const subscription = validatorRuntime.sink.subscribe(({ result }) => {
        quorumEngine.ingest(result);
        if (jobLifecycle) {
          const timestampSeconds = Number.isFinite(Date.parse(result.created_at))
            ? Math.floor(Date.parse(result.created_at) / 1000)
            : Math.floor(Date.now() / 1000);
          try {
            jobLifecycle.recordAlphaWorkUnitEvent('validated', {
              id: result.wu_id,
              validator: result.validator_address,
              score: result.is_valid ? 1 : 0,
              timestamp: timestampSeconds
            });
          } catch (error) {
            logger.warn?.(error, 'Failed to record α-WU validation event');
          }
        }
      });
      unsubscribeValidation = () => {
        subscription?.();
      };
      cleanupTasks.push(() => unsubscribeValidation?.());

      const originalStop = validatorRuntime.stop?.bind(validatorRuntime);
      if (originalStop) {
        validatorRuntime.stop = async () => {
          cleanupTasks.forEach((task) => {
            try {
              task?.();
            } catch {
              // ignore
            }
          });
          await originalStop();
        };
      }
    } catch (error) {
      logger.error(error, 'Failed to initialize validator runtime');
      executionBinding?.detach?.();
      stopJobWatchers?.();
      jobLifecycle?.stop();
      await validatorRuntime?.stop?.();
      cleanupTasks.forEach((task) => {
        try {
          task?.();
        } catch {
          // ignore
        }
      });
      throw error;
    }
  }

  let apiServer = null;
  let verifierServer = null;
  try {
    apiServer = startAgentApi({
      port: config.API_PORT,
      offlineMode: config.OFFLINE_MODE,
      jobLifecycle,
      logger,
      ownerToken: config.GOVERNANCE_API_TOKEN,
      ledgerRoot: config.GOVERNANCE_LEDGER_ROOT ?? process.cwd(),
      healthGate
    });
    verifierServer = startVerifierServer({
      config,
      logger: typeof logger.child === 'function' ? logger.child({ subsystem: 'verifier-server' }) : logger
    });
    await verifierServer.listenPromise;
  } catch (error) {
    logger.error(error, 'Failed to start agent API server');
    executionBinding?.detach?.();
    stopJobWatchers?.();
    jobLifecycle?.stop();
    cleanupTasks.forEach((task) => {
      try {
        task?.();
      } catch {
        // ignore
      }
    });
    await validatorRuntime?.stop?.();
    await verifierServer?.stop?.();
    throw error;
  }

  const metricsProvider = () => {
    const apiMetrics = apiServer ? apiServer.getMetrics() : {};
    const lifecycleMetrics = jobLifecycle ? jobLifecycle.getMetrics() : {};
    const derivedSuccessRate =
      apiMetrics.successRate ??
      lifecycleMetrics.successRate ??
      (Number.isFinite(lifecycleMetrics.submitted) && lifecycleMetrics.submitted > 0
        ? (lifecycleMetrics.completed ?? 0) / lifecycleMetrics.submitted
        : 1);
    return {
      ...apiMetrics,
      lifecycle: lifecycleMetrics,
      alphaWorkUnits: lifecycleMetrics.alphaWorkUnits ?? null,
      throughput: apiMetrics.throughput ?? lifecycleMetrics.discovered ?? 0,
      successRate: derivedSuccessRate,
      lastJobProvider: apiMetrics.lastJobProvider ?? lifecycleMetrics.lastJobProvider ?? 'local',
      healthGate: healthGate.getState()
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
      rewardEngineAddress: config.REWARD_ENGINE_ADDRESS,
      desiredOperatorShareBps: config.DESIRED_OPERATOR_SHARE_BPS,
      desiredValidatorShareBps: config.DESIRED_VALIDATOR_SHARE_BPS,
      desiredTreasuryShareBps: config.DESIRED_TREASURY_SHARE_BPS,
      roleShareTargets: config.ROLE_SHARE_TARGETS,
      jobRegistryAddress: config.JOB_REGISTRY_ADDRESS,
      identityRegistryAddress: config.IDENTITY_REGISTRY_ADDRESS,
      desiredJobRegistryAddress: config.DESIRED_JOB_REGISTRY_ADDRESS,
      desiredIdentityRegistryAddress: config.DESIRED_IDENTITY_REGISTRY_ADDRESS,
      desiredValidationModuleAddress: config.DESIRED_VALIDATION_MODULE_ADDRESS,
      desiredReputationModuleAddress: config.DESIRED_REPUTATION_MODULE_ADDRESS,
      desiredDisputeModuleAddress: config.DESIRED_DISPUTE_MODULE_ADDRESS,
      projectedRewards,
      offlineSnapshot,
      jobMetricsProvider: metricsProvider,
      logger
    });
    healthGate.updateFromDiagnostics({
      ensName: diagnostics?.verification?.nodeName ?? derivedEnsName,
      stakeEvaluation: diagnostics?.stakeEvaluation,
      diagnosticsHealthy: diagnostics?.stakeEvaluation?.meets && !diagnostics?.stakeEvaluation?.penaltyActive,
      source: 'bootstrap-diagnostics'
    });
    if (apiServer?.setOwnerDirectives) {
      apiServer.setOwnerDirectives(diagnostics.ownerDirectives);
    }
  } catch (error) {
    if (apiServer) {
      await apiServer.stop();
    }
    await verifierServer?.stop?.();
    executionBinding?.detach?.();
    stopJobWatchers?.();
    jobLifecycle?.stop();
    cleanupTasks.forEach((task) => {
      try {
        task?.();
      } catch {
        // ignore
      }
    });
    await validatorRuntime?.stop?.();
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
    await verifierServer?.stop?.();
    executionBinding?.detach?.();
    stopJobWatchers?.();
    jobLifecycle?.stop();
    cleanupTasks.forEach((task) => {
      try {
        task?.();
      } catch {
        // ignore
      }
    });
    await validatorRuntime?.stop?.();
    return {
      config,
      diagnostics,
      monitor: null,
      apiServer: null,
      verifierServer: null,
      jobLifecycle: null,
      healthGate,
      validatorRuntime,
      quorumEngine
    };
  }

  let monitor;
  try {
    const onDiagnostics = (diag) => {
      if (diag) {
        healthGate.updateFromDiagnostics({
          ensName: diag?.verification?.nodeName ?? derivedEnsName,
          stakeEvaluation: diag?.stakeEvaluation,
          diagnosticsHealthy: diag?.stakeEvaluation?.meets && !diag?.stakeEvaluation?.penaltyActive,
          source: 'monitor-diagnostics'
        });
      }
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
      onDiagnostics,
      healthGate
    });
  } catch (error) {
    if (apiServer) {
      await apiServer.stop();
    }
    await verifierServer?.stop?.();
    executionBinding?.detach?.();
    stopJobWatchers?.();
    jobLifecycle?.stop();
    cleanupTasks.forEach((task) => {
      try {
        task?.();
      } catch {
        // ignore
      }
    });
    await validatorRuntime?.stop?.();
    throw error;
  }

  return {
    config,
    diagnostics,
    monitor,
    apiServer,
    verifierServer,
    jobLifecycle,
    stopJobWatchers,
    executionBinding,
    healthGate,
    validatorRuntime,
    quorumEngine
  };
}
