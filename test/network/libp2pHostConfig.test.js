import { describe, expect, it, vi } from 'vitest';
import { buildLibp2pHostConfig, createTransportTracer } from '../../src/network/libp2pHostConfig.js';
import { buildTransportConfig, rankDialableMultiaddrs } from '../../src/network/transportConfig.js';

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
      direction: 'in',
      success: true
    });

    expect(transport).toBe('quic');
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({
      peerId: '12D3KooXpeer',
      address: '/ip4/1.1.1.1/udp/4001/quic',
      transport: 'quic',
      direction: 'in',
      preference: plan.transports.preference,
      success: true
    });
    expect(events[0].message).toBe('conn_success');
  });

  it('ranks dialable multiaddrs with QUIC first, then TCP, relay, and other transports', () => {
    const plan = buildTransportConfig({});
    const ranked = rankDialableMultiaddrs(
      [
        '/ip4/10.0.0.5/tcp/4001',
        '/ip4/1.1.1.1/udp/4001/quic',
        '/dns4/relay.example.com/tcp/443/wss/p2p-circuit',
        '/ip4/10.0.0.5/tcp/4001',
        '/unix/tmp/socket'
      ],
      plan
    );

    expect(ranked).toEqual([
      '/ip4/1.1.1.1/udp/4001/quic',
      '/ip4/10.0.0.5/tcp/4001',
      '/dns4/relay.example.com/tcp/443/wss/p2p-circuit',
      '/unix/tmp/socket'
    ]);
  });

  it('binds transport tracer to libp2p-style dial and connection events', () => {
    const plan = buildTransportConfig({});
    const metrics = {
      dialAttempts: { inc: vi.fn() },
      dialSuccesses: { inc: vi.fn() },
      dialFailures: { inc: vi.fn() },
      inboundConnections: { inc: vi.fn() },
      connectionsOpen: { inc: vi.fn() },
      connectionsClose: { inc: vi.fn() },
      connectionsLive: { set: vi.fn() },
      liveConnections: { in: 0, out: 0 },
      connectionLatency: { observe: vi.fn() }
    };
    const events = [];
    const tracer = createTransportTracer({
      plan,
      metrics,
      logger: {
        info: (payload, message) => events.push({ payload, message })
      }
    });

    const fakeLibp2p = createMockLibp2p();
    const unbind = tracer.bindTo(fakeLibp2p);

    fakeLibp2p.dispatchEvent('dial:start', {
      peerId: 'peer1',
      multiaddr: '/ip4/1.1.1.1/udp/4001/quic'
    });
    fakeLibp2p.dispatchEvent('dial:success', {
      peerId: 'peer1',
      multiaddr: '/ip4/1.1.1.1/udp/4001/quic'
    });
    fakeLibp2p.dispatchEvent('dial:failure', {
      peerId: 'peer2',
      multiaddr: '/ip4/1.1.1.2/tcp/4001'
    });
    fakeLibp2p.dispatchEvent('connection:open', {
      peerId: 'peer3',
      multiaddr: '/dns4/relay.example.com/tcp/443/wss/p2p-circuit'
    });
    fakeLibp2p.dispatchEvent('connection:close', {
      peerId: 'peer3',
      multiaddr: '/dns4/relay.example.com/tcp/443/wss/p2p-circuit',
      reason: 'timeout',
      direction: 'in'
    });

    unbind();

    expect(metrics.dialAttempts.inc).toHaveBeenCalledTimes(2);
    expect(metrics.dialSuccesses.inc).toHaveBeenCalledWith({ transport: 'quic' });
    expect(metrics.dialFailures.inc).toHaveBeenCalledWith({ transport: 'tcp' });
    expect(metrics.inboundConnections.inc).toHaveBeenCalledWith({ transport: 'relay' });
    expect(metrics.connectionsOpen.inc).toHaveBeenCalledTimes(2);
    expect(metrics.connectionsClose.inc).toHaveBeenCalledWith({ direction: 'in', reason: 'timeout' });
    expect(metrics.connectionsLive.set).toHaveBeenCalled();
    expect(events.map((event) => event.message)).toEqual([
      'conn_open',
      'conn_success',
      'conn_failure',
      'conn_success',
      'conn_close'
    ]);
  });
});

function createMockLibp2p() {
  const listeners = new Map();

  return {
    addEventListener(event, handler) {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event).push(handler);
    },
    removeEventListener(event, handler) {
      const handlers = listeners.get(event) ?? [];
      listeners.set(
        event,
        handlers.filter((candidate) => candidate !== handler)
      );
    },
    dispatchEvent(event, detail = {}) {
      const handlers = listeners.get(event) ?? [];
      handlers.forEach((handler) => handler({ detail }));
    }
  };
}
