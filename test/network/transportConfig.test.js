import { describe, expect, it } from 'vitest';
import {
  buildTransportConfig,
  describeDialPreference,
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
});
