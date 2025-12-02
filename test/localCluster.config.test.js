import { describe, expect, it, vi } from 'vitest';
import { Wallet } from 'ethers';
import { ensureLocalKeys } from '../scripts/local_cluster.mjs';

function silentLogger() {
  return { warn: vi.fn() };
}

describe('local cluster config hydration', () => {
  it('generates ephemeral operator and validator keys when missing', () => {
    const baseConfig = {};
    const hydrated = ensureLocalKeys(baseConfig, silentLogger());

    expect(hydrated.NODE_PRIVATE_KEY).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(hydrated.VALIDATOR_PRIVATE_KEY).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(hydrated.OPERATOR_ADDRESS).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it('preserves provided secrets and address overrides', () => {
    const operator = Wallet.createRandom();
    const validator = Wallet.createRandom();
    const overrides = {
      NODE_PRIVATE_KEY: operator.privateKey,
      VALIDATOR_PRIVATE_KEY: validator.privateKey,
      OPERATOR_ADDRESS: operator.address
    };

    const hydrated = ensureLocalKeys(overrides, silentLogger());

    expect(hydrated.NODE_PRIVATE_KEY).toBe(operator.privateKey);
    expect(hydrated.VALIDATOR_PRIVATE_KEY).toBe(validator.privateKey);
    expect(hydrated.OPERATOR_ADDRESS).toBe(operator.address);
  });
});
