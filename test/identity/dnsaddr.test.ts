import { describe, expect, it } from 'vitest';
import { parseDnsaddr } from '../../src/identity/dnsaddr.js';

describe('parseDnsaddr', () => {
  it('extracts multiaddrs from dnsaddr-prefixed records', () => {
    const records = [
      'dnsaddr=/ip4/192.0.2.1/tcp/30303/p2p/12D3KooW123',
      '  "dnsaddr=/dns4/node.example.com/tcp/443/wss/p2p/12D3KooW456"  ',
      "dnsaddr=/ip6/2001:db8::1/tcp/30303/p2p/12D3KooW789"
    ];

    const result = parseDnsaddr(records);
    expect(result).toEqual([
      '/ip4/192.0.2.1/tcp/30303/p2p/12D3KooW123',
      '/dns4/node.example.com/tcp/443/wss/p2p/12D3KooW456',
      '/ip6/2001:db8::1/tcp/30303/p2p/12D3KooW789'
    ]);
  });

  it('ignores non dnsaddr entries and duplicates', () => {
    const records = [
      'foo=/ip4/127.0.0.1',
      'dnsaddr=/ip4/192.0.2.1/tcp/30303/p2p/12D3KooW123',
      'dnsaddr=/ip4/192.0.2.1/tcp/30303/p2p/12D3KooW123',
      "  'dnsaddr=/dns6/node.example.com/tcp/443/wss/p2p/12D3KooW999'"
    ];

    const result = parseDnsaddr(records);
    expect(result).toEqual([
      '/ip4/192.0.2.1/tcp/30303/p2p/12D3KooW123',
      '/dns6/node.example.com/tcp/443/wss/p2p/12D3KooW999'
    ]);
  });

  it('handles empty or malformed input gracefully', () => {
    const records = ['', '   ', 'dnsaddr=', 'dnsaddr=   '];
    expect(parseDnsaddr(records)).toEqual([]);
  });
});
