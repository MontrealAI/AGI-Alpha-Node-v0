import chalk from 'chalk';
import pino from 'pino';
import { loadConfig } from '../config/env.js';
import { runNodeDiagnostics } from './nodeRuntime.js';
import { startMonitorLoop } from './monitorLoop.js';
import { formatTokenAmount } from '../utils/formatters.js';
import { AGIALPHA_TOKEN_DECIMALS, AGIALPHA_TOKEN_SYMBOL } from '../constants/token.js';
import { loadOfflineSnapshot } from '../services/offlineSnapshot.js';

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

  assertConfigField(config.NODE_LABEL, 'NODE_LABEL');
  assertConfigField(config.OPERATOR_ADDRESS, 'OPERATOR_ADDRESS');

  let offlineSnapshot = null;
  if (offlineSnapshotPath) {
    try {
      offlineSnapshot = loadOfflineSnapshot(offlineSnapshotPath);
    } catch (error) {
      logger.error(error, 'Failed to load offline snapshot for bootstrap');
      throw error;
    }
  }

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
    offlineSnapshot,
    logger
  });

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

  if (skipMonitor) {
    return { config, diagnostics, monitor: null };
  }

  const monitor = await startMonitorLoop({
    config,
    intervalSeconds,
    projectedRewards,
    offlineSnapshotPath,
    logger,
    maxIterations
  });

  return { config, diagnostics, monitor };
}
