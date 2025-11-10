import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../src/services/ensVerifier.js', () => ({
  verifyNodeOwnership: vi.fn()
}));

vi.mock('../src/services/staking.js', () => ({
  getStakeStatus: vi.fn(),
  validateStakeThreshold: vi.fn(),
  evaluateStakeConditions: vi.fn()
}));

vi.mock('../src/services/rewards.js', () => ({
  projectEpochRewards: vi.fn()
}));

vi.mock('../src/services/controlPlane.js', () => ({
  deriveOwnerDirectives: vi.fn()
}));

import { verifyNodeOwnership } from '../src/services/ensVerifier.js';
import { getStakeStatus, validateStakeThreshold, evaluateStakeConditions } from '../src/services/staking.js';
import { projectEpochRewards } from '../src/services/rewards.js';
import { deriveOwnerDirectives } from '../src/services/controlPlane.js';
import { runNodeDiagnostics } from '../src/orchestrator/nodeRuntime.js';

describe('runNodeDiagnostics', () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs NodeIdentityVerified and returns diagnostics when ENS ownership matches', async () => {
    verifyNodeOwnership.mockResolvedValue({
      nodeName: '1.alpha.node.agi.eth',
      matches: { resolved: true, registry: true, wrapper: false },
      expectedAddress: '0x000000000000000000000000000000000000dEaD',
      resolvedAddress: '0x000000000000000000000000000000000000dEaD',
      registryOwner: '0x000000000000000000000000000000000000dEaD',
      wrapperOwner: null,
      success: true
    });
    getStakeStatus.mockResolvedValue({ minimumStake: 1000n, operatorStake: 1500n });
    validateStakeThreshold.mockReturnValue({ meets: true, deficit: 0n });
    evaluateStakeConditions.mockReturnValue({
      meets: true,
      deficit: 0n,
      penaltyActive: false,
      heartbeatAgeSeconds: 120,
      heartbeatStale: false,
      shouldPause: false,
      recommendedAction: 'maintain'
    });
    projectEpochRewards.mockReturnValue({ pool: 1500n, operatorPortion: 225n, operatorShareBps: 1500 });
    deriveOwnerDirectives.mockReturnValue({ priority: 'nominal', actions: [], notices: ['Stake posture nominal – maintain monitoring cadence.'] });

    const diagnostics = await runNodeDiagnostics({
      rpcUrl: 'https://example.rpc',
      label: '1',
      parentDomain: 'alpha.node.agi.eth',
      operatorAddress: '0x000000000000000000000000000000000000dEaD',
      stakeManagerAddress: '0x0000000000000000000000000000000000000001',
      incentivesAddress: '0x0000000000000000000000000000000000000002',
      systemPauseAddress: undefined,
      desiredMinimumStake: undefined,
      autoResume: false,
      projectedRewards: '1500',
      logger
    });

    expect(diagnostics.verification.nodeName).toBe('1.alpha.node.agi.eth');
    expect(diagnostics.stakeStatus).toEqual({ minimumStake: 1000n, operatorStake: 1500n });
    expect(diagnostics.stakeEvaluation).toEqual(
      expect.objectContaining({ recommendedAction: 'maintain', penaltyActive: false })
    );
    expect(diagnostics.rewardsProjection.operatorShareBps).toBe(1500);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'NodeIdentityVerified',
        nodeName: '1.alpha.node.agi.eth'
      }),
      'ENS verification completed'
    );
    expect(validateStakeThreshold).toHaveBeenCalledWith({ minimumStake: 1000n, operatorStake: 1500n });
    expect(projectEpochRewards).toHaveBeenCalledWith({ projectedPool: '1500' });
    expect(evaluateStakeConditions).toHaveBeenCalledWith({
      minimumStake: 1000n,
      operatorStake: 1500n,
      slashingPenalty: undefined,
      lastHeartbeat: undefined,
      currentTimestamp: expect.any(Number)
    });
    expect(deriveOwnerDirectives).toHaveBeenCalledWith({
      stakeStatus: { minimumStake: 1000n, operatorStake: 1500n },
      stakeEvaluation: expect.objectContaining({ recommendedAction: 'maintain' }),
      config: {
        systemPauseAddress: undefined,
        incentivesAddress: '0x0000000000000000000000000000000000000002',
        stakeManagerAddress: '0x0000000000000000000000000000000000000001',
        desiredMinimumStake: undefined,
        autoResume: false
      }
    });
    expect(diagnostics.ownerDirectives).toEqual(
      expect.objectContaining({ priority: 'nominal', notices: expect.arrayContaining([expect.any(String)]) })
    );
  });

  it('throws when ENS ownership fails verification and logs failure event', async () => {
    verifyNodeOwnership.mockResolvedValue({
      nodeName: '2.alpha.node.agi.eth',
      matches: { resolved: false, registry: false, wrapper: false },
      expectedAddress: '0x000000000000000000000000000000000000c0de',
      resolvedAddress: null,
      registryOwner: null,
      wrapperOwner: null,
      success: false
    });

    await expect(
      runNodeDiagnostics({
        rpcUrl: 'https://example.rpc',
        label: '2',
        parentDomain: 'alpha.node.agi.eth',
        operatorAddress: '0x000000000000000000000000000000000000c0de',
        stakeManagerAddress: undefined,
        incentivesAddress: undefined,
        systemPauseAddress: undefined,
        desiredMinimumStake: undefined,
        autoResume: false,
        projectedRewards: undefined,
        logger
      })
    ).rejects.toMatchObject({
      message: 'ENS verification failed for 2.alpha.node.agi.eth',
      details: expect.objectContaining({ nodeName: '2.alpha.node.agi.eth' })
    });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'NodeIdentityVerificationFailed',
        nodeName: '2.alpha.node.agi.eth'
      }),
      'ENS verification failed'
    );
    expect(getStakeStatus).not.toHaveBeenCalled();
    expect(projectEpochRewards).not.toHaveBeenCalled();
    expect(deriveOwnerDirectives).not.toHaveBeenCalled();
  });
});
