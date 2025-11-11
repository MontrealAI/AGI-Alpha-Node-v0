import { describe, expect, it } from 'vitest';
import { deriveOwnerDirectives, formatExactAmount } from '../src/services/controlPlane.js';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

describe('control plane directives', () => {
  const scale = 10n ** 18n;

  it('produces critical directives when penalties and deficits are detected', () => {
    const stakeStatus = { minimumStake: 3n * scale, operatorStake: 1n * scale };
    const stakeEvaluation = {
      meets: false,
      deficit: 2n * scale,
      penaltyActive: true,
      heartbeatStale: false,
      recommendedAction: 'pause-and-recover'
    };

    const directives = deriveOwnerDirectives({
      stakeStatus,
      stakeEvaluation,
      config: {
        systemPauseAddress: '0x0000000000000000000000000000000000000001',
        incentivesAddress: '0x0000000000000000000000000000000000000002',
        stakeManagerAddress: '0x0000000000000000000000000000000000000003',
        desiredMinimumStake: '2'
      }
    });

    expect(directives.priority).toBe('critical');
    const pauseAction = directives.actions.find((action) => action.type === 'pause');
    const topUpAction = directives.actions.find((action) => action.type === 'stake-top-up');
    const minimumAction = directives.actions.find((action) => action.type === 'set-minimum-stake');
    expect(pauseAction?.tx?.method).toBe('pauseAll');
    expect(topUpAction?.tx?.amount).toBe(2n * scale);
    expect(minimumAction?.tx?.amount).toBe(2n * scale);
  });

  it('surfaces warnings when addresses are missing', () => {
    const stakeStatus = { minimumStake: 1n * scale, operatorStake: 1n * scale };
    const stakeEvaluation = {
      meets: true,
      deficit: 0n,
      penaltyActive: false,
      heartbeatStale: true,
      recommendedAction: 'submit-heartbeat'
    };

    const directives = deriveOwnerDirectives({
      stakeStatus,
      stakeEvaluation,
      config: { systemPauseAddress: undefined, incentivesAddress: undefined, stakeManagerAddress: undefined }
    });

    expect(directives.priority).toBe('warning');
    expect(directives.actions).toHaveLength(0);
    expect(directives.notices.length).toBeGreaterThanOrEqual(1);
  });

  it('crafts resume transactions when auto-resume is enabled', () => {
    const stakeStatus = { minimumStake: scale, operatorStake: scale };
    const stakeEvaluation = {
      meets: true,
      deficit: 0n,
      penaltyActive: false,
      heartbeatStale: false,
      recommendedAction: 'maintain'
    };

    const directives = deriveOwnerDirectives({
      stakeStatus,
      stakeEvaluation,
      config: { systemPauseAddress: ZERO_ADDRESS, incentivesAddress: ZERO_ADDRESS, autoResume: true }
    });

    const resumeAction = directives.actions.find((action) => action.type === 'resume');
    expect(resumeAction?.tx?.method).toBe('resumeAll');
  });

  it('generates share governance actions when targets are misaligned', () => {
    const stakeStatus = { minimumStake: scale, operatorStake: scale };
    const stakeEvaluation = {
      meets: true,
      deficit: 0n,
      penaltyActive: false,
      heartbeatStale: false,
      recommendedAction: 'maintain'
    };

    const directives = deriveOwnerDirectives({
      stakeStatus,
      stakeEvaluation,
      rewardsProjection: {
        operatorShareBps: 1200,
        validatorShareBps: 7700,
        treasuryShareBps: 1100,
        roleShares: { guardian: 100 }
      },
      config: {
        rewardEngineAddress: '0x0000000000000000000000000000000000000005',
        desiredOperatorShareBps: 1500,
        desiredValidatorShareBps: 7500,
        desiredTreasuryShareBps: 1000,
        roleShareTargets: { guardian: 250 }
      }
    });

    const globalAction = directives.actions.find((action) => action.type === 'set-global-shares');
    const roleAction = directives.actions.find((action) => action.type === 'set-role-share');
    expect(globalAction?.tx?.data).toBeDefined();
    expect(roleAction?.role).toBe('guardian');
    expect(roleAction?.shareBps).toBe(250);
    expect(directives.priority).toBe('warning');
  });

  it('creates registry governance actions when desired targets diverge', () => {
    const stakeStatus = { minimumStake: scale, operatorStake: scale };
    const stakeEvaluation = {
      meets: true,
      deficit: 0n,
      penaltyActive: false,
      heartbeatStale: false,
      recommendedAction: 'maintain'
    };

    const directives = deriveOwnerDirectives({
      stakeStatus,
      stakeEvaluation,
      governanceStatus: {
        jobRegistry: {
          address: '0x00000000000000000000000000000000000000aa',
          validationModule: '0x0000000000000000000000000000000000000011',
          reputationModule: '0x0000000000000000000000000000000000000022'
        },
        identityRegistry: {
          address: '0x00000000000000000000000000000000000000bb'
        }
      },
      config: {
        stakeManagerAddress: '0x0000000000000000000000000000000000000099',
        jobRegistryAddress: '0x00000000000000000000000000000000000000aa',
        identityRegistryAddress: '0x00000000000000000000000000000000000000bb',
        desiredJobRegistryAddress: '0x00000000000000000000000000000000000000cc',
        desiredIdentityRegistryAddress: '0x00000000000000000000000000000000000000dd',
        desiredValidationModuleAddress: '0x0000000000000000000000000000000000000033',
        desiredReputationModuleAddress: '0x0000000000000000000000000000000000000044',
        desiredDisputeModuleAddress: '0x0000000000000000000000000000000000000055'
      }
    });

    const actionTypes = directives.actions.map((action) => action.type);
    expect(actionTypes).toEqual(
      expect.arrayContaining([
        'set-job-registry',
        'set-identity-registry',
        'set-validation-module',
        'set-reputation-module',
        'set-dispute-module'
      ])
    );
    expect(directives.priority).toBe('warning');
  });

  it('formats exact token amounts for display', () => {
    const formatted = formatExactAmount(123456n, 6);
    expect(formatted).toBe('0.123456');
  });
});
