import pino from 'pino';
import { createProvider } from '../services/provider.js';
import { verifyNodeOwnership } from '../services/ensVerifier.js';
import { getStakeStatus, validateStakeThreshold } from '../services/staking.js';
import { projectEpochRewards } from '../services/rewards.js';
import { startMonitoringServer } from '../telemetry/monitoring.js';
import { formatTokenAmount } from '../utils/formatters.js';

export async function runNodeDiagnostics({
  rpcUrl,
  label,
  parentDomain,
  operatorAddress,
  stakeManagerAddress,
  incentivesAddress,
  projectedRewards,
  logger = pino({ level: 'info', name: 'agi-alpha-node' })
}) {
  const provider = createProvider(rpcUrl);
  logger.info({ rpcUrl }, 'Connected provider');

  const verification = await verifyNodeOwnership({
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

  const stakeStatus = operatorAddress
    ? await getStakeStatus({
        provider,
        operatorAddress,
        stakeManagerAddress,
        incentivesAddress
      })
    : null;

  if (stakeStatus) {
    const threshold = validateStakeThreshold(stakeStatus);
    if (threshold) {
      logger.info({
        minimumStake: stakeStatus.minimumStake ? formatTokenAmount(stakeStatus.minimumStake) : null,
        operatorStake: stakeStatus.operatorStake ? formatTokenAmount(stakeStatus.operatorStake) : null,
        healthy: threshold.meets,
        deficit: threshold.deficit ? formatTokenAmount(threshold.deficit) : null
      }, 'Stake threshold evaluation');
    }
  }

  const rewardsProjection = projectedRewards
    ? projectEpochRewards({ projectedPool: projectedRewards })
    : null;

  if (rewardsProjection) {
    logger.info({
      projectedPool: formatTokenAmount(rewardsProjection.pool),
      operatorPortion: formatTokenAmount(rewardsProjection.operatorPortion),
      shareBps: rewardsProjection.operatorShareBps
    }, 'Projected epoch rewards');
  }

  return {
    verification,
    stakeStatus,
    rewardsProjection
  };
}

export async function launchMonitoring({
  port,
  stakeStatus,
  logger = pino({ level: 'info', name: 'agi-alpha-node' })
}) {
  const telemetry = startMonitoringServer({ port, logger });
  if (stakeStatus?.operatorStake) {
    telemetry.stakeGauge.set(Number(stakeStatus.operatorStake));
  }
  if (stakeStatus?.lastHeartbeat) {
    telemetry.heartbeatGauge.set(Number(stakeStatus.lastHeartbeat));
  }
  return telemetry;
}
