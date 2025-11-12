import { describe, it, expect } from 'vitest';
import { verifyBranchGate, resolveBranchName, extractEnsFromBranch } from '../scripts/verify-branch-gate.mjs';
import { verifyHealthGate } from '../scripts/verify-health-gate.mjs';

describe('branch gate script utilities', () => {
  it('resolves branch names from CI variables', () => {
    const env = { GITHUB_HEAD_REF: 'refs/heads/deploy/sample_alpha-node', BRANCH_NAME: 'ignored' };
    expect(resolveBranchName(env)).toBe('deploy/sample_alpha-node');
  });

  it('extracts ENS candidates from merge-critical branches', () => {
    expect(extractEnsFromBranch('deploy/1_alpha__node/patch')).toBe('1.alpha.node');
  });

  it('authorizes allowlisted ENS handles', () => {
    const env = {
      GITHUB_HEAD_REF: 'deploy/1.alpha.node.agi.eth/release-plan',
      HEALTH_GATE_ALLOWLIST: '*.alpha.node.agi.eth,*.agent.agi.eth'
    };
    const result = verifyBranchGate({ env, logger: { log: () => {}, error: () => {} } });
    expect(result.authorized).toBe(true);
    expect(result.ens).toBe('1.alpha.node.agi.eth');
  });

  it('throws when ENS handle is not allowlisted', () => {
    const env = {
      GITHUB_HEAD_REF: 'release/rogue.alpha.node.agi.eth/fix',
      HEALTH_GATE_ALLOWLIST: '*.trusted.alpha.node.agi.eth'
    };
    expect(() => verifyBranchGate({ env, logger: { log: () => {}, error: () => {} } })).toThrow(
      /not allowlisted/i
    );
  });
});

describe('health gate verification script', () => {
  it('validates required ENS patterns are present', () => {
    const env = {
      HEALTH_GATE_ALLOWLIST: [
        '*.agent.agi.eth',
        '*.alpha.agent.agi.eth',
        '*.node.agi.eth',
        '*.alpha.node.agi.eth',
        '*.alpha.club.agi.eth',
        '*.club.agi.eth'
      ]
    };
    const result = verifyHealthGate({ env, logger: { log: () => {}, error: () => {} } });
    expect(result.allowlist).toHaveLength(6);
  });

  it('throws when configured ENS is outside the allowlist', () => {
    const env = {
      NODE_LABEL: 'rogue',
      ENS_PARENT_DOMAIN: 'sovereign.agi.eth',
      HEALTH_GATE_ALLOWLIST: [
        '*.agent.agi.eth',
        '*.alpha.agent.agi.eth',
        '*.node.agi.eth',
        '*.alpha.node.agi.eth',
        '*.alpha.club.agi.eth',
        '*.club.agi.eth'
      ]
    };
    expect(() => verifyHealthGate({ env, logger: { log: () => {}, error: () => {} } })).toThrow(
      /not permitted/i
    );
  });
});
