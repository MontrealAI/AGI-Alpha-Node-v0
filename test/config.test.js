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
      AUTO_RESUME: 'true',
      DESIRED_OPERATOR_SHARE_BPS: '1600',
      DESIRED_VALIDATOR_SHARE_BPS: '7300',
      DESIRED_TREASURY_SHARE_BPS: '1100',
      ROLE_SHARE_TARGETS: 'guardian=150,validator=7500'
    });
    expect(config.SYSTEM_PAUSE_ADDRESS).toBe('0x0000000000000000000000000000000000000001');
    expect(config.DESIRED_MINIMUM_STAKE).toBe('1500');
    expect(config.AUTO_RESUME).toBe(true);
    expect(config.DESIRED_OPERATOR_SHARE_BPS).toBe(1600);
    expect(config.DESIRED_VALIDATOR_SHARE_BPS).toBe(7300);
    expect(config.DESIRED_TREASURY_SHARE_BPS).toBe(1100);
    expect(config.ROLE_SHARE_TARGETS).toEqual({ guardian: 150, validator: 7500 });
  });

  it('parses role share targets from JSON', () => {
    const config = coerceConfig({
      RPC_URL: 'https://rpc.ankr.com/eth',
      ROLE_SHARE_TARGETS: JSON.stringify({ treasury: 500, agent: 8500 })
    });
    expect(config.ROLE_SHARE_TARGETS).toEqual({ treasury: 500, agent: 8500 });
  });

  it('rejects malformed desired minimum stake values', () => {
    expect(() =>
      coerceConfig({
        RPC_URL: 'https://rpc.ankr.com/eth',
        DESIRED_MINIMUM_STAKE: 'one thousand'
      })
    ).toThrow(/numeric value/);
  });

  it('validates stake activation fields', () => {
    const config = coerceConfig({
      RPC_URL: 'https://rpc.ankr.com/eth',
      OPERATOR_PRIVATE_KEY: '0x'.padEnd(66, '1'),
      AUTO_STAKE: 'true',
      STAKE_AMOUNT: '1750.5',
      INTERACTIVE_STAKE: 'false',
      OFFLINE_SNAPSHOT_PATH: ' /data/snapshot.json '
    });
    expect(config.OPERATOR_PRIVATE_KEY).toBe('0x'.padEnd(66, '1'));
    expect(config.AUTO_STAKE).toBe(true);
    expect(config.STAKE_AMOUNT).toBe('1750.5');
    expect(config.INTERACTIVE_STAKE).toBe(false);
    expect(config.OFFLINE_SNAPSHOT_PATH).toBe('/data/snapshot.json');

    expect(() =>
      coerceConfig({
        RPC_URL: 'https://rpc.ankr.com/eth',
        OPERATOR_PRIVATE_KEY: 'invalid'
      })
    ).toThrow();
  });
});
