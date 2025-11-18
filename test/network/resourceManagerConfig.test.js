import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ResourceManager,
  ConnectionManager,
  buildAbuseHarness,
  buildResourceManagerConfig
} from '../../src/network/resourceManagerConfig.js';

describe('resourceManagerConfig', () => {
  it('applies scale factors and merges overrides', () => {
    const limitsFile = path.join(os.tmpdir(), 'limits.json');
    fs.writeFileSync(
      limitsFile,
      JSON.stringify({
        global: { maxConnections: 10 },
        perProtocol: { gossipsub: { maxConnections: 2 } }
      })
    );

    const config = buildResourceManagerConfig({
      config: {
        NRM_SCALE_FACTOR: 0.5,
        NRM_LIMITS_PATH: limitsFile,
        MAX_CONNS_PER_IP: 2,
        CONN_LOW_WATER: 4,
        CONN_HIGH_WATER: 8
      }
    });

    expect(config.global.maxConnections).toBe(10);
    expect(config.global.maxStreams).toBe(4_096); // scaled from 8192
    expect(config.perProtocol.gossipsub.maxConnections).toBe(2);
    expect(config.ipLimiter.maxConnsPerIp).toBe(2);
    expect(config.ipLimiter.maxConnsPerAsn).toBe(256);
    expect(config.connectionManager.lowWater).toBe(4);
    expect(config.connectionManager.highWater).toBe(8);
  });

  it('rejects invalid watermarks', () => {
    expect(() =>
      buildResourceManagerConfig({
        config: { CONN_LOW_WATER: 10, CONN_HIGH_WATER: 5 }
      })
    ).toThrow('high_water');
  });
});

describe('ResourceManager guards', () => {
  it('enforces global and per-IP connection limits', () => {
    const config = buildResourceManagerConfig({
      config: {
        NRM_SCALE_FACTOR: 1,
        MAX_CONNS_PER_IP: 2
      }
    });
    const manager = new ResourceManager({ limits: config });

    const granted = [
      manager.requestConnection({ peerId: 'a', ip: '1.1.1.1', protocol: 'gossipsub' }),
      manager.requestConnection({ peerId: 'b', ip: '1.1.1.1', protocol: 'gossipsub' })
    ];
    const denied = manager.requestConnection({ peerId: 'c', ip: '1.1.1.1', protocol: 'gossipsub' });

    expect(granted.every((r) => r.accepted)).toBe(true);
    expect(denied.accepted).toBe(false);
    expect(denied.reason).toBe('per-ip-cap');
  });

  it('enforces per-ASN ceilings and records pressure', () => {
    const config = buildResourceManagerConfig({
      config: {
        NRM_SCALE_FACTOR: 0.01,
        MAX_CONNS_PER_ASN: 1,
        NRM_BANNED_PEERS: ['peer-bad']
      }
    });
    const manager = new ResourceManager({ limits: config });

    const first = manager.requestConnection({ peerId: 'a', ip: '2.2.2.2', protocol: 'gossipsub', asn: 'asn-1' });
    const blocked = manager.requestConnection({ peerId: 'b', ip: '3.3.3.3', protocol: 'gossipsub', asn: 'asn-1' });
    const bannedPeer = manager.requestStream({ peerId: 'peer-bad', protocol: 'gossipsub' });

    expect(first.accepted).toBe(true);
    expect(blocked.accepted).toBe(false);
    expect(blocked.reason).toBe('per-asn-cap');
    expect(bannedPeer.reason).toBe('banned');

    const metrics = manager.metrics();
    expect(metrics.pressure.asn.limit).toBe(1);
    expect(metrics.pressure.connections.limit).toBeDefined();
  });

  it('tracks bans and stream limits', () => {
    const config = buildResourceManagerConfig({ config: { NRM_SCALE_FACTOR: 1 } });
    const manager = new ResourceManager({ limits: config });

    manager.banPeer('peer-bad');
    const denied = manager.requestStream({ peerId: 'peer-bad', protocol: 'gossipsub' });
    const allowed = manager.requestStream({ peerId: 'peer-good', protocol: 'gossipsub' });

    expect(denied.accepted).toBe(false);
    expect(denied.reason).toBe('banned');
    expect(allowed.accepted).toBe(true);
    expect(manager.metrics().denials.streams).toBe(1);
  });
});

describe('ConnectionManager trimming', () => {
  it('drops lowest scoring non-pinned peers first', () => {
    const manager = new ConnectionManager({ lowWater: 2, highWater: 3, gracePeriodSeconds: 60 });
    const now = Date.now();
    const peers = [
      { peerId: 'good', score: 5, connectedAt: now - 120_000 },
      { peerId: 'mid', score: 1, connectedAt: now - 300_000 },
      { peerId: 'pinned', score: -10, pinned: true, connectedAt: now - 10_000 },
      { peerId: 'bad', score: -20, connectedAt: now - 400_000 },
      { peerId: 'fresh', score: -50, connectedAt: now }
    ];

    const { kept, trimmed } = manager.trim(peers, now);
    expect(trimmed.map((p) => p.peerId)).toContain('bad');
    expect(kept.map((p) => p.peerId)).toContain('pinned');
    expect(trimmed.length).toBeGreaterThanOrEqual(3);
    expect(kept.map((peer) => peer.peerId)).toEqual(expect.arrayContaining(['pinned', 'fresh']));
  });
});

describe('Abuse harness', () => {
  it('simulates connection floods and surfaces denials', () => {
    const config = buildResourceManagerConfig({ config: { NRM_SCALE_FACTOR: 0.01, MAX_CONNS_PER_IP: 50 } });
    const manager = new ResourceManager({ limits: config });
    const harness = buildAbuseHarness({ resourceManager: manager });

    const result = harness.connectionFlood({ total: 20, ip: '9.9.9.9', asn: 'asn-test' });
    expect(result.denied).toBeGreaterThan(0);
    expect(Object.keys(result.reasons)).toContain('global-connection-cap');
  });

  it('tracks malformed gossip simulations', () => {
    const config = buildResourceManagerConfig({ config: {} });
    const manager = new ResourceManager({ limits: config });
    const harness = buildAbuseHarness({ resourceManager: manager });
    const result = harness.malformedGossip({ invalidMessages: 3, penaltyThreshold: -6 });

    expect(result.flagged).toBe(3);
    expect(result.threshold).toBe(-6);
  });

  it('exposes snapshots for dashboards', () => {
    const config = buildResourceManagerConfig({ config: {} });
    const manager = new ResourceManager({ limits: config });
    const harness = buildAbuseHarness({ resourceManager: manager });

    harness.connectionFlood({ total: 5, ip: '10.0.0.1', asn: 'asn-ui' });
    const snapshot = harness.snapshot();

    expect(snapshot.connections).toBeGreaterThan(0);
    expect(snapshot.pressure.ip.limit).toBeGreaterThan(0);
  });
});
