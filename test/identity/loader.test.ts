import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockClient = {
  getResolver: vi.fn(),
  getPubkey: vi.fn(),
  getTextRecord: vi.fn(),
  getNameWrapperData: vi.fn()
};

const getEnsClientMock = vi.fn(() => mockClient);

class MockEnsResolutionError extends Error {}

vi.mock('../../src/ens/client.js', () => ({
  getEnsClient: getEnsClientMock,
  EnsResolutionError: MockEnsResolutionError
}));

describe('loadNodeIdentity', () => {
  beforeEach(() => {
    mockClient.getResolver.mockReset();
    mockClient.getPubkey.mockReset();
    mockClient.getTextRecord.mockReset();
    mockClient.getNameWrapperData.mockReset();
    getEnsClientMock.mockClear();
  });

  it('returns a populated node identity with multiaddrs', async () => {
    const metadataRecords = new Map<string, string>([
      ['node.peerId', '12D3KooWPQ'],
      ['node.role', 'validator'],
      ['node.version', '1.0.0'],
      ['node.dnsaddr', 'dnsaddr=/dns4/example.com/tcp/443/wss/p2p/12D3']
    ]);

    mockClient.getResolver.mockImplementation(async (name: string) => {
      if (name.startsWith('_dnsaddr.')) {
        return '0xdnsresolver';
      }
      return '0xresolver';
    });
    mockClient.getPubkey.mockResolvedValue({
      x: '0x' + '1'.repeat(64),
      y: '0x' + '2'.repeat(64)
    });
    mockClient.getTextRecord.mockImplementation(async (name: string, key: string) => {
      if (name.startsWith('_dnsaddr.')) {
        if (key === 'dnsaddr') {
          return 'dnsaddr=/ip4/192.0.2.1/tcp/30303/p2p/12D3\n dnsaddr=/ip6/2001:db8::1/tcp/30303/p2p/12D4';
        }
        return null;
      }
      return metadataRecords.get(key) ?? null;
    });
    mockClient.getNameWrapperData.mockResolvedValue({ fuses: 7, expiry: BigInt(1_700_000_000) });

    const { loadNodeIdentity } = await import('../../src/identity/loader.js');

    const identity = await loadNodeIdentity('Node.Example.eth');
    expect(identity.ensName).toBe('node.example.eth');
    expect(identity.peerId).toBe('12D3KooWPQ');
    expect(identity.metadata['node.role']).toBe('validator');
    expect(identity.multiaddrs).toEqual([
      '/dns4/example.com/tcp/443/wss/p2p/12D3',
      '/ip4/192.0.2.1/tcp/30303/p2p/12D3',
      '/ip6/2001:db8::1/tcp/30303/p2p/12D4'
    ]);
    expect(identity.fuses).toBe(7);
    expect(identity.expiry).toBe(1_700_000_000);
  });

  it('throws when the ENS pubkey record is missing', async () => {
    mockClient.getResolver.mockResolvedValue('0xresolver');
    mockClient.getPubkey.mockResolvedValue(null);

    const { loadNodeIdentity, NodeIdentityError } = await import('../../src/identity/loader.js');

    await expect(loadNodeIdentity('missing.example.eth')).rejects.toBeInstanceOf(NodeIdentityError);
  });

  it('throws when peerId metadata is absent', async () => {
    mockClient.getResolver.mockResolvedValue('0xresolver');
    mockClient.getPubkey.mockResolvedValue({
      x: '0x' + '1'.repeat(64),
      y: '0x' + '2'.repeat(64)
    });
    mockClient.getTextRecord.mockResolvedValue(null);

    const { loadNodeIdentity, NodeIdentityError } = await import('../../src/identity/loader.js');

    await expect(loadNodeIdentity('peerless.example.eth')).rejects.toThrow(/node\.peerId/);
  });
});
