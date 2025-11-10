import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../src/services/stakeActivation.js', () => ({
  acknowledgeStakeAndActivate: vi.fn(() => Promise.resolve({ transactionHash: '0xabc', method: 'acknowledgeStakeAndActivate' }))
}));

import { acknowledgeStakeAndActivate } from '../src/services/stakeActivation.js';
import { handleStakeActivation } from '../src/orchestrator/stakeActivator.js';

describe('handleStakeActivation', () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const diagnostics = {
    stakeStatus: { active: false },
    stakeEvaluation: { meets: false, deficit: 1000n }
  };

  const baseConfig = {
    RPC_URL: 'https://rpc.example',
    NODE_LABEL: '1',
    OPERATOR_ADDRESS: '0x0000000000000000000000000000000000000001',
    PLATFORM_INCENTIVES_ADDRESS: '0x0000000000000000000000000000000000000002',
    AUTO_STAKE: true,
    INTERACTIVE_STAKE: false,
    STAKE_AMOUNT: '1500',
    DRY_RUN: false,
    OPERATOR_PRIVATE_KEY: '0x'.padEnd(66, '1')
  };

  it('invokes acknowledgeStakeAndActivate when auto-stake conditions are met', async () => {
    await handleStakeActivation({ diagnostics, config: baseConfig, logger });
    expect(acknowledgeStakeAndActivate).toHaveBeenCalledWith(
      expect.objectContaining({
        rpcUrl: baseConfig.RPC_URL,
        incentivesAddress: baseConfig.PLATFORM_INCENTIVES_ADDRESS,
        amount: baseConfig.STAKE_AMOUNT
      })
    );
  });

  it('skips activation when stake posture already meets minimums', async () => {
    await handleStakeActivation({
      diagnostics: { stakeStatus: { active: true }, stakeEvaluation: { meets: true } },
      config: baseConfig,
      logger
    });
    expect(acknowledgeStakeAndActivate).not.toHaveBeenCalled();
  });

  it('requires a private key to proceed', async () => {
    await handleStakeActivation({
      diagnostics,
      config: { ...baseConfig, OPERATOR_PRIVATE_KEY: undefined },
      logger
    });
    expect(logger.error).toHaveBeenCalled();
    expect(acknowledgeStakeAndActivate).not.toHaveBeenCalled();
  });
});
