import { describe, expect, it } from 'vitest';
import * as governance from '../src/services/governance.js';

const {
  buildSystemPauseTx,
  buildMinimumStakeTx,
  buildValidatorThresholdTx,
  buildStakeRegistryUpgradeTx,
  buildRoleShareTx,
  buildGlobalSharesTx,
  buildEmissionPerEpochTx,
  buildEmissionEpochLengthTx,
  buildEmissionCapTx,
  buildEmissionRateMultiplierTx,
  buildJobRegistryUpgradeTx,
  buildDisputeTriggerTx,
  buildIdentityDelegateTx,
  buildNodeRegistrationTx,
  buildNodeMetadataTx,
  buildNodeStatusTx,
  buildNodeOperatorTx,
  buildNodeWorkMeterTx,
  buildWorkMeterValidatorTx,
  buildWorkMeterOracleTx,
  buildWorkMeterWindowTx,
  buildWorkMeterProductivityIndexTx,
  buildWorkMeterUsageTx,
  buildProductivityRecordTx,
  buildProductivityEmissionManagerTx,
  buildProductivityWorkMeterTx,
  buildProductivityTreasuryTx,
  buildIncentivesStakeManagerTx,
  buildIncentivesMinimumStakeTx,
  buildIncentivesHeartbeatTx,
  buildIncentivesActivationFeeTx,
  buildIncentivesTreasuryTx,
  getOwnerFunctionCatalog,
  getOwnerControlSurfaces,
  resolveRoleIdentifier
} = governance;

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

  it('builds emission per epoch payloads', () => {
    const tx = buildEmissionPerEpochTx({
      emissionManagerAddress: DEAD,
      emissionPerEpoch: '12500.5'
    });
    expect(tx.emissionPerEpoch).toBe(12500500000000000000000n);
    expect(tx.meta.method).toBe('setEpochEmission');
    expect(tx.meta.contract).toBe('EmissionManager');
  });

  it('builds epoch length payloads with validation', () => {
    const tx = buildEmissionEpochLengthTx({
      emissionManagerAddress: DEAD,
      epochLengthSeconds: 3600
    });
    expect(tx.epochLengthSeconds).toBe(3600n);
    expect(tx.meta.method).toBe('setEpochLength');
    expect(() => buildEmissionEpochLengthTx({ emissionManagerAddress: DEAD, epochLengthSeconds: 0 })).toThrow(
      /greater than zero/
    );
  });

  it('builds emission cap payloads', () => {
    const tx = buildEmissionCapTx({ emissionManagerAddress: DEAD, emissionCap: '1000000' });
    expect(tx.emissionCap).toBe(1000000000000000000000000n);
    expect(tx.meta.method).toBe('setEmissionCap');
  });

  it('builds emission multiplier payloads', () => {
    const tx = buildEmissionRateMultiplierTx({
      emissionManagerAddress: DEAD,
      numerator: 3,
      denominator: 2
    });
    expect(tx.multiplier).toEqual({ numerator: 3n, denominator: 2n });
    expect(tx.meta.method).toBe('setRewardRateMultiplier');
    expect(() => buildEmissionRateMultiplierTx({ emissionManagerAddress: DEAD, numerator: 1, denominator: 0 })).toThrow(
      /greater than zero/
    );
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

  it('surfaces owner control manifest coverage for every contract method', () => {
    const surfaces = getOwnerControlSurfaces();
    expect(surfaces.length).toBeGreaterThan(0);

    const coverageByContract = new Map();
    for (const surface of surfaces) {
      expect(surface.contract).toBeTruthy();
      expect(surface.methods.length).toBeGreaterThan(0);
      expect(surface.builders.length).toBeGreaterThan(0);
      for (const builderName of surface.builders) {
        expect(typeof governance[builderName]).toBe('function');
      }
      const methodSet = coverageByContract.get(surface.contract) ?? new Set();
      for (const method of surface.methods) {
        methodSet.add(method);
      }
      coverageByContract.set(surface.contract, methodSet);
      expect(surface.coverage.covered).toBe(surface.methods.length);
      expect(surface.coverage.total).toBeGreaterThan(0);
      expect(surface.coverage.percent).toBeGreaterThan(0);
    }

    const catalog = getOwnerFunctionCatalog();
    for (const [contract, entries] of Object.entries(catalog)) {
      const covered = coverageByContract.get(contract);
      expect(covered).toBeDefined();
      for (const entry of entries) {
        const match = entry.signature.match(/function\s+([^(]+)/i);
        const methodName = match ? match[1] : entry.signature;
        expect(covered?.has(methodName)).toBe(true);
      }
    }
  });

  it('builds node registry payloads', () => {
    const tx = buildNodeRegistrationTx({
      nodeRegistryAddress: DEAD,
      nodeId: 'alpha-node-1',
      operatorAddress: '0x0000000000000000000000000000000000000001',
      metadataURI: 'ipfs://node-1'
    });
    expect(tx.meta.contract).toBe('NodeRegistry');
    expect(tx.meta.method).toBe('registerNode');
    expect(tx.nodeId.startsWith('0x')).toBe(true);
    expect(tx.metadataURI).toBe('ipfs://node-1');
  });

  it('builds node metadata updates with diff context', () => {
    const tx = buildNodeMetadataTx({
      nodeRegistryAddress: DEAD,
      nodeId: 'alpha-node-1',
      metadataURI: 'ipfs://node-1-v2',
      currentMetadataURI: 'ipfs://node-1'
    });
    expect(tx.meta.method).toBe('setNodeMetadata');
    expect(tx.meta.current.metadataURI).toBe('ipfs://node-1');
    expect(tx.meta.proposed.metadataURI).toBe('ipfs://node-1-v2');
  });

  it('builds node status toggles', () => {
    const tx = buildNodeStatusTx({
      nodeRegistryAddress: DEAD,
      nodeId: 'alpha-node-1',
      active: false,
      currentStatus: true
    });
    expect(tx.active).toBe(false);
    expect(tx.meta.method).toBe('setNodeStatus');
    expect(tx.meta.current.active).toBe(true);
  });

  it('builds node operator authorization payloads', () => {
    const tx = buildNodeOperatorTx({
      nodeRegistryAddress: DEAD,
      operatorAddress: '0x0000000000000000000000000000000000000002',
      allowed: true,
      currentAllowed: false
    });
    expect(tx.allowed).toBe(true);
    expect(tx.meta.method).toBe('setNodeOperator');
    expect(tx.meta.current.allowed).toBe(false);
  });

  it('builds node work meter binding payloads', () => {
    const tx = buildNodeWorkMeterTx({
      nodeRegistryAddress: DEAD,
      workMeterAddress: '0x0000000000000000000000000000000000000003',
      currentWorkMeter: '0x0000000000000000000000000000000000000004'
    });
    expect(tx.meta.method).toBe('setWorkMeter');
    expect(tx.meta.current.workMeter).toBe('0x0000000000000000000000000000000000000004');
  });

  it('builds work meter validator/oracle/window/productivity payloads', () => {
    const validatorTx = buildWorkMeterValidatorTx({
      workMeterAddress: DEAD,
      validatorAddress: '0x0000000000000000000000000000000000000005',
      allowed: true,
      currentAllowed: false
    });
    expect(validatorTx.meta.method).toBe('setValidator');
    const oracleTx = buildWorkMeterOracleTx({
      workMeterAddress: DEAD,
      oracleAddress: '0x0000000000000000000000000000000000000006',
      allowed: false,
      currentAllowed: true
    });
    expect(oracleTx.allowed).toBe(false);
    const windowTx = buildWorkMeterWindowTx({
      workMeterAddress: DEAD,
      submissionWindowSeconds: 600,
      currentWindowSeconds: 300
    });
    expect(windowTx.submissionWindowSeconds).toBe(600n);
    const productivityTx = buildWorkMeterProductivityIndexTx({
      workMeterAddress: DEAD,
      productivityIndexAddress: '0x0000000000000000000000000000000000000007',
      currentProductivityIndex: '0x0000000000000000000000000000000000000008'
    });
    expect(productivityTx.productivityIndex).toBe('0x0000000000000000000000000000000000000007');
  });

  it('builds work meter usage submissions with derived hash', () => {
    const tx = buildWorkMeterUsageTx({
      workMeterAddress: DEAD,
      reportId: 'usage-1',
      nodeId: 'alpha-node-1',
      gpuSeconds: '123.456',
      gflopsNorm: '789.1',
      modelTier: '1.2',
      sloPass: 0.95,
      quality: 0.9,
      metricDecimals: 6
    });
    expect(tx.meta.method).toBe('submitUsage');
    expect(tx.meta.args.gpuSeconds).toMatch(/^\d+$/);
    expect(tx.meta.args.usageHash.startsWith('0x')).toBe(true);
  });

  it('builds productivity index payloads', () => {
    const recordTx = buildProductivityRecordTx({
      productivityIndexAddress: DEAD,
      epoch: 5,
      alphaWu: '42.5',
      tokensEmitted: '10',
      tokensBurned: '2.5',
      decimals: 18
    });
    expect(recordTx.meta.method).toBe('recordEpoch');
    const emissionTx = buildProductivityEmissionManagerTx({
      productivityIndexAddress: DEAD,
      emissionManagerAddress: '0x0000000000000000000000000000000000000009'
    });
    expect(emissionTx.meta.method).toBe('setEmissionManager');
    const workMeterTx = buildProductivityWorkMeterTx({
      productivityIndexAddress: DEAD,
      workMeterAddress: '0x000000000000000000000000000000000000000a'
    });
    expect(workMeterTx.meta.method).toBe('setWorkMeter');
    const treasuryTx = buildProductivityTreasuryTx({
      productivityIndexAddress: DEAD,
      treasuryAddress: '0x000000000000000000000000000000000000000b'
    });
    expect(treasuryTx.meta.method).toBe('setTreasury');
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
