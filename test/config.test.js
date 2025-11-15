import { describe, expect, it } from 'vitest';
import { coerceConfig } from '../src/config/schema.js';
import {
  AGIALPHA_TOKEN_CHECKSUM_ADDRESS,
  AGIALPHA_TOKEN_DECIMALS
} from '../src/constants/token.js';
import {
  MODEL_CLASS_WEIGHTS,
  VRAM_TIER_WEIGHTS,
  SLA_WEIGHTS
} from '../src/constants/workUnits.js';

describe('config schema', () => {
  it('coerces boolean flags', () => {
    const config = coerceConfig({ DRY_RUN: 'false', RPC_URL: 'https://rpc.ankr.com/eth' });
    expect(config.DRY_RUN).toBe(false);
  });

  it('applies defaults', () => {
    const config = coerceConfig({ RPC_URL: 'https://rpc.ankr.com/eth' });
    expect(config.ENS_PARENT_DOMAIN).toBe('alpha.node.agi.eth');
    expect(config.METRICS_PORT).toBe(9464);
    expect(config.HEALTHCHECK_TIMEOUT).toBe(5000);
    expect(config.VERIFIER_PORT).toBe(8787);
    expect(config.AGIALPHA_TOKEN_ADDRESS).toBe(AGIALPHA_TOKEN_CHECKSUM_ADDRESS);
    expect(config.AGIALPHA_TOKEN_DECIMALS).toBe(AGIALPHA_TOKEN_DECIMALS);
  });

  it('coerces healthcheck timeout values safely', () => {
    const config = coerceConfig({
      RPC_URL: 'https://rpc.ankr.com/eth',
      HEALTHCHECK_TIMEOUT: '15000'
    });
    expect(config.HEALTHCHECK_TIMEOUT).toBe(15000);

    expect(() =>
      coerceConfig({
        RPC_URL: 'https://rpc.ankr.com/eth',
        HEALTHCHECK_TIMEOUT: '100'
      })
    ).toThrow(/must be/);
  });

  it('strips unknown environment variables without rejection', () => {
    const config = coerceConfig({
      RPC_URL: 'https://rpc.ankr.com/eth',
      SOME_RANDOM_VAR: 'value',
      HTTP_PROXY: 'http://127.0.0.1:8080'
    });
    expect(config.RPC_URL).toBe('https://rpc.ankr.com/eth');
    expect(config.SOME_RANDOM_VAR).toBeUndefined();
    expect(config.HTTP_PROXY).toBeUndefined();
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
      OFFLINE_SNAPSHOT_PATH: ' /data/snapshot.json ',
      NODE_ENS_NAME: 'Verifier.ALPHA.eth ',
      NODE_PAYOUT_ETH_ADDRESS: '0x0000000000000000000000000000000000000001',
      NODE_PAYOUT_AGIALPHA_ADDRESS: '0x0000000000000000000000000000000000000002',
      VERIFIER_PUBLIC_BASE_URL: 'https://verifier.alpha',
      ENS_CHAIN_ID: '1'
    });
    expect(config.OPERATOR_PRIVATE_KEY).toBe('0x'.padEnd(66, '1'));
    expect(config.AUTO_STAKE).toBe(true);
    expect(config.STAKE_AMOUNT).toBe('1750.5');
    expect(config.INTERACTIVE_STAKE).toBe(false);
    expect(config.OFFLINE_SNAPSHOT_PATH).toBe('/data/snapshot.json');
    expect(config.NODE_ENS_NAME).toBe('verifier.alpha.eth');
    expect(config.NODE_PAYOUT_ETH_ADDRESS).toBe('0x0000000000000000000000000000000000000001');
    expect(config.NODE_PAYOUT_AGIALPHA_ADDRESS).toBe('0x0000000000000000000000000000000000000002');
    expect(config.VERIFIER_PUBLIC_BASE_URL).toBe('https://verifier.alpha');
    expect(config.ENS_CHAIN_ID).toBe(1);

    expect(() =>
      coerceConfig({
        RPC_URL: 'https://rpc.ankr.com/eth',
        OPERATOR_PRIVATE_KEY: 'invalid'
      })
    ).toThrow();
  });

  it('exposes default work unit configuration', () => {
    const config = coerceConfig({ RPC_URL: 'https://rpc.ankr.com/eth' });
    expect(config.WORK_UNITS.baseUnit).toBe(1);
    expect(config.WORK_UNITS.weights.modelClass).toEqual(MODEL_CLASS_WEIGHTS);
    expect(config.WORK_UNITS.weights.vramTier).toEqual(VRAM_TIER_WEIGHTS);
    expect(config.WORK_UNITS.weights.slaProfile).toEqual(SLA_WEIGHTS);
    expect(config.WORK_UNITS.epochDurationSeconds).toBeGreaterThan(0);
  });

  it('allows overriding work unit weights via JSON', () => {
    const overrides = {
      baseUnit: 2,
      epochDurationSeconds: 1800,
      weights: {
        modelClass: { LLM_8B: 1.5 },
        vramTier: { TIER_80: 3.2 },
        slaProfile: { LOW_LATENCY_ENCLAVE: 2.5 }
      }
    };

    const config = coerceConfig({
      RPC_URL: 'https://rpc.ankr.com/eth',
      WORK_UNITS: JSON.stringify(overrides)
    });

    expect(config.WORK_UNITS.baseUnit).toBe(2);
    expect(config.WORK_UNITS.epochDurationSeconds).toBe(1800);
    expect(config.WORK_UNITS.weights.modelClass.LLM_8B).toBe(1.5);
    expect(config.WORK_UNITS.weights.modelClass.LLM_70B).toBe(MODEL_CLASS_WEIGHTS.LLM_70B);
    expect(config.WORK_UNITS.weights.vramTier.TIER_80).toBe(3.2);
    expect(config.WORK_UNITS.weights.slaProfile.LOW_LATENCY_ENCLAVE).toBe(2.5);
  });

  it('rejects invalid work unit weight overrides', () => {
    expect(() =>
      coerceConfig({
        RPC_URL: 'https://rpc.ankr.com/eth',
        WORK_UNITS: JSON.stringify({
          weights: {
            modelClass: { UNKNOWN: 2 }
          }
        })
      })
    ).toThrow(/unknown key/);

    expect(() =>
      coerceConfig({
        RPC_URL: 'https://rpc.ankr.com/eth',
        WORK_UNITS: JSON.stringify({
          weights: {
            slaProfile: { STANDARD: -1 }
          }
        })
      })
    ).toThrow(/cannot be negative/);
  });
});
