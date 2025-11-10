import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  loadOfflineSnapshot,
  buildOfflineVerification,
  buildOfflineStakeStatus,
  buildOfflineRewardsProjection
} from '../src/services/offlineSnapshot.js';

const tempDirs = new Set();

afterEach(() => {
  for (const dir of tempDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
    tempDirs.delete(dir);
  }
});

function writeSnapshot(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-alpha-node-'));
  const file = path.join(dir, 'snapshot.json');
  fs.writeFileSync(file, JSON.stringify(content, null, 2));
  tempDirs.add(dir);
  return file;
}

describe('offline snapshot utilities', () => {
  it('loads snapshot and derives offline verification + stake status', () => {
    const snapshotPath = writeSnapshot({
      label: 'offline',
      ens: {
        resolvedAddress: '0x0000000000000000000000000000000000000fff',
        registryOwner: '0x0000000000000000000000000000000000000fff'
      },
      staking: {
        minimumStake: '1200',
        operatorStake: '1500',
        slashingPenalty: '0x0',
        lastHeartbeat: '1700000000',
        active: true,
        healthy: true
      },
      rewards: {
        projectedPool: '2500',
        operatorShareBps: 1550,
        decimals: 18
      }
    });

    const snapshot = loadOfflineSnapshot(snapshotPath);
    expect(snapshot.label).toBe('offline');
    expect(snapshot.ens?.resolvedAddress).toBe('0x0000000000000000000000000000000000000FfF');
    expect(snapshot.staking?.minimumStake).toBe(1200n);
    expect(snapshot.staking?.operatorStake).toBe(1500n);

    const verification = buildOfflineVerification({
      snapshot,
      label: 'offline',
      parentDomain: 'alpha.node.agi.eth',
      expectedAddress: '0x0000000000000000000000000000000000000fff'
    });
    expect(verification.nodeName).toBe('offline.alpha.node.agi.eth');
    expect(verification.success).toBe(true);
    expect(verification.matches.resolved).toBe(true);

    const stakeStatus = buildOfflineStakeStatus(snapshot);
    expect(stakeStatus).toEqual({
      operator: null,
      minimumStake: 1200n,
      operatorStake: 1500n,
      active: true,
      lastHeartbeat: 1_700_000_000n,
      healthy: true,
      slashingPenalty: 0n
    });

    const rewardsProjection = buildOfflineRewardsProjection(snapshot);
    expect(rewardsProjection).toEqual({ projectedPool: '2500', operatorShareBps: 1550, decimals: 18 });
  });
});
