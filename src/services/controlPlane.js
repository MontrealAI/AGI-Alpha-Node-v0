import {
  AGIALPHA_TOKEN_DECIMALS,
  AGIALPHA_TOKEN_SYMBOL
} from '../constants/token.js';
import { formatTokenAmount, parseTokenAmount } from '../utils/formatters.js';
import { buildStakeAndActivateTx } from './staking.js';
import {
  buildSystemPauseTx,
  buildMinimumStakeTx,
  buildGlobalSharesTx,
  buildRoleShareTx,
  resolveRoleIdentifier
} from './governance.js';

function formatExactAmount(value, decimals = AGIALPHA_TOKEN_DECIMALS) {
  if (typeof value !== 'bigint') return null;
  try {
    return formatTokenAmount(value, decimals, decimals);
  } catch (error) {
    return null;
  }
}

function hasValue(value) {
  return value !== undefined && value !== null;
}

function findCurrentRoleShare(role, roleShares = {}) {
  if (!role || !roleShares) return undefined;
  const candidates = new Set();
  const trimmed = role.trim();
  if (!trimmed) return undefined;
  candidates.add(trimmed);
  candidates.add(trimmed.toLowerCase());
  candidates.add(trimmed.toUpperCase());

  try {
    const identifier = resolveRoleIdentifier(trimmed);
    candidates.add(identifier);
    candidates.add(identifier.toLowerCase());
    candidates.add(identifier.toUpperCase());
  } catch {
    // resolveRoleIdentifier will throw for malformed inputs; ignore for matching purposes.
  }

  for (const [key, value] of Object.entries(roleShares)) {
    if (candidates.has(key) || candidates.has(key.toLowerCase()) || candidates.has(key.toUpperCase())) {
      return value;
    }
  }

  return undefined;
}

export function deriveOwnerDirectives({
  stakeStatus,
  stakeEvaluation,
  rewardsProjection = null,
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
    autoResume,
    rewardEngineAddress,
    desiredOperatorShareBps,
    desiredValidatorShareBps,
    desiredTreasuryShareBps,
    roleShareTargets
  } = config;

  const currentShares = {
    operator: rewardsProjection?.operatorShareBps ?? null,
    validator: rewardsProjection?.validatorShareBps ?? null,
    treasury: rewardsProjection?.treasuryShareBps ?? null
  };

  const currentRoleShares = rewardsProjection?.roleShares ?? null;

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

  const globalShareTargetsProvided =
    hasValue(desiredOperatorShareBps) &&
    hasValue(desiredValidatorShareBps) &&
    hasValue(desiredTreasuryShareBps);

  const anyGlobalTargetProvided =
    hasValue(desiredOperatorShareBps) || hasValue(desiredValidatorShareBps) || hasValue(desiredTreasuryShareBps);

  if (globalShareTargetsProvided) {
    if (!rewardEngineAddress) {
      directives.notices.push(
        'Desired global share alignment provided – configure REWARD_ENGINE_ADDRESS to synthesize governance payload.'
      );
    } else {
      const sharesMatch =
        currentShares.operator === desiredOperatorShareBps &&
        currentShares.validator === desiredValidatorShareBps &&
        currentShares.treasury === desiredTreasuryShareBps;

      if (!sharesMatch) {
        directives.priority = directives.priority === 'critical' ? 'critical' : 'warning';
        const tx = buildGlobalSharesTx({
          rewardEngineAddress,
          operatorShareBps: desiredOperatorShareBps,
          validatorShareBps: desiredValidatorShareBps,
          treasuryShareBps: desiredTreasuryShareBps
        });
        directives.actions.push({
          type: 'set-global-shares',
          level: 'warning',
          reason: `Align RewardEngine global shares to operator ${desiredOperatorShareBps}bps / validator ${desiredValidatorShareBps}bps / treasury ${desiredTreasuryShareBps}bps.`,
          tx,
          currentShares,
          targetShares: {
            operator: desiredOperatorShareBps,
            validator: desiredValidatorShareBps,
            treasury: desiredTreasuryShareBps
          }
        });
      }

      if (!hasValue(currentShares.operator) || !hasValue(currentShares.validator) || !hasValue(currentShares.treasury)) {
        directives.notices.push(
          'Global share telemetry unavailable – owner policy will be reasserted proactively.'
        );
      }
    }
  } else if (anyGlobalTargetProvided) {
    directives.notices.push(
      'Provide operator, validator, and treasury share targets to construct a complete global share transaction.'
    );
  }

  if (roleShareTargets && Object.keys(roleShareTargets).length > 0) {
    if (!rewardEngineAddress) {
      directives.notices.push(
        'Role share targets detected – configure REWARD_ENGINE_ADDRESS to craft setRoleShare payloads.'
      );
    } else {
      for (const [role, share] of Object.entries(roleShareTargets)) {
        if (!hasValue(share)) continue;
        const currentShare = findCurrentRoleShare(role, currentRoleShares);
        if (currentShare === share) {
          continue;
        }
        directives.priority = directives.priority === 'critical' ? 'critical' : 'warning';
        const tx = buildRoleShareTx({ rewardEngineAddress, role, shareBps: share });
        directives.actions.push({
          type: 'set-role-share',
          level: 'warning',
          role,
          reason: `Set ${role} share to ${share}bps to mirror owner policy.`,
          tx,
          shareBps: share,
          currentShareBps: currentShare ?? null
        });
      }
      if (!currentRoleShares) {
        directives.notices.push(
          'Role share telemetry unavailable – actions generated using declared owner policy values.'
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
