import { describe, expect, it, vi } from 'vitest';
import { ENS_REGISTRY_ADDRESS, NAME_WRAPPER_ADDRESS, fetchEnsRecords, verifyNodeOwnership } from '../src/services/ensVerifier.js';

describe('ENS verifier', () => {
  it('fetches ENS records with dependency injection', async () => {
    const provider = {
      resolveName: vi.fn().mockResolvedValue('0x000000000000000000000000000000000000dEaD')
    };
    const contractFactory = vi.fn((address) => {
      if (address === ENS_REGISTRY_ADDRESS) {
        return { owner: vi.fn().mockResolvedValue('0x000000000000000000000000000000000000dEaD') };
      }
      if (address === NAME_WRAPPER_ADDRESS) {
        return { ownerOf: vi.fn().mockResolvedValue('0x000000000000000000000000000000000000dEaD') };
      }
      throw new Error('Unexpected address');
    });

    const records = await fetchEnsRecords({
      provider,
      nodeName: '1.alpha.node.agi.eth',
      contractFactory
    });

    expect(records.resolvedAddress).toBe('0x000000000000000000000000000000000000dEaD');
    expect(records.registryOwner).toBe('0x000000000000000000000000000000000000dEaD');
    expect(records.wrapperOwner).toBe('0x000000000000000000000000000000000000dEaD');
  });

  it('verifies ownership against expected address', async () => {
    const provider = {
      resolveName: vi.fn().mockResolvedValue('0x000000000000000000000000000000000000dEaD')
    };
    const contractFactory = vi.fn(() => ({
      owner: vi.fn().mockResolvedValue('0x000000000000000000000000000000000000dEaD'),
      ownerOf: vi.fn().mockResolvedValue('0x000000000000000000000000000000000000dEaD')
    }));

    const verification = await verifyNodeOwnership({
      provider,
      label: '1',
      parentDomain: 'alpha.node.agi.eth',
      expectedAddress: '0x000000000000000000000000000000000000dEaD',
      contractFactory
    });

    expect(verification.success).toBe(true);
    expect(verification.matches.registry).toBe(true);
  });
});
