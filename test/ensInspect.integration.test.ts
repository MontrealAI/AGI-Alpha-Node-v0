import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadEnsConfigMock, getEnsClientMock } = vi.hoisted(() => ({
  loadEnsConfigMock: vi.fn(),
  getEnsClientMock: vi.fn()
}));

vi.mock('../src/ens/config.js', () => ({
  loadEnsConfig: loadEnsConfigMock
}));

class MockEnsResolutionError extends Error {}

vi.mock('../src/ens/client.js', () => ({
  EnsResolutionError: MockEnsResolutionError,
  getEnsClient: getEnsClientMock
}));

describe('ens:inspect integration contract', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  it('collects resolver, text records, and NameWrapper data', async () => {
    const expiry = 1_700_000_000n;
    loadEnsConfigMock.mockReturnValue({
      chainId: 1,
      rpcUrl: 'https://rpc.example',
      ensRegistry: '0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e',
      nameWrapper: '0xd4416b13d2b3a9abae7acd5d6c2bbdbe25686401',
      publicResolver: '0x231b0ee14048e9dccd1d247744d114a4eb5e8e63'
    });

    const textRecords = new Map([
      ['node.role', 'orchestrator'],
      ['node.version', '1.2.3'],
      ['node.dnsaddr', null]
    ]);

    const client = {
      getResolver: vi.fn().mockResolvedValue('0x000000000000000000000000000000000000dead'),
      getPubkey: vi.fn().mockResolvedValue({ x: '0x01', y: '0x02' }),
      getContenthash: vi.fn().mockResolvedValue('ipfs://alpha'),
      getTextRecord: vi.fn(async (_name: string, key: string) => textRecords.get(key) ?? null),
      getNameWrapperData: vi.fn().mockResolvedValue({
        owner: '0x000000000000000000000000000000000000cafe',
        fuses: 7,
        expiry
      })
    };

    getEnsClientMock.mockReturnValue(client);

    const { inspectEnsName } = await import('../scripts/ens-inspect.ts');

    const result = await inspectEnsName('alpha.agent.agi.eth', {});

    expect(loadEnsConfigMock).toHaveBeenCalledWith({ overrides: {} });
    expect(getEnsClientMock).toHaveBeenCalledWith({ overrides: {} });
    expect(client.getResolver).toHaveBeenCalledWith('alpha.agent.agi.eth');
    expect(client.getTextRecord).toHaveBeenCalledTimes(3);
    expect(result.resolver).toBe('0x000000000000000000000000000000000000dead');
    expect(result.pubkey).toEqual({ x: '0x01', y: '0x02' });
    expect(result.contenthash).toBe('ipfs://alpha');
    expect(result.textRecords).toEqual({
      'node.role': 'orchestrator',
      'node.version': '1.2.3',
      'node.dnsaddr': null
    });
    expect(result.nameWrapper).not.toBeNull();
    expect(result.nameWrapper?.owner).toBe('0x000000000000000000000000000000000000cafe');
    expect(result.nameWrapper?.fuses).toBe(7);
    expect(result.nameWrapper?.expiry).toBe(expiry);
    expect(result.nameWrapper?.expiryISO).toBe(new Date(Number(expiry) * 1000).toISOString());
  });

  it('wraps network failures with rpc metadata', async () => {
    loadEnsConfigMock.mockReturnValue({
      chainId: 1,
      rpcUrl: 'https://rpc.outage',
      ensRegistry: '0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e',
      nameWrapper: null,
      publicResolver: null
    });

    const networkError = Object.assign(new Error('connect ECONNRESET'), { code: 'ECONNRESET' });

    getEnsClientMock.mockReturnValue({
      getResolver: vi.fn().mockRejectedValue(networkError),
      getPubkey: vi.fn(),
      getContenthash: vi.fn(),
      getTextRecord: vi.fn(),
      getNameWrapperData: vi.fn()
    });

    const { EnsNetworkError, inspectEnsName } = await import('../scripts/ens-inspect.ts');

    const error = await inspectEnsName('alpha.agent.agi.eth', {}).catch((err) => err as Error);
    expect(error).toBeInstanceOf(EnsNetworkError);
    expect(error).toMatchObject({
      rpcUrl: 'https://rpc.outage',
      code: 'ECONNRESET'
    });

    expect(loadEnsConfigMock).toHaveBeenCalledWith({ overrides: {} });
    expect(getEnsClientMock).toHaveBeenCalledWith({ overrides: {} });
  });

  it('pipes explicit overrides through to config loaders', async () => {
    loadEnsConfigMock.mockReturnValue({
      chainId: 11155111,
      rpcUrl: 'https://sepolia.rpc',
      ensRegistry: '0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e',
      nameWrapper: null,
      publicResolver: '0xe99638b40e4fff0129d56f03b55b6bbc4bbe49b5'
    });

    getEnsClientMock.mockReturnValue({
      getResolver: vi.fn().mockResolvedValue('0x000000000000000000000000000000000000beef'),
      getPubkey: vi.fn().mockResolvedValue(null),
      getContenthash: vi.fn().mockResolvedValue(null),
      getTextRecord: vi.fn().mockResolvedValue(null),
      getNameWrapperData: vi.fn().mockResolvedValue(null)
    });

    const { inspectEnsName } = await import('../scripts/ens-inspect.ts');

    const overrides = {
      chainId: '0xAA36A7',
      rpcUrl: 'https://alt-rpc',
      ensRegistry: '0x1111111111111111111111111111111111111111',
      nameWrapper: '',
      publicResolver: '0x2222222222222222222222222222222222222222'
    } as const;

    await inspectEnsName('alpha.agent.agi.eth', overrides);

    expect(loadEnsConfigMock).toHaveBeenCalledWith({
      overrides: {
        chainId: overrides.chainId,
        rpcUrl: overrides.rpcUrl,
        ensRegistry: overrides.ensRegistry,
        nameWrapper: overrides.nameWrapper,
        publicResolver: overrides.publicResolver
      }
    });

    expect(getEnsClientMock).toHaveBeenCalledWith({
      overrides: {
        chainId: overrides.chainId,
        rpcUrl: overrides.rpcUrl,
        ensRegistry: overrides.ensRegistry,
        nameWrapper: overrides.nameWrapper,
        publicResolver: overrides.publicResolver
      }
    });
  });
});
