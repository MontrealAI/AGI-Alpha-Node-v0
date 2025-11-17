import { describe, expect, it } from 'vitest';
import { buildLibp2pHostConfig, createTransportTracer } from '../../src/network/libp2pHostConfig.js';
import { buildTransportConfig } from '../../src/network/transportConfig.js';

const PUBLIC_ADDRS = ['/ip4/1.1.1.1/udp/4001/quic', '/ip4/1.1.1.1/tcp/4001'];
const RELAY_ADDRS = ['/dns4/relay.example.com/tcp/443/wss/p2p-circuit'];
const LAN_ADDRS = ['/ip4/192.168.1.5/tcp/4001'];

describe('libp2pHostConfig', () => {
  it('builds a QUIC-first host descriptor with ranked announce addresses', () => {
    const hostConfig = buildLibp2pHostConfig({
      config: {},
      publicMultiaddrs: PUBLIC_ADDRS,
      relayMultiaddrs: RELAY_ADDRS
    });

    expect(hostConfig.transports.register).toEqual(['tcp', 'quic']);
    expect(hostConfig.transports.preference).toBe('prefer-quic');
    expect(hostConfig.dialer.preference).toBe('QUIC-first with TCP fallback');
    expect(hostConfig.addresses.announce[0]).toContain('/quic');
    expect(hostConfig.nat.holePunching).toBe(true);
    expect(hostConfig.nat.autonat.enabled).toBe(true);
  });

  it('builds a TCP-only host descriptor when QUIC is disabled', () => {
    const hostConfig = buildLibp2pHostConfig({
      config: { TRANSPORT_ENABLE_QUIC: false, TRANSPORT_ENABLE_TCP: true },
      publicMultiaddrs: PUBLIC_ADDRS
    });

    expect(hostConfig.transports.register).toEqual(['tcp']);
    expect(hostConfig.transports.preference).toBe('tcp-only');
    expect(hostConfig.dialer.preference).toBe('TCP-only');
  });

  it('announces relay and LAN addresses when reachability is private', () => {
    const hostConfig = buildLibp2pHostConfig({
      config: { AUTONAT_ENABLED: true },
      relayMultiaddrs: RELAY_ADDRS,
      lanMultiaddrs: LAN_ADDRS,
      reachabilityHint: 'private'
    });

    expect(hostConfig.addresses.announce).toEqual(expect.arrayContaining([...RELAY_ADDRS, ...LAN_ADDRS]));
    expect(hostConfig.addresses.announce).not.toEqual(expect.arrayContaining(PUBLIC_ADDRS));
  });

  it('propagates relay quotas for server mode', () => {
    const hostConfig = buildLibp2pHostConfig({
      config: {
        RELAY_ENABLE_CLIENT: true,
        RELAY_ENABLE_SERVER: true,
        RELAY_MAX_RESERVATIONS: 4,
        RELAY_MAX_CIRCUITS_PER_PEER: 2,
        RELAY_MAX_BANDWIDTH_BPS: 1024
      }
    });

    expect(hostConfig.relay.server).toBe(true);
    expect(hostConfig.relay.maxReservations).toBe(4);
    expect(hostConfig.relay.maxCircuitsPerPeer).toBe(2);
    expect(hostConfig.relay.maxBandwidthBps).toBe(1024);
  });

  it('disables hole punching and AutoNAT when requested', () => {
    const hostConfig = buildLibp2pHostConfig({
      config: {
        ENABLE_HOLE_PUNCHING: false,
        AUTONAT_ENABLED: false,
        AUTONAT_THROTTLE_SECONDS: 15
      },
      publicMultiaddrs: PUBLIC_ADDRS
    });

    expect(hostConfig.nat.holePunching).toBe(false);
    expect(hostConfig.nat.autonat.enabled).toBe(false);
    expect(hostConfig.nat.autonat.throttleSeconds).toBe(15);
  });

  it('surfaces transport traces for QUIC/TCP/relay selection', () => {
    const plan = buildTransportConfig({});
    const events = [];
    const tracer = createTransportTracer({
      plan,
      logger: {
        info: (payload, message) => events.push({ payload, message })
      }
    });

    const transport = tracer({
      peerId: '12D3KooXpeer',
      address: '/ip4/1.1.1.1/udp/4001/quic',
      direction: 'inbound',
      success: true
    });

    expect(transport).toBe('quic');
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({
      peerId: '12D3KooXpeer',
      address: '/ip4/1.1.1.1/udp/4001/quic',
      transport: 'quic',
      direction: 'inbound',
      preference: plan.transports.preference,
      success: true
    });
    expect(events[0].message).toBe('libp2p transport selection observed');
  });
});
