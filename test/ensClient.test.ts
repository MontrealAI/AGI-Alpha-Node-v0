import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const resolverState = new Map<
  string,
  {
    address: string;
    textRecords: Record<string, string | null>;
    contenthash: string | null;
    pubkey?: { x: string; y: string };
  }
>();

const wrapperState = new Map<string, Map<string, { fuses: number; expiry: bigint; owner: string }>>();
let providerCallCount = 0;

const ZERO_BYTES = `0x${'0'.repeat(64)}`;

vi.mock('ethers', () => {
  class MockResolver {
    constructor(private readonly name: string) {}

    get address(): string {
      return resolverState.get(this.name)?.address ?? '0x0000000000000000000000000000000000000000';
    }

    async getText(key: string): Promise<string | null> {
      return resolverState.get(this.name)?.textRecords[key] ?? null;
    }

    async getContentHash(): Promise<string | null> {
      return resolverState.get(this.name)?.contenthash ?? null;
    }
  }

  class MockJsonRpcProvider {
    readonly url: string;
    readonly chainId: number;

    constructor(url: string, chainId: number) {
      this.url = url;
      this.chainId = chainId;
      providerCallCount += 1;
    }

    async getResolver(name: string): Promise<MockResolver | null> {
      if (!resolverState.has(name)) {
        return null;
      }
      return new MockResolver(name);
    }
  }

  class MockContract {
    constructor(
      private readonly address: string,
      private readonly abi: readonly string[],
      private readonly provider: MockJsonRpcProvider
    ) {}

    async pubkey(node: string): Promise<[string, string]> {
      const entry = [...resolverState.values()].find((resolver) => resolver.address === this.address);
      if (!entry?.pubkey) {
        return [ZERO_BYTES, ZERO_BYTES];
      }
      return [entry.pubkey.x, entry.pubkey.y];
    }

    async getData(node: string): Promise<[string, bigint, bigint]> {
      const records = wrapperState.get(this.address);
      const record = records?.get(node);
      if (!record) {
        const error = new Error('execution reverted');
        (error as { code?: string }).code = 'CALL_EXCEPTION';
        throw error;
      }

      return [record.owner, BigInt(record.fuses), BigInt(record.expiry)];
    }
  }

  return {
    JsonRpcProvider: MockJsonRpcProvider,
    Contract: MockContract,
    namehash: (name: string) => `hash:${name}`,
    getAddress: (address: string) => address.toLowerCase()
  };
});

beforeEach(() => {
  resolverState.clear();
  wrapperState.clear();
  providerCallCount = 0;
  vi.resetModules();
});

afterEach(() => {
  resolverState.clear();
  wrapperState.clear();
  providerCallCount = 0;
});

describe('ENS client', () => {

  afterEach(async () => {
    const { clearEnsClientCache } = await import('../src/ens/client.js');
    const { clearEnsConfigCache } = await import('../src/ens/config.js');
    clearEnsClientCache();
    clearEnsConfigCache();
  });

  it('caches the default client instance', async () => {
    const { getEnsClient } = await import('../src/ens/client.js');

    const clientA = getEnsClient();
    const clientB = getEnsClient();

    expect(clientA).toBe(clientB);
    expect(providerCallCount).toBe(1);
  });

  it('returns null pubkey when resolver has no record', async () => {
    const name = 'alpha.agent.agi.eth';
    resolverState.set(name, {
      address: '0x231b0ee14048e9dccd1d247744d114a4eb5e8e63',
      textRecords: {},
      contenthash: null
    });

    const { getEnsClient } = await import('../src/ens/client.js');
    const client = getEnsClient({ forceReload: true });
    const pubkey = await client.getPubkey(name);

    expect(pubkey).toBeNull();
  });

  it('reads configured pubkey, text records, and contenthash', async () => {
    const name = 'alpha.agent.agi.eth';
    resolverState.set(name, {
      address: '0x231b0ee14048e9dccd1d247744d114a4eb5e8e63',
      textRecords: {
        'node.role': 'orchestrator',
        'node.version': '1.2.3'
      },
      contenthash: '0xe30101701220...',
      pubkey: {
        x: '0x1234'.padEnd(66, '0'),
        y: '0xabcd'.padEnd(66, '0')
      }
    });

    const { getEnsClient } = await import('../src/ens/client.js');
    const client = getEnsClient({ forceReload: true });

    expect(await client.getResolver(name)).toBe('0x231b0ee14048e9dccd1d247744d114a4eb5e8e63');
    expect(await client.getTextRecord(name, 'node.role')).toBe('orchestrator');
    expect(await client.getTextRecord(name, 'node.version')).toBe('1.2.3');
    expect(await client.getContenthash(name)).toBe('0xe30101701220...');
    expect(await client.getPubkey(name)).toEqual({
      x: '0x1234'.padEnd(66, '0'),
      y: '0xabcd'.padEnd(66, '0')
    });
  });

  it('returns NameWrapper metadata when available', async () => {
    const name = 'alpha.agent.agi.eth';
    const namehashValue = `hash:${name}`;
    const wrapperAddress = '0xd4416b13d2b3a9abae7acd5d6c2bbdbe25686401';

    resolverState.set(name, {
      address: '0x231b0ee14048e9dccd1d247744d114a4eb5e8e63',
      textRecords: {},
      contenthash: null
    });

    wrapperState.set(wrapperAddress, new Map([[namehashValue, { fuses: 7, expiry: 1_700_000_000n, owner: '0x0000000000000000000000000000000000000abc' }]]));

    const { getEnsClient } = await import('../src/ens/client.js');
    const client = getEnsClient({ forceReload: true, overrides: { nameWrapper: wrapperAddress } });
    const metadata = await client.getNameWrapperData(name);

    expect(metadata).not.toBeNull();
    expect(metadata?.fuses).toBe(7);
    expect(metadata?.expiry).toBe(1_700_000_000n);
    expect(metadata?.owner).toBe('0x0000000000000000000000000000000000000abc');
  });

  it('returns null when NameWrapper data missing', async () => {
    const name = 'alpha.agent.agi.eth';
    resolverState.set(name, {
      address: '0x231b0ee14048e9dccd1d247744d114a4eb5e8e63',
      textRecords: {},
      contenthash: null
    });

    const { getEnsClient } = await import('../src/ens/client.js');
    const client = getEnsClient({ forceReload: true, overrides: { nameWrapper: '0xd4416b13d2b3a9abae7acd5d6c2bbdbe25686401' } });

    expect(await client.getNameWrapperData(name)).toBeNull();
  });
});
