import fs from 'node:fs';
import path from 'node:path';
import { getAddress } from 'ethers';
import { z } from 'zod';
import { normalizeDomain } from './ensConstants.js';

const addressSchema = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value.length === 0 || /^0x[a-fA-F0-9]{40}$/.test(value), {
    message: 'Address must be a 42-character hex string'
  })
  .transform((value) => (value.length === 0 ? null : getAddress(value)));

const bigintLike = z
  .union([z.string(), z.number(), z.bigint()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value === 'bigint') {
      return value;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new Error('Numeric values must be finite');
      }
      return BigInt(Math.trunc(value));
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (/^0x[a-fA-F0-9]+$/.test(trimmed)) {
      return BigInt(trimmed);
    }
    if (!/^[-+]?\d+(?:\.\d+)?$/.test(trimmed)) {
      throw new Error(`Unable to coerce "${value}" into bigint`);
    }
    if (trimmed.includes('.')) {
      throw new Error('Fractional numeric values are not supported for bigint coercion');
    }
    return BigInt(trimmed);
  });

const offlineSnapshotSchema = z
  .object({
    label: z.string().optional(),
    parentDomain: z.string().optional(),
    ens: z
      .object({
        nodeName: z.string().optional(),
        resolvedAddress: addressSchema.optional(),
        registryOwner: addressSchema.optional(),
        wrapperOwner: addressSchema.optional()
      })
      .optional(),
    staking: z
      .object({
        minimumStake: bigintLike,
        operatorStake: bigintLike,
        slashingPenalty: bigintLike,
        lastHeartbeat: bigintLike,
        active: z.boolean().optional(),
        healthy: z.boolean().optional()
      })
      .optional(),
    rewards: z
      .object({
        projectedPool: z.union([z.string(), z.number(), z.bigint()]).optional(),
        operatorShareBps: z.number().int().min(0).max(10_000).optional(),
        decimals: z.number().int().positive().optional()
      })
      .optional()
  })
  .strict();

export function loadOfflineSnapshot(snapshotPath) {
  if (!snapshotPath) {
    throw new Error('snapshotPath is required');
  }
  const resolvedPath = path.resolve(snapshotPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Offline snapshot not found at ${resolvedPath}`);
  }
  const raw = fs.readFileSync(resolvedPath, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    const snapshot = offlineSnapshotSchema.parse(parsed);
    return {
      ...snapshot,
      source: resolvedPath
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse offline snapshot JSON at ${resolvedPath}: ${error.message}`);
    }
    throw error;
  }
}

export function buildOfflineNodeName({ snapshot, label, parentDomain }) {
  const resolvedParent = normalizeDomain(snapshot?.parentDomain ?? parentDomain ?? 'alpha.node.agi.eth');
  const resolvedLabel = (snapshot?.label ?? label ?? '').toString().trim();
  if (!resolvedLabel) {
    throw new Error('Offline snapshot requires a label to determine the node name');
  }
  return `${resolvedLabel.toLowerCase()}.${resolvedParent}`;
}

export function buildOfflineVerification({ snapshot, label, parentDomain, expectedAddress }) {
  if (!snapshot) {
    throw new Error('snapshot is required to build offline verification');
  }
  const nodeName = snapshot.ens?.nodeName ?? buildOfflineNodeName({ snapshot, label, parentDomain });
  const expected = expectedAddress ? getAddress(expectedAddress) : null;
  const resolved = snapshot.ens?.resolvedAddress ?? null;
  const registry = snapshot.ens?.registryOwner ?? null;
  const wrapper = snapshot.ens?.wrapperOwner ?? null;

  const matches = {
    resolved: expected ? resolved === expected : Boolean(resolved),
    registry: expected ? registry === expected : Boolean(registry),
    wrapper: expected ? wrapper === expected : Boolean(wrapper)
  };

  const success = expected ? Object.values(matches).some(Boolean) : Boolean(resolved || registry || wrapper);

  return {
    nodeName,
    expectedAddress: expected,
    resolvedAddress: resolved,
    registryOwner: registry,
    wrapperOwner: wrapper,
    matches,
    success,
    parentDomain: normalizeDomain(parentDomain ?? snapshot.parentDomain ?? 'alpha.node.agi.eth'),
    offline: true
  };
}

export function buildOfflineStakeStatus(snapshot) {
  if (!snapshot?.staking) {
    return null;
  }
  const { staking } = snapshot;
  return {
    operator: null,
    minimumStake: staking.minimumStake ?? null,
    operatorStake: staking.operatorStake ?? null,
    active: staking.active ?? null,
    lastHeartbeat: staking.lastHeartbeat ?? null,
    healthy: staking.healthy ?? null,
    slashingPenalty: staking.slashingPenalty ?? null
  };
}

export function buildOfflineRewardsProjection(snapshot) {
  if (!snapshot?.rewards?.projectedPool) {
    return null;
  }
  return {
    projectedPool: snapshot.rewards.projectedPool,
    operatorShareBps: snapshot.rewards.operatorShareBps,
    decimals: snapshot.rewards.decimals
  };
}
