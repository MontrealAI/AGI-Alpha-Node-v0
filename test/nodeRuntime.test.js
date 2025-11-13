import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { loadOfflineSnapshot } from '../src/services/offlineSnapshot.js';

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

vi.mock('../src/services/performance.js', () => ({
  derivePerformanceProfile: vi.fn()
}));

vi.mock('../src/services/governanceStatus.js', () => ({
  fetchGovernanceStatus: vi.fn()
}));

vi.mock('../src/services/metering.js', () => ({
  startSegment: vi.fn(() => ({ segmentId: 'segment-1', startedAt: new Date().toISOString(), epochId: 'epoch-0' })),
  stopSegment: vi.fn(() => ({ alphaWU: 12 }))
}));

vi.mock('../src/services/executionContext.js', () => ({
  getDeviceInfo: vi.fn(() => ({ deviceClass: 'A100-80GB', vramTier: 'TIER_80', gpuCount: 1 })),
  getSlaProfile: vi.fn(() => 'STANDARD')
}));

import { verifyNodeOwnership } from '../src/services/ensVerifier.js';
import { getStakeStatus, validateStakeThreshold, evaluateStakeConditions } from '../src/services/staking.js';
import { projectEpochRewards } from '../src/services/rewards.js';
import { deriveOwnerDirectives } from '../src/services/controlPlane.js';
import { derivePerformanceProfile } from '../src/services/performance.js';
import { runNodeDiagnostics, bindExecutionLoopMetering } from '../src/orchestrator/nodeRuntime.js';
import { fetchGovernanceStatus } from '../src/services/governanceStatus.js';
import { startSegment, stopSegment } from '../src/services/metering.js';
import { getDeviceInfo, getSlaProfile } from '../src/services/executionContext.js';

describe('runNodeDiagnostics', () => {
const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

const tempDirs = new Set();

beforeEach(() => {
  vi.clearAllMocks();
  fetchGovernanceStatus.mockResolvedValue(null);
});

afterEach(() => {
  for (const dir of tempDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup issues
    }
    tempDirs.delete(dir);
  }
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
    derivePerformanceProfile.mockReturnValue({ throughputPerEpoch: 4, successRate: 0.9, tokenEarningsProjection: 1500n });

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
    expect(projectEpochRewards).toHaveBeenCalledWith({
      projectedPool: '1500',
      operatorShareBps: undefined,
      validatorShareBps: undefined,
      treasuryShareBps: undefined,
      roleShares: undefined,
      decimals: undefined
    });
    expect(fetchGovernanceStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: expect.any(Object),
        stakeStatus: { minimumStake: 1000n, operatorStake: 1500n },
        jobRegistryAddress: undefined,
        identityRegistryAddress: undefined
      })
    );
    expect(evaluateStakeConditions).toHaveBeenCalledWith({
      minimumStake: 1000n,
      operatorStake: 1500n,
      slashingPenalty: undefined,
      lastHeartbeat: undefined,
      currentTimestamp: expect.any(Number)
    });
    expect(deriveOwnerDirectives).toHaveBeenCalledWith(
      expect.objectContaining({
        stakeStatus: { minimumStake: 1000n, operatorStake: 1500n },
        stakeEvaluation: expect.objectContaining({ recommendedAction: 'maintain' }),
        rewardsProjection: { pool: 1500n, operatorPortion: 225n, operatorShareBps: 1500 },
        governanceStatus: null,
        config: expect.objectContaining({
          systemPauseAddress: undefined,
          incentivesAddress: '0x0000000000000000000000000000000000000002',
          stakeManagerAddress: '0x0000000000000000000000000000000000000001',
          desiredMinimumStake: undefined,
          autoResume: false,
          rewardEngineAddress: undefined,
          desiredOperatorShareBps: undefined,
          desiredValidatorShareBps: undefined,
          desiredTreasuryShareBps: undefined,
          roleShareTargets: undefined,
          jobRegistryAddress: null,
          identityRegistryAddress: null,
          desiredJobRegistryAddress: undefined,
          desiredIdentityRegistryAddress: undefined,
          desiredValidationModuleAddress: undefined,
          desiredReputationModuleAddress: undefined,
          desiredDisputeModuleAddress: undefined
        })
      })
    );
    expect(diagnostics.ownerDirectives).toEqual(
      expect.objectContaining({ priority: 'nominal', notices: expect.arrayContaining([expect.any(String)]) })
    );
    expect(derivePerformanceProfile).toHaveBeenCalled();
    expect(diagnostics.performance).toEqual(
      expect.objectContaining({ throughputPerEpoch: 4, successRate: 0.9 })
    );
    expect(diagnostics.runtimeMode).toBe('online');
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
    expect(fetchGovernanceStatus).not.toHaveBeenCalled();
    expect(deriveOwnerDirectives).not.toHaveBeenCalled();
  });

  it('supports offline snapshots when RPC connectivity is unavailable', async () => {
    evaluateStakeConditions.mockReturnValue({
      meets: false,
      deficit: 200n,
      penaltyActive: false,
      heartbeatAgeSeconds: 120,
      heartbeatStale: true,
      shouldPause: false,
      recommendedAction: 'increase-stake'
    });
    projectEpochRewards.mockReturnValue({
      pool: 1500n,
      operatorPortion: 240n,
      operatorShareBps: 1600
    });
    deriveOwnerDirectives.mockReturnValue({
      priority: 'warning',
      actions: [
        { type: 'stake-top-up', level: 'warning', reason: 'Increase stake', tx: { to: '0x0', data: '0x' } }
      ],
      notices: ['Offline diagnostics']
    });
    derivePerformanceProfile.mockReturnValue({ throughputPerEpoch: 2, successRate: 0.75, tokenEarningsProjection: 800n });

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-node-runtime-'));
    tempDirs.add(dir);
    const snapshotPath = path.join(dir, 'snapshot.json');
    fs.writeFileSync(
      snapshotPath,
      JSON.stringify(
        {
          label: '3',
          ens: {
            resolvedAddress: '0x0000000000000000000000000000000000000abc',
            registryOwner: '0x0000000000000000000000000000000000000abc'
          },
          staking: {
            minimumStake: '1000',
            operatorStake: '800',
            slashingPenalty: '0x0',
            lastHeartbeat: '1700000000',
            active: true
          },
          rewards: {
            projectedPool: '1500',
            operatorShareBps: 1600
          }
        },
        null,
        2
      )
    );
    const offlineSnapshot = loadOfflineSnapshot(snapshotPath);

    const diagnostics = await runNodeDiagnostics({
      rpcUrl: 'https://unused.rpc',
      label: '3',
      parentDomain: 'alpha.node.agi.eth',
      operatorAddress: '0x0000000000000000000000000000000000000abc',
      offlineSnapshot,
      logger
    });

    expect(verifyNodeOwnership).not.toHaveBeenCalled();
    expect(getStakeStatus).not.toHaveBeenCalled();
    expect(diagnostics.verification.success).toBe(true);
    expect(diagnostics.stakeStatus).toEqual({
      operator: null,
      minimumStake: 1000n,
      operatorStake: 800n,
      active: true,
      lastHeartbeat: 1_700_000_000n,
      healthy: null,
      slashingPenalty: 0n
    });
    expect(projectEpochRewards).toHaveBeenCalledWith(
      expect.objectContaining({
        projectedPool: '1500',
        operatorShareBps: 1600,
        validatorShareBps: undefined,
        treasuryShareBps: undefined,
        roleShares: undefined,
        decimals: undefined
      })
    );
    expect(fetchGovernanceStatus).not.toHaveBeenCalled();
    expect(deriveOwnerDirectives).toHaveBeenCalledWith(
      expect.objectContaining({
        governanceStatus: null,
        config: expect.objectContaining({ autoResume: false })
      })
    );
    expect(diagnostics.ownerDirectives.priority).toBe('warning');
    expect(diagnostics.ownerDirectives.actions[0].type).toBe('stake-top-up');
    expect(diagnostics.runtimeMode).toBe('offline-snapshot');
  });
});

describe('bindExecutionLoopMetering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts and stops metering segments as job status changes', () => {
    const listeners = new Map();
    const logger = { child: () => logger, debug: vi.fn(), warn: vi.fn() };
    const jobLifecycle = {
      on: vi.fn((event, handler) => {
        listeners.set(event, handler);
        return () => listeners.delete(event);
      }),
      off: vi.fn()
    };

    const binding = bindExecutionLoopMetering({ jobLifecycle, logger });
    expect(jobLifecycle.on).toHaveBeenCalledWith('job:update', expect.any(Function));

    const handler = listeners.get('job:update');
    handler({ jobId: 'job-42', status: 'assigned', tags: ['model:LLM_8B'] });
    expect(getDeviceInfo).toHaveBeenCalled();
    expect(getSlaProfile).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-42' }));
    expect(startSegment).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-42', modelClass: 'LLM_8B', slaProfile: expect.any(String) })
    );

    handler({ jobId: 'job-42', status: 'submitted' });
    expect(stopSegment).toHaveBeenCalledWith('segment-1');

    binding.detach();
    expect(jobLifecycle.on).toHaveBeenCalledTimes(1);
  });
});
