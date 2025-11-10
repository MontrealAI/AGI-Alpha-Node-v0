import { describe, expect, it } from 'vitest';
import {
  ALPHA_NODE_ROOT_NODE,
  NODE_ROOT_NODE,
  assertNodeParentDomain,
  getAllowedNodeDomains,
  normalizeDomain
} from '../src/services/ensConstants.js';

const NODE_ROOT_EXPECTED = '0xa26287e1184492446ad67d7dcdb51be050d4144ddda21bb3ba5926a8bf5c5731';
const ALPHA_NODE_ROOT_EXPECTED = '0x2d936bd2c82bc0aaa072a9d3c6d87aad1c1ec6a245f991129efb6ecc9fed57c4';

describe('ENS constants', () => {
  it('normalizes domains consistently', () => {
    expect(normalizeDomain(' Alpha.Node.AGI.ETH ')).toBe('alpha.node.agi.eth');
    expect(normalizeDomain('node.agi.eth.')).toBe('node.agi.eth');
  });

  it('exposes immutable allowed domains list', () => {
    const allowed = getAllowedNodeDomains();
    expect(allowed).toContain('alpha.node.agi.eth');
    expect(allowed).toContain('node.agi.eth');
    allowed.push('mutation.test');
    expect(getAllowedNodeDomains()).not.toContain('mutation.test');
  });

  it('validates allowed parent domains', () => {
    expect(assertNodeParentDomain('alpha.node.agi.eth')).toBe('alpha.node.agi.eth');
    expect(assertNodeParentDomain('node.agi.eth')).toBe('node.agi.eth');
    expect(() => assertNodeParentDomain('beta.node.agi.eth')).toThrow(/AGI Alpha Node subdomain/);
  });

  it('provides canonical namehashes', () => {
    expect(NODE_ROOT_NODE).toBe(NODE_ROOT_EXPECTED);
    expect(ALPHA_NODE_ROOT_NODE).toBe(ALPHA_NODE_ROOT_EXPECTED);
  });
});
