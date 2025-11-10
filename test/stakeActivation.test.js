import { describe, expect, it, vi } from 'vitest';
import { acknowledgeStakeAndActivate, selectActivationMethod } from '../src/services/stakeActivation.js';

describe('stakeActivation', () => {
  it('selects acknowledgeStakeAndActivate when available', () => {
    const contract = { acknowledgeStakeAndActivate: vi.fn() };
    expect(selectActivationMethod(contract)).toBe('acknowledgeStakeAndActivate');
  });

  it('falls back to stakeAndActivate when acknowledge is unavailable', () => {
    const contract = { stakeAndActivate: vi.fn() };
    expect(selectActivationMethod(contract)).toBe('stakeAndActivate');
  });

  it('throws when no supported methods exist', () => {
    expect(() => selectActivationMethod({})).toThrow(/does not expose/);
  });

  it('broadcasts activation using injected factories', async () => {
    const contract = {
      acknowledgeStakeAndActivate: vi.fn(async () => ({ hash: '0x1', wait: vi.fn(async () => ({ status: 1 })) }))
    };
    const result = await acknowledgeStakeAndActivate({
      rpcUrl: 'https://rpc.example',
      privateKey: '0x'.padEnd(66, '1'),
      incentivesAddress: '0x'.padEnd(42, '2'),
      amount: '100',
      providerFactory: () => ({}),
      walletFactory: () => ({}),
      contractFactory: () => contract,
      logger: { info: vi.fn() }
    });
    expect(contract.acknowledgeStakeAndActivate).toHaveBeenCalled();
    expect(result.transactionHash).toBe('0x1');
  });

  it('validates positive amounts', async () => {
    await expect(
      acknowledgeStakeAndActivate({
        rpcUrl: 'https://rpc.example',
        privateKey: '0x'.padEnd(66, '1'),
        incentivesAddress: '0x'.padEnd(42, '2'),
        amount: '0',
        providerFactory: () => ({}),
        walletFactory: () => ({}),
        contractFactory: () => ({ acknowledgeStakeAndActivate: vi.fn() }),
        logger: { info: vi.fn() }
      })
    ).rejects.toThrow(/greater than zero/);
  });
});
