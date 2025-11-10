import { describe, expect, it } from 'vitest';
import { coerceConfig } from '../src/config/schema.js';

describe('config schema', () => {
  it('coerces boolean flags', () => {
    const config = coerceConfig({ DRY_RUN: 'false', RPC_URL: 'https://rpc.ankr.com/eth' });
    expect(config.DRY_RUN).toBe(false);
  });

  it('applies defaults', () => {
    const config = coerceConfig({ RPC_URL: 'https://rpc.ankr.com/eth' });
    expect(config.ENS_PARENT_DOMAIN).toBe('alpha.node.agi.eth');
    expect(config.METRICS_PORT).toBe(9464);
  });

  it('rejects invalid addresses', () => {
    expect(() => coerceConfig({
      RPC_URL: 'https://rpc.ankr.com/eth',
      OPERATOR_ADDRESS: 'not-an-address'
    })).toThrow();
  });
});
