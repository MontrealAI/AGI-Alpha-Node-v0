import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAddress } from 'ethers';

const ORIGINAL_ENV = { ...process.env };

async function importConfigModule() {
  const module = await import('../src/ens/config.js');
  return module;
}

function resetEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
}

describe('ENS network config', () => {
  beforeEach(() => {
    resetEnv();
    vi.resetModules();
  });

  afterEach(async () => {
    const { clearEnsConfigCache } = await importConfigModule();
    clearEnsConfigCache();
  });

  it('applies mainnet presets by default', async () => {
    const { loadEnsConfig, PRESET_NETWORKS } = await importConfigModule();
    const config = loadEnsConfig({ forceReload: true });

    expect(config.chainId).toBe(1);
    expect(config.rpcUrl).toBeTruthy();
    expect(config.ensRegistry).toBe(PRESET_NETWORKS[1].ensRegistry);
    expect(config.nameWrapper).toBe(PRESET_NETWORKS[1].nameWrapper);
    expect(config.publicResolver).toBe(PRESET_NETWORKS[1].publicResolver);
  });

  it('allows overriding addresses through environment variables', async () => {
    process.env.ALPHA_NODE_CHAIN_ID = '11155111';
    process.env.ALPHA_NODE_RPC_URL = 'https://rpc.sepolia.example';
    process.env.ALPHA_NODE_ENS_REGISTRY = '0x00000000000000000000000000000000000000ab';
    process.env.ALPHA_NODE_NAME_WRAPPER = '0x00000000000000000000000000000000000000cd';
    process.env.ALPHA_NODE_PUBLIC_RESOLVER = '0x00000000000000000000000000000000000000ef';

    const { loadEnsConfig } = await importConfigModule();
    const config = loadEnsConfig({ forceReload: true });

    expect(config.chainId).toBe(11155111);
    expect(config.rpcUrl).toBe('https://rpc.sepolia.example');
    expect(config.ensRegistry).toBe(getAddress('0x00000000000000000000000000000000000000ab'));
    expect(config.nameWrapper).toBe(getAddress('0x00000000000000000000000000000000000000cd'));
    expect(config.publicResolver).toBe(getAddress('0x00000000000000000000000000000000000000ef'));
  });

  it('throws when provided invalid addresses', async () => {
    const { loadEnsConfig } = await importConfigModule();

    expect(() =>
      loadEnsConfig({
        forceReload: true,
        overrides: {
          ensRegistry: 'not-an-address'
        }
      })
    ).toThrow(/Expected EIP-55 address/);
  });

  it('falls back to network presets when overrides omitted', async () => {
    process.env.ALPHA_NODE_CHAIN_ID = '11155111';
    const { loadEnsConfig, PRESET_NETWORKS } = await importConfigModule();
    const config = loadEnsConfig({ forceReload: true });

    expect(config.chainId).toBe(11155111);
    expect(config.ensRegistry).toBe(PRESET_NETWORKS[11155111].ensRegistry);
    expect(config.nameWrapper).toBe(PRESET_NETWORKS[11155111].nameWrapper);
    expect(config.publicResolver).toBe(PRESET_NETWORKS[11155111].publicResolver);
  });
});
