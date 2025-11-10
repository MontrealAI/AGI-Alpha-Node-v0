import { describe, expect, it } from 'vitest';
import {
  buildSystemPauseTx,
  buildMinimumStakeTx,
  buildRoleShareTx,
  buildGlobalSharesTx,
  resolveRoleIdentifier
} from '../src/services/governance.js';

const DEAD = '0x000000000000000000000000000000000000dEaD';

describe('governance utilities', () => {
  it('builds pause transactions with default action', () => {
    const tx = buildSystemPauseTx({ systemPauseAddress: DEAD });
    expect(tx.to).toBe('0x000000000000000000000000000000000000dEaD');
    expect(tx.method).toBe('pauseAll');
    expect(typeof tx.data).toBe('string');
  });

  it('builds resume transactions for explicit action', () => {
    const tx = buildSystemPauseTx({ systemPauseAddress: DEAD, action: 'resume' });
    expect(tx.method).toBe('resumeAll');
  });

  it('builds setMinimumStake payloads', () => {
    const tx = buildMinimumStakeTx({ stakeManagerAddress: DEAD, amount: '123.45', decimals: 18 });
    expect(tx.to).toBe('0x000000000000000000000000000000000000dEaD');
    expect(tx.amount).toBe(123450000000000000000n);
    expect(typeof tx.data).toBe('string');
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
  });

  it('builds global share payloads with strict sum', () => {
    const tx = buildGlobalSharesTx({
      rewardEngineAddress: DEAD,
      operatorShareBps: 1500,
      validatorShareBps: 7000,
      treasuryShareBps: 1500
    });
    expect(tx.shares).toEqual({ operatorShare: 1500, validatorShare: 7000, treasuryShare: 1500 });
  });

  it('rejects invalid share allocations', () => {
    expect(() => buildGlobalSharesTx({
      rewardEngineAddress: DEAD,
      operatorShareBps: 5000,
      validatorShareBps: 5000,
      treasuryShareBps: 10
    })).toThrow(/sum/);
  });
});
