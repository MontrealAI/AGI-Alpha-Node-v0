import pino from 'pino';
import { createProvider } from '../services/provider.js';
import { verifyNodeOwnership } from '../services/ensVerifier.js';
import { getStakeStatus, validateStakeThreshold, evaluateStakeConditions } from '../services/staking.js';
import { projectEpochRewards } from '../services/rewards.js';
import { startMonitoringServer } from '../telemetry/monitoring.js';
import { formatTokenAmount } from '../utils/formatters.js';
import { deriveOwnerDirectives } from '../services/controlPlane.js';
import {
  buildOfflineVerification,
  buildOfflineStakeStatus,
  buildOfflineRewardsProjection
} from '../services/offlineSnapshot.js';
import { derivePerformanceProfile } from '../services/performance.js';

export async function runNodeDiagnostics({
  rpcUrl,
  label,
  parentDomain,
  operatorAddress,
  stakeManagerAddress,
  incentivesAddress,
  systemPauseAddress,
  desiredMinimumStake,
  autoResume = false,
  projectedRewards,
  offlineSnapshot,
  jobMetricsProvider = null,
  logger = pino({ level: 'info', name: 'agi-alpha-node' })
}) {
  const offlineMode = Boolean(offlineSnapshot);
  const runtimeMode = offlineMode ? 'offline-snapshot' : 'online';
  const provider = offlineMode ? null : createProvider(rpcUrl);

  if (offlineMode) {
    logger.info(
      { snapshotSource: offlineSnapshot?.source ?? 'in-memory' },
      'Offline diagnostics engaged'
    );
  } else {
    logger.info({ rpcUrl }, 'Connected provider');
  }

  const verification = offlineMode
    ? buildOfflineVerification({
        snapshot: offlineSnapshot,
        label,
        parentDomain,
        expectedAddress: operatorAddress
      })
    : await verifyNodeOwnership({
        provider,
        label,
        parentDomain,
        expectedAddress: operatorAddress
      });

  if (verification.success) {
    logger.info(
      {
        event: 'NodeIdentityVerified',
        nodeName: verification.nodeName,
        matches: verification.matches,
        expectedAddress: verification.expectedAddress,
        resolvedAddress: verification.resolvedAddress,
        registryOwner: verification.registryOwner,
        wrapperOwner: verification.wrapperOwner
      },
      'ENS verification completed'
    );
  } else {
    logger?.warn?.(
      {
        event: 'NodeIdentityVerificationFailed',
        nodeName: verification.nodeName,
        expectedAddress: verification.expectedAddress,
        resolvedAddress: verification.resolvedAddress,
        registryOwner: verification.registryOwner,
        wrapperOwner: verification.wrapperOwner,
        matches: verification.matches
      },
      'ENS verification failed'
    );
    const error = new Error(`ENS verification failed for ${verification.nodeName}`);
    error.details = verification;
    throw error;
  }

  const stakeStatus = offlineMode
    ? buildOfflineStakeStatus(offlineSnapshot)
    : operatorAddress
    ? await getStakeStatus({
        provider,
        operatorAddress,
        stakeManagerAddress,
        incentivesAddress
      })
    : null;

  let stakeEvaluation = null;
  if (stakeStatus) {
    stakeEvaluation = evaluateStakeConditions({
      minimumStake: stakeStatus.minimumStake,
      operatorStake: stakeStatus.operatorStake,
      slashingPenalty: stakeStatus.slashingPenalty,
      lastHeartbeat: stakeStatus.lastHeartbeat,
      currentTimestamp: Math.floor(Date.now() / 1000)
    });
    const threshold = validateStakeThreshold(stakeStatus);
    if (threshold) {
      logger.info({
        minimumStake: stakeStatus.minimumStake ? formatTokenAmount(stakeStatus.minimumStake) : null,
        operatorStake: stakeStatus.operatorStake ? formatTokenAmount(stakeStatus.operatorStake) : null,
        healthy: threshold.meets,
        deficit: threshold.deficit ? formatTokenAmount(threshold.deficit) : null
      }, 'Stake threshold evaluation');
    }
    logger.info({
      slashingPenalty: stakeStatus.slashingPenalty ? formatTokenAmount(stakeStatus.slashingPenalty) : null,
      penaltyActive: stakeEvaluation?.penaltyActive ?? null,
      heartbeatAgeSeconds: stakeEvaluation?.heartbeatAgeSeconds ?? null,
      heartbeatStale: stakeEvaluation?.heartbeatStale ?? null,
      shouldPause: stakeEvaluation?.shouldPause ?? null,
      recommendedAction: stakeEvaluation?.recommendedAction ?? null
    }, 'Stake posture evaluation');
  }

  const offlineRewards = offlineMode ? buildOfflineRewardsProjection(offlineSnapshot) : null;
  const rewardsProjection = (projectedRewards || offlineRewards?.projectedPool)
    ? projectEpochRewards({
        projectedPool: projectedRewards ?? offlineRewards?.projectedPool,
        operatorShareBps: offlineRewards?.operatorShareBps,
        decimals: offlineRewards?.decimals
      })
    : null;

  if (rewardsProjection) {
    logger.info({
      projectedPool: formatTokenAmount(rewardsProjection.pool),
      operatorPortion: formatTokenAmount(rewardsProjection.operatorPortion),
      shareBps: rewardsProjection.operatorShareBps
    }, 'Projected epoch rewards');
  }

  let performance = derivePerformanceProfile();

  if (typeof jobMetricsProvider === 'function') {
    try {
      const jobMetrics = jobMetricsProvider();
      if (jobMetrics && typeof jobMetrics === 'object') {
        const merged = { ...performance };
        if (Number.isFinite(jobMetrics.throughput)) {
          merged.throughputPerEpoch = Number(jobMetrics.throughput);
        }
        if (Number.isFinite(jobMetrics.successRate)) {
          merged.successRate = Number(jobMetrics.successRate);
        }
        const projected = jobMetrics.lastProjectedReward ?? jobMetrics.tokensEarned;
        if (typeof projected === 'bigint') {
          merged.tokenEarningsProjection = projected;
        }
        merged.jobMetrics = jobMetrics;
        performance = merged;
      }
    } catch (metricsError) {
      logger.warn(metricsError, 'Failed to merge job metrics into performance profile');
    }
  }

  const ownerDirectives = deriveOwnerDirectives({
    stakeStatus,
    stakeEvaluation,
    config: {
      systemPauseAddress,
      incentivesAddress,
      stakeManagerAddress,
      desiredMinimumStake,
      autoResume
    }
  });

  if (ownerDirectives?.actions?.length) {
    logger.warn(
      {
        priority: ownerDirectives.priority,
        actions: ownerDirectives.actions.map((action) => ({ type: action.type, level: action.level })),
        notices: ownerDirectives.notices
      },
      'Owner control directives generated'
    );
  }

  return {
    verification,
    stakeStatus,
    rewardsProjection,
    stakeEvaluation,
    ownerDirectives,
    performance,
    runtimeMode
  };
}

export async function launchMonitoring({
  port,
  stakeStatus,
  performance = null,
  runtimeMode = 'online',
  logger = pino({ level: 'info', name: 'agi-alpha-node' })
}) {
  const telemetry = startMonitoringServer({ port, logger });
  if (stakeStatus?.operatorStake) {
    telemetry.stakeGauge.set(Number(stakeStatus.operatorStake));
  }
  if (stakeStatus?.lastHeartbeat) {
    telemetry.heartbeatGauge.set(Number(stakeStatus.lastHeartbeat));
  }
  if (telemetry.providerModeGauge) {
    telemetry.providerModeGauge.reset();
    telemetry.providerModeGauge.set({ mode: runtimeMode }, 1);
  }
  if (performance) {
    if (telemetry.jobThroughputGauge && performance.throughputPerEpoch !== undefined) {
      telemetry.jobThroughputGauge.set(Number(performance.throughputPerEpoch ?? 0));
    }
    if (telemetry.jobSuccessGauge && performance.successRate !== undefined) {
      telemetry.jobSuccessGauge.set(Number(performance.successRate ?? 0));
    }
    if (telemetry.tokenEarningsGauge && typeof performance.tokenEarningsProjection === 'bigint') {
      const formatted = Number.parseFloat(formatTokenAmount(performance.tokenEarningsProjection));
      telemetry.tokenEarningsGauge.set(Number.isFinite(formatted) ? formatted : 0);
    }
    if (telemetry.agentUtilizationGauge) {
      telemetry.agentUtilizationGauge.reset();
      (performance.utilization ?? []).forEach((entry) => {
        if (entry?.agent) {
          const value = Number.isFinite(entry.utilization) ? entry.utilization : 0;
          telemetry.agentUtilizationGauge.set({ agent: entry.agent }, value);
        }
      });
    }
    if (telemetry.providerModeGauge && performance.jobMetrics?.lastJobProvider) {
      telemetry.providerModeGauge.reset();
      telemetry.providerModeGauge.set({ mode: performance.jobMetrics.lastJobProvider }, 1);
    }
  }
  return telemetry;
}
