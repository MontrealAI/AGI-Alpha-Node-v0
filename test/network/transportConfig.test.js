import { describe, expect, it } from 'vitest';
import {
  buildTransportConfig,
  classifyTransport,
  describeDialPreference,
  createReachabilityState,
  rankDialableMultiaddrs,
  selectAnnounceableAddrs,
  summarizeReachabilityState
} from '../../src/network/transportConfig.js';

describe('transportConfig', () => {
  it('builds a quic-first plan by default', () => {
    const plan = buildTransportConfig({});

    expect(plan.transports.quic).toBe(true);
    expect(plan.transports.tcp).toBe(true);
    expect(plan.transports.preference).toBe('prefer-quic');
    expect(plan.autonat.enabled).toBe(true);
    expect(plan.autonat.throttleSeconds).toBe(60);
    expect(plan.relay.client).toBe(true);
    expect(plan.relay.server).toBe(false);
    expect(describeDialPreference(plan)).toBe('QUIC-first with TCP fallback');
  });

  it('rejects configurations that disable both transports', () => {
    expect(() =>
      buildTransportConfig({ TRANSPORT_ENABLE_QUIC: false, TRANSPORT_ENABLE_TCP: false })
    ).toThrow();
  });

  it('respects hole punching and AutoNAT toggles with sane throttling', () => {
    const plan = buildTransportConfig({
      ENABLE_HOLE_PUNCHING: false,
      AUTONAT_ENABLED: false,
      AUTONAT_THROTTLE_SECONDS: 'not-a-number'
    });

    expect(plan.holePunching).toBe(false);
    expect(plan.autonat.enabled).toBe(false);
    expect(plan.autonat.throttleSeconds).toBe(60);
  });

  it('ranks multiaddrs according to preference', () => {
    const plan = buildTransportConfig({});
    const ranked = rankDialableMultiaddrs(
      [
        '/ip4/127.0.0.1/tcp/4001',
        '/ip4/127.0.0.1/udp/4001/quic',
        '/ip4/10.0.0.2/tcp/4002'
      ],
      plan
    );

    expect(ranked[0]).toContain('/quic');
    const firstTcpIndex = ranked.findIndex((address) => address.includes('/tcp/'));
    expect(firstTcpIndex).toBeGreaterThan(0);
    expect(new Set(ranked)).toEqual(
      new Set([
        '/ip4/127.0.0.1/tcp/4001',
        '/ip4/127.0.0.1/udp/4001/quic',
        '/ip4/10.0.0.2/tcp/4002'
      ])
    );
  });

  it('drops disabled transports to the back of the dial queue deterministically', () => {
    const plan = buildTransportConfig({ TRANSPORT_ENABLE_QUIC: false });
    const ranked = rankDialableMultiaddrs(
      [
        '/ip4/1.1.1.1/udp/4001/quic',
        '/ip4/10.0.0.5/tcp/4001',
        '/dns/relay.example.com/tcp/443/wss/p2p-circuit',
        '/unix/tmp/socket'
      ],
      plan
    );

    expect(ranked).toEqual([
      '/ip4/10.0.0.5/tcp/4001',
      '/dns/relay.example.com/tcp/443/wss/p2p-circuit',
      '/unix/tmp/socket',
      '/ip4/1.1.1.1/udp/4001/quic'
    ]);
  });

  it('selects announceable addresses based on reachability', () => {
    const publicAddrs = ['/ip4/1.1.1.1/udp/4001/quic'];
    const relayAddrs = ['/dns4/relay.example.com/tcp/443/wss/p2p-circuit'];
    const lanAddrs = ['/ip4/192.168.1.5/tcp/4001'];

    const publicPlan = selectAnnounceableAddrs({
      reachability: 'public',
      publicMultiaddrs: publicAddrs,
      relayMultiaddrs: relayAddrs,
      lanMultiaddrs: lanAddrs
    });
    expect(publicPlan).toContain(publicAddrs[0]);
    expect(publicPlan).toContain(relayAddrs[0]);
    expect(publicPlan).not.toContain(lanAddrs[0]);

    const privatePlan = selectAnnounceableAddrs({
      reachability: 'private',
      publicMultiaddrs: publicAddrs,
      relayMultiaddrs: relayAddrs,
      lanMultiaddrs: lanAddrs
    });
    expect(privatePlan).toContain(relayAddrs[0]);
    expect(privatePlan).toContain(lanAddrs[0]);
    expect(privatePlan).not.toContain(publicAddrs[0]);

    const unknownPlan = selectAnnounceableAddrs({
      reachability: 'unknown',
      publicMultiaddrs: publicAddrs,
      relayMultiaddrs: relayAddrs,
      lanMultiaddrs: lanAddrs
    });
    expect(unknownPlan).toEqual(expect.arrayContaining([...publicAddrs, ...relayAddrs, ...lanAddrs]));
  });

  it('normalizes reachability labelling', () => {
    expect(summarizeReachabilityState('PUBLIC')).toBe('public');
    expect(summarizeReachabilityState('private')).toBe('private');
    expect(summarizeReachabilityState(undefined)).toBe('unknown');
  });

  it('maintains reachability state with override protection and subscriptions', () => {
    const tracker = createReachabilityState({ initial: 'private', override: 'public' });
    const snapshots = [];
    const unsubscribe = tracker.subscribe((snapshot) => snapshots.push(snapshot));

    tracker.updateFromAutonat('private');
    tracker.setOverride('unknown');
    tracker.updateFromAutonat('private');

    unsubscribe();

    expect(tracker.getState()).toBe('private');
    expect(tracker.isOverridden()).toBe(false);
    expect(snapshots[0].state).toBe('public');
    expect(snapshots.at(-1).state).toBe('private');
  });

  it('classifies transports for trace logging clarity', () => {
    expect(classifyTransport('/ip4/1.1.1.1/udp/4001/quic')).toBe('quic');
    expect(classifyTransport('/ip4/1.1.1.1/tcp/4001')).toBe('tcp');
    expect(classifyTransport('/dns4/relay.example.com/tcp/443/wss/p2p-circuit')).toBe('relay');
    expect(classifyTransport('/ip4/1.1.1.1/ws/4001')).toBe('tcp');
    expect(classifyTransport('/ip4/1.1.1.1/utp/4001')).toBe('unknown');
  });
});
