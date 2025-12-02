import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
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
import { loadConfig, resetConfigCache } from '../src/config/env.js';

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

  it('parses p2p multiaddr lists and deduplicates entries', () => {
    const config = coerceConfig({
      RPC_URL: 'https://rpc.ankr.com/eth',
      P2P_LISTEN_MULTIADDRS: '/ip4/0.0.0.0/tcp/4001, /ip4/0.0.0.0/udp/4001/quic',
      P2P_PUBLIC_MULTIADDRS: [' /dns4/example.com/tcp/443/wss/p2p/peer ', '/dns4/example.com/tcp/443/wss/p2p/peer'],
      P2P_RELAY_MULTIADDRS: JSON.stringify(['/dns4/relay.example.com/tcp/443/wss/p2p-circuit']),
      P2P_LAN_MULTIADDRS: '  \n/ip4/192.168.1.10/tcp/4001   ',
      AUTONAT_REACHABILITY: 'PUBLIC'
    });

    expect(config.P2P_LISTEN_MULTIADDRS).toEqual([
      '/ip4/0.0.0.0/tcp/4001',
      '/ip4/0.0.0.0/udp/4001/quic'
    ]);
    expect(config.P2P_PUBLIC_MULTIADDRS).toEqual(['/dns4/example.com/tcp/443/wss/p2p/peer']);
    expect(config.P2P_RELAY_MULTIADDRS).toEqual(['/dns4/relay.example.com/tcp/443/wss/p2p-circuit']);
    expect(config.P2P_LAN_MULTIADDRS).toEqual(['/ip4/192.168.1.10/tcp/4001']);
    expect(config.AUTONAT_REACHABILITY).toBe('public');
  });

  it('parses pubsub mesh and gossip controls', () => {
    const config = coerceConfig({
      RPC_URL: 'https://rpc.ankr.com/eth',
      PUBSUB_D: '10',
      PUBSUB_D_LOW: '7',
      PUBSUB_D_HIGH: '14',
      PUBSUB_D_OUT: '40',
      PUBSUB_D_LAZY: '20',
      PUBSUB_GOSSIP_FACTOR: '0.3',
      PUBSUB_GOSSIP_RETRANSMISSION: '5',
      PUBSUB_FANOUT_TTL_SECONDS: '120',
      PUBSUB_OPPORTUNISTIC_GRAFT_THRESHOLD: '6',
      PUBSUB_OPPORTUNISTIC_GRAFT_PEERS: '9',
      PUBSUB_PEER_EXCHANGE: 'false',
      PUBSUB_FLOOD_PUBLISH: 'false',
      PUBSUB_ALLOW_PUBLISH_TO_ZERO_PEERS: 'true'
    });

    expect(config.PUBSUB_D).toBe(10);
    expect(config.PUBSUB_D_LOW).toBe(7);
    expect(config.PUBSUB_D_HIGH).toBe(14);
    expect(config.PUBSUB_D_OUT).toBe(40);
    expect(config.PUBSUB_D_LAZY).toBe(20);
    expect(config.PUBSUB_GOSSIP_FACTOR).toBeCloseTo(0.3);
    expect(config.PUBSUB_GOSSIP_RETRANSMISSION).toBe(5);
    expect(config.PUBSUB_FANOUT_TTL_SECONDS).toBe(120);
    expect(config.PUBSUB_OPPORTUNISTIC_GRAFT_THRESHOLD).toBe(6);
    expect(config.PUBSUB_OPPORTUNISTIC_GRAFT_PEERS).toBe(9);
    expect(config.PUBSUB_PEER_EXCHANGE).toBe(false);
    expect(config.PUBSUB_FLOOD_PUBLISH).toBe(false);
    expect(config.PUBSUB_ALLOW_PUBLISH_TO_ZERO_PEERS).toBe(true);
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

  describe('loadConfig', () => {
    const baseEnv = { ...process.env };
    let tempDir;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'agi-config-'));
      process.env = { ...baseEnv };
      resetConfigCache();
    });

    afterEach(() => {
      process.env = baseEnv;
      resetConfigCache();
      if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('hydrates default .env on first load when no CONFIG_PATH is provided', () => {
      const envPath = join(tempDir, '.env');
      writeFileSync(envPath, 'RPC_URL=https://rpc.default\n');
      delete process.env.RPC_URL;

      const config = loadConfig({}, { workingDir: tempDir });

      expect(config.RPC_URL).toBe('https://rpc.default');
    });

    it('does not override existing environment variables when hydrating the default .env', () => {
      const envPath = join(tempDir, '.env');
      writeFileSync(envPath, 'RPC_URL=https://rpc.default\n');
      process.env.RPC_URL = 'https://rpc.from.env';

      const config = loadConfig({}, { workingDir: tempDir });

      expect(config.RPC_URL).toBe('https://rpc.from.env');
    });

    it('hydrates configuration from CONFIG_PATH env files', () => {
      const envPath = join(tempDir, 'node.env');
      writeFileSync(envPath, 'RPC_URL=https://rpc.from.file\nNODE_LABEL=from-file\n');
      process.env.CONFIG_PATH = envPath;

      const config = loadConfig();

      expect(config.RPC_URL).toBe('https://rpc.from.file');
      expect(config.NODE_LABEL).toBe('from-file');
    });

    it('refreshes cached configuration when the config path changes', () => {
      const firstEnv = join(tempDir, 'first.env');
      const secondEnv = join(tempDir, 'second.env');
      writeFileSync(firstEnv, 'RPC_URL=https://rpc.first\n');
      writeFileSync(secondEnv, 'RPC_URL=https://rpc.second\n');

      const firstConfig = loadConfig({}, { configPath: firstEnv });
      const secondConfig = loadConfig({}, { configPath: secondEnv });

      expect(firstConfig.RPC_URL).toBe('https://rpc.first');
      expect(secondConfig.RPC_URL).toBe('https://rpc.second');
    });
  });
});
