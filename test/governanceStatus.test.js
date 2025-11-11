import { describe, expect, it, vi } from 'vitest';
import { fetchGovernanceStatus } from '../src/services/governanceStatus.js';

function createMockContract(methods) {
  return new Proxy(
    {},
    {
      get: (_, key) => {
        if (!(key in methods)) {
          throw new Error(`Unexpected contract method ${String(key)}`);
        }
        return methods[key];
      }
    }
  );
}

describe('governance status fetcher', () => {
  it('resolves job registry modules when provider is available', async () => {
    const contractFactory = vi.fn(() =>
      createMockContract({
        validationModule: vi.fn().mockResolvedValue('0x0000000000000000000000000000000000000011'),
        reputationModule: vi.fn().mockResolvedValue('0x0000000000000000000000000000000000000022'),
        disputeModule: vi.fn().mockResolvedValue('0x0000000000000000000000000000000000000033')
      })
    );

    const status = await fetchGovernanceStatus({
      provider: {},
      stakeStatus: { jobRegistryAddress: '0x00000000000000000000000000000000000000aa' },
      contractFactory
    });

    expect(contractFactory).toHaveBeenCalledTimes(1);
    expect(status.jobRegistry.address).toBe('0x00000000000000000000000000000000000000AA');
    expect(status.jobRegistry.validationModule).toBe('0x0000000000000000000000000000000000000011');
    expect(status.jobRegistry.reputationModule).toBe('0x0000000000000000000000000000000000000022');
    expect(status.jobRegistry.disputeModule).toBe('0x0000000000000000000000000000000000000033');
  });

  it('returns minimal status when provider is missing', async () => {
    const status = await fetchGovernanceStatus({
      provider: null,
      stakeStatus: {
        jobRegistryAddress: '0x00000000000000000000000000000000000000aa',
        identityRegistryAddress: '0x00000000000000000000000000000000000000bb'
      }
    });

    expect(status.jobRegistry.address).toBe('0x00000000000000000000000000000000000000AA');
    expect(status.jobRegistry.validationModule).toBeNull();
    expect(status.identityRegistry.address).toBe('0x00000000000000000000000000000000000000bb');
  });
});
