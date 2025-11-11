import { describe, expect, it } from 'vitest';
import {
  buildSystemPauseTx,
  buildMinimumStakeTx,
  buildValidatorThresholdTx,
  buildStakeRegistryUpgradeTx,
  buildRoleShareTx,
  buildGlobalSharesTx,
  buildJobRegistryUpgradeTx,
  buildDisputeTriggerTx,
  buildIdentityDelegateTx,
  buildIncentivesStakeManagerTx,
  buildIncentivesMinimumStakeTx,
  buildIncentivesHeartbeatTx,
  buildIncentivesActivationFeeTx,
  buildIncentivesTreasuryTx,
  getOwnerFunctionCatalog,
  resolveRoleIdentifier
} from '../src/services/governance.js';

const DEAD = '0x000000000000000000000000000000000000dEaD';

describe('governance utilities', () => {
  it('builds pause transactions with default action', () => {
    const tx = buildSystemPauseTx({ systemPauseAddress: DEAD });
    expect(tx.to).toBe('0x000000000000000000000000000000000000dEaD');
    expect(tx.meta.method).toBe('pauseAll');
    expect(typeof tx.data).toBe('string');
  });

  it('builds resume transactions for explicit action', () => {
    const tx = buildSystemPauseTx({ systemPauseAddress: DEAD, action: 'resume' });
    expect(tx.meta.method).toBe('resumeAll');
  });

  it('builds setMinimumStake payloads', () => {
    const tx = buildMinimumStakeTx({ stakeManagerAddress: DEAD, amount: '123.45' });
    expect(tx.to).toBe('0x000000000000000000000000000000000000dEaD');
    expect(tx.amount).toBe(123450000000000000000n);
    expect(typeof tx.data).toBe('string');
    expect(tx.meta.description).toMatch(/minimum operator stake/i);
  });

  it('derives role identifiers from aliases', () => {
    const nodeRole = resolveRoleIdentifier('node');
    const explicit = resolveRoleIdentifier('NODE_OPERATOR_ROLE');
    expect(nodeRole).toBe(explicit);
  });

  it('builds role share payloads', () => {
    const tx = buildRoleShareTx({ rewardEngineAddress: DEAD, role: 'validator', shareBps: 1500 });
    expect(tx.role.startsWith('0x')).toBe(true);
    expect(tx.shareBps).toBe(1500);
    expect(typeof tx.data).toBe('string');
    expect(tx.meta.method).toBe('setRoleShare');
  });

  it('builds global share payloads with strict sum', () => {
    const tx = buildGlobalSharesTx({
      rewardEngineAddress: DEAD,
      operatorShareBps: 1500,
      validatorShareBps: 7000,
      treasuryShareBps: 1500
    });
    expect(tx.shares).toEqual({ operatorShare: 1500, validatorShare: 7000, treasuryShare: 1500 });
    expect(tx.meta.diff.length).toBeGreaterThanOrEqual(0);
  });

  it('rejects invalid share allocations', () => {
    expect(() => buildGlobalSharesTx({
      rewardEngineAddress: DEAD,
      operatorShareBps: 5000,
      validatorShareBps: 5000,
      treasuryShareBps: 10
    })).toThrow(/sum/);
  });

  it('builds validator threshold payloads', () => {
    const tx = buildValidatorThresholdTx({ stakeManagerAddress: DEAD, threshold: 5 });
    expect(tx.meta.method).toBe('setValidatorThreshold');
    expect(typeof tx.data).toBe('string');
  });

  it('builds registry upgrade payloads', () => {
    const tx = buildStakeRegistryUpgradeTx({
      stakeManagerAddress: DEAD,
      registryType: 'job',
      newAddress: '0x0000000000000000000000000000000000000001'
    });
    expect(tx.meta.method).toBe('setJobRegistry');
  });

  it('builds job module upgrade payloads', () => {
    const tx = buildJobRegistryUpgradeTx({
      jobRegistryAddress: DEAD,
      module: 'validation',
      newAddress: '0x0000000000000000000000000000000000000001'
    });
    expect(tx.meta.method).toBe('setValidationModule');
  });

  it('builds dispute trigger payloads', () => {
    const tx = buildDisputeTriggerTx({ jobRegistryAddress: DEAD, jobId: 1, reason: 'test' });
    expect(tx.meta.method).toBe('triggerDispute');
  });

  it('builds identity delegate payloads', () => {
    const tx = buildIdentityDelegateTx({
      identityRegistryAddress: DEAD,
      operatorAddress: '0x0000000000000000000000000000000000000001',
      allowed: true
    });
    expect(tx.meta.method).toBe('setAdditionalNodeOperator');
    expect(tx.meta.proposed.allowed).toBe(true);
  });

  it('builds incentives stake manager payloads', () => {
    const tx = buildIncentivesStakeManagerTx({
      incentivesAddress: DEAD,
      stakeManagerAddress: '0x0000000000000000000000000000000000000001'
    });
    expect(tx.meta.contract).toBe('PlatformIncentives');
    expect(tx.meta.method).toBe('setStakeManager');
  });

  it('builds incentives minimum stake payloads', () => {
    const tx = buildIncentivesMinimumStakeTx({
      incentivesAddress: DEAD,
      amount: '2.5'
    });
    expect(tx.amount).toBe(2500000000000000000n);
    expect(tx.meta.method).toBe('setMinimumStake');
  });

  it('builds incentives heartbeat payloads', () => {
    const tx = buildIncentivesHeartbeatTx({
      incentivesAddress: DEAD,
      graceSeconds: 3600
    });
    expect(tx.meta.method).toBe('setHeartbeatGrace');
    expect(tx.meta.args.newGraceSeconds).toBe('3600');
  });

  it('builds incentives activation fee payloads', () => {
    const tx = buildIncentivesActivationFeeTx({
      incentivesAddress: DEAD,
      feeAmount: '1.75'
    });
    expect(tx.fee).toBe(1750000000000000000n);
    expect(tx.meta.method).toBe('setActivationFee');
  });

  it('builds incentives treasury payloads', () => {
    const tx = buildIncentivesTreasuryTx({
      incentivesAddress: DEAD,
      treasuryAddress: '0x0000000000000000000000000000000000000001'
    });
    expect(tx.meta.method).toBe('setTreasury');
    expect(tx.meta.proposed.treasury).toBe('0x0000000000000000000000000000000000000001');
  });

  it('exposes owner function catalog', () => {
    const catalog = getOwnerFunctionCatalog();
    expect(catalog.StakeManager.some((entry) => entry.signature.includes('setMinimumStake'))).toBe(true);
    expect(catalog.JobRegistry.length).toBeGreaterThan(0);
    expect(catalog.PlatformIncentives.some((entry) => entry.signature.includes('setTreasury'))).toBe(true);
  });
});
