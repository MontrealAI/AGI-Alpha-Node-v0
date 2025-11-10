import { describe, expect, it, vi } from 'vitest';
import { buildStakeAndActivateTx, getStakeStatus, validateStakeThreshold } from '../src/services/staking.js';

function createMockContract(methods) {
  return new Proxy({}, {
    get: (_, key) => {
      if (!(key in methods)) {
        throw new Error(`Unexpected contract method ${String(key)}`);
      }
      return methods[key];
    }
  });
}

describe('staking helpers', () => {
  it('builds stake transaction payload', () => {
    const tx = buildStakeAndActivateTx({ amount: '10', incentivesAddress: '0x000000000000000000000000000000000000dEaD' });
    expect(tx.to).toBe('0x000000000000000000000000000000000000dEaD');
    expect(typeof tx.data).toBe('string');
    expect(tx.amount).toBe(10000000000000000000n);
  });

  it('validates stake thresholds', () => {
    const evaluation = validateStakeThreshold({ minimumStake: 1000n, operatorStake: 1200n });
    expect(evaluation).toEqual({ meets: true, deficit: 0n });
  });

  it('reads stake status via contracts', async () => {
    const mockProvider = {};
    const contractFactory = vi.fn((address) => {
      if (address === 'stake') {
        return createMockContract({
          minimumStake: vi.fn().mockResolvedValue(1000n),
          getStake: vi.fn().mockResolvedValue(1500n),
          isOperatorHealthy: vi.fn().mockResolvedValue(true)
        });
      }
      return createMockContract({
        operatorInfo: vi.fn().mockResolvedValue([1500n, true, 123n]),
        minimumStake: vi.fn().mockResolvedValue(1000n)
      });
    });

    const status = await getStakeStatus({
      provider: mockProvider,
      operatorAddress: '0x000000000000000000000000000000000000dEaD',
      stakeManagerAddress: 'stake',
      incentivesAddress: 'incentives',
      contractFactory
    });

    expect(status.minimumStake).toBe(1000n);
    expect(status.operatorStake).toBe(1500n);
    expect(status.active).toBe(true);
    expect(status.lastHeartbeat).toBe(123n);
    expect(status.healthy).toBe(true);
  });
});
