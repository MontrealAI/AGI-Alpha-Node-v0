import { describe, expect, it } from 'vitest';
import { coerceConfig } from '../src/config/schema.js';
import {
  AGIALPHA_TOKEN_CHECKSUM_ADDRESS,
  AGIALPHA_TOKEN_DECIMALS
} from '../src/constants/token.js';

describe('config schema', () => {
  it('coerces boolean flags', () => {
    const config = coerceConfig({ DRY_RUN: 'false', RPC_URL: 'https://rpc.ankr.com/eth' });
    expect(config.DRY_RUN).toBe(false);
  });

  it('applies defaults', () => {
    const config = coerceConfig({ RPC_URL: 'https://rpc.ankr.com/eth' });
    expect(config.ENS_PARENT_DOMAIN).toBe('alpha.node.agi.eth');
    expect(config.METRICS_PORT).toBe(9464);
    expect(config.AGIALPHA_TOKEN_ADDRESS).toBe(AGIALPHA_TOKEN_CHECKSUM_ADDRESS);
    expect(config.AGIALPHA_TOKEN_DECIMALS).toBe(AGIALPHA_TOKEN_DECIMALS);
  });

  it('rejects invalid addresses', () => {
    expect(() =>
      coerceConfig({
        RPC_URL: 'https://rpc.ankr.com/eth',
        OPERATOR_ADDRESS: 'not-an-address'
      })
    ).toThrow();
  });

  it('enforces canonical token settings', () => {
    expect(() =>
      coerceConfig({
        RPC_URL: 'https://rpc.ankr.com/eth',
        AGIALPHA_TOKEN_ADDRESS: '0x0000000000000000000000000000000000000001'
      })
    ).toThrow(/canonical/);

    expect(() =>
      coerceConfig({
        RPC_URL: 'https://rpc.ankr.com/eth',
        AGIALPHA_TOKEN_DECIMALS: '8'
      })
    ).toThrow(/fixed decimals/);
  });

  it('parses control plane overrides', () => {
    const config = coerceConfig({
      RPC_URL: 'https://rpc.ankr.com/eth',
      SYSTEM_PAUSE_ADDRESS: '0x0000000000000000000000000000000000000001',
      DESIRED_MINIMUM_STAKE: '1500',
      AUTO_RESUME: 'true'
    });
    expect(config.SYSTEM_PAUSE_ADDRESS).toBe('0x0000000000000000000000000000000000000001');
    expect(config.DESIRED_MINIMUM_STAKE).toBe('1500');
    expect(config.AUTO_RESUME).toBe(true);
  });

  it('rejects malformed desired minimum stake values', () => {
    expect(() =>
      coerceConfig({
        RPC_URL: 'https://rpc.ankr.com/eth',
        DESIRED_MINIMUM_STAKE: 'one thousand'
      })
    ).toThrow(/numeric value/);
  });
});
