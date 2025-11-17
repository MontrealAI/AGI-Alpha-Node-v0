import { describe, expect, it } from 'vitest';
import { buildTransportConfig, describeDialPreference } from '../src/network/transportConfig.js';

describe('transport config', () => {
  it('builds QUIC-first defaults with quotas', () => {
    const plan = buildTransportConfig({});

    expect(plan.transports).toEqual({
      quic: true,
      tcp: true,
      preference: 'prefer-quic'
    });
    expect(plan.holePunching).toBe(true);
    expect(plan.autonat.enabled).toBe(true);
    expect(plan.autonat.throttleSeconds).toBe(60);
    expect(plan.relay).toEqual({
      client: true,
      server: false,
      maxReservations: 32,
      maxCircuitsPerPeer: 8,
      maxBandwidthBps: undefined
    });
    expect(describeDialPreference(plan)).toBe('QUIC-first with TCP fallback');
  });

  it('rejects when all transports are disabled', () => {
    expect(() =>
      buildTransportConfig({
        TRANSPORT_ENABLE_QUIC: false,
        TRANSPORT_ENABLE_TCP: false
      })
    ).toThrow(/At least one transport/);
  });

  it('honors overrides and normalizes numeric caps', () => {
    const plan = buildTransportConfig({
      TRANSPORT_ENABLE_QUIC: 'false',
      TRANSPORT_ENABLE_TCP: 'true',
      ENABLE_HOLE_PUNCHING: 'false',
      AUTONAT_ENABLED: 'false',
      AUTONAT_THROTTLE_SECONDS: '5',
      RELAY_ENABLE_CLIENT: 'false',
      RELAY_ENABLE_SERVER: 'true',
      RELAY_MAX_RESERVATIONS: '100',
      RELAY_MAX_CIRCUITS_PER_PEER: '16',
      RELAY_MAX_BANDWIDTH_BPS: '2048'
    });

    expect(plan.transports.preference).toBe('tcp-only');
    expect(plan.holePunching).toBe(false);
    expect(plan.autonat).toEqual({ enabled: false, throttleSeconds: 5 });
    expect(plan.relay).toEqual({
      client: false,
      server: true,
      maxReservations: 100,
      maxCircuitsPerPeer: 16,
      maxBandwidthBps: 2048
    });
    expect(describeDialPreference(plan)).toBe('TCP-only');
  });
});
