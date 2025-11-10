import {
  AGIALPHA_TOKEN_DECIMALS,
  AGIALPHA_TOKEN_SYMBOL
} from '../constants/token.js';
import { formatTokenAmount, parseTokenAmount } from '../utils/formatters.js';
import { buildStakeAndActivateTx } from './staking.js';
import { buildSystemPauseTx, buildMinimumStakeTx } from './governance.js';

function formatExactAmount(value, decimals = AGIALPHA_TOKEN_DECIMALS) {
  if (typeof value !== 'bigint') return null;
  try {
    return formatTokenAmount(value, decimals, decimals);
  } catch (error) {
    return null;
  }
}

export function deriveOwnerDirectives({
  stakeStatus,
  stakeEvaluation,
  config = {},
  decimals = AGIALPHA_TOKEN_DECIMALS
} = {}) {
  const directives = {
    priority: 'nominal',
    actions: [],
    notices: [],
    context: {
      meetsMinimum: stakeEvaluation?.meets ?? null,
      deficit: stakeEvaluation?.deficit ?? null,
      penaltyActive: stakeEvaluation?.penaltyActive ?? null,
      heartbeatStale: stakeEvaluation?.heartbeatStale ?? null,
      recommendedAction: stakeEvaluation?.recommendedAction ?? null
    }
  };

  if (!stakeStatus || !stakeEvaluation) {
    directives.notices.push('Stake telemetry unavailable – unable to derive owner directives.');
    return directives;
  }

  const {
    systemPauseAddress,
    incentivesAddress,
    stakeManagerAddress,
    desiredMinimumStake,
    autoResume
  } = config;

  if (stakeEvaluation.penaltyActive) {
    directives.priority = 'critical';
    if (systemPauseAddress) {
      directives.actions.push({
        type: 'pause',
        level: 'critical',
        reason: 'Active slashing penalty detected – pause workloads immediately.',
        tx: buildSystemPauseTx({ systemPauseAddress, action: 'pause' })
      });
    } else {
      directives.notices.push(
        'Active penalty detected – provide SYSTEM_PAUSE_ADDRESS to generate an emergency pause transaction.'
      );
    }
  }

  if (stakeEvaluation.deficit && stakeEvaluation.deficit > 0n) {
    directives.priority = directives.priority === 'critical' ? 'critical' : 'warning';
    const formattedDeficit = formatExactAmount(stakeEvaluation.deficit, decimals);
    if (incentivesAddress) {
      const tx = buildStakeAndActivateTx({
        amount: formattedDeficit ?? '0',
        incentivesAddress,
        decimals
      });
      directives.actions.push({
        type: 'stake-top-up',
        level: directives.priority,
        reason: `Increase stake by ${formattedDeficit ?? 'the deficit'} ${AGIALPHA_TOKEN_SYMBOL} to restore health.`,
        amount: stakeEvaluation.deficit,
        formattedAmount: formattedDeficit,
        tx
      });
    } else {
      directives.notices.push(
        `Stake deficit detected (${formattedDeficit ?? 'unknown'} ${AGIALPHA_TOKEN_SYMBOL}) – provide PLATFORM_INCENTIVES_ADDRESS to generate a top-up transaction.`
      );
    }
  }

  if (desiredMinimumStake) {
    const desiredAmount = parseTokenAmount(desiredMinimumStake, decimals);
    const currentMinimum = stakeStatus.minimumStake ?? null;
    if (currentMinimum !== null && desiredAmount !== currentMinimum) {
      directives.priority = directives.priority === 'critical' ? 'critical' : 'warning';
      if (stakeManagerAddress) {
        const tx = buildMinimumStakeTx({
          stakeManagerAddress,
          amount: desiredMinimumStake,
          decimals
        });
        directives.actions.push({
          type: 'set-minimum-stake',
          level: 'warning',
          reason: `Align minimum stake requirement to ${desiredMinimumStake} ${AGIALPHA_TOKEN_SYMBOL}.`,
          target: desiredAmount,
          tx
        });
      } else {
        directives.notices.push(
          'Desired minimum stake differs from on-chain value – provide STAKE_MANAGER_ADDRESS to craft governance transaction.'
        );
      }
    }
  }

  if (!stakeEvaluation.penaltyActive && stakeEvaluation.meets && autoResume) {
    if (systemPauseAddress) {
      directives.actions.push({
        type: 'resume',
        level: directives.priority,
        reason: 'Stake posture healthy – resume operations as auto-resume is enabled.',
        tx: buildSystemPauseTx({ systemPauseAddress, action: 'resume' })
      });
    } else {
      directives.notices.push('Auto-resume requested – provide SYSTEM_PAUSE_ADDRESS to generate resume transaction.');
    }
  }

  if (stakeEvaluation.heartbeatStale) {
    directives.priority = directives.priority === 'critical' ? 'critical' : 'warning';
    directives.notices.push(
      'Heartbeat appears stale – submit heartbeat to PlatformIncentives to avoid inactivity slashing.'
    );
  }

  if (directives.actions.length === 0 && directives.priority === 'nominal') {
    directives.notices.push('Stake posture nominal – maintain monitoring cadence.');
  }

  return directives;
}

export { formatExactAmount };
