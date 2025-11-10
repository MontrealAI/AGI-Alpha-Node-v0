import { describe, it, expect } from 'vitest';
import { generateEnsSetupGuide, formatEnsGuide } from '../src/services/ensGuide.js';

describe('generateEnsSetupGuide', () => {
  it('builds a personalized ENS guide with canonical data', () => {
    const guide = generateEnsSetupGuide({
      label: 'Node-42',
      operatorAddress: '0x000000000000000000000000000000000000dEaD'
    });

    expect(guide.nodeName).toBe('node-42.alpha.node.agi.eth');
    expect(guide.ownerAddress).toBe('0x000000000000000000000000000000000000dEaD');
    expect(guide.parentDomain).toBe('alpha.node.agi.eth');
    expect(Array.isArray(guide.steps)).toBe(true);
    expect(guide.steps).toHaveLength(7);
    expect(guide.steps[0].link).toContain('https://app.ens.domains/name');
    expect(guide.steps[4].command).toContain('verify-ens');
  });

  it('throws when required parameters are missing', () => {
    expect(() => generateEnsSetupGuide({})).toThrow(/label is required/);
    expect(() => generateEnsSetupGuide({ label: 'x' })).toThrow(/operatorAddress is required/);
  });
});

describe('formatEnsGuide', () => {
  it('renders a readable script', () => {
    const guide = generateEnsSetupGuide({
      label: 'core',
      operatorAddress: '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa'
    });
    const lines = formatEnsGuide(guide);
    expect(lines).toHaveLength(7);
    expect(lines[0]).toMatch(/^1\. Anchor the parent domain session/);
    expect(lines[1]).toMatch(/Mint subdomain core.alpha.node.agi.eth/);
  });

  it('rejects invalid guides', () => {
    expect(() => formatEnsGuide(null)).toThrow(/guide with steps is required/);
    expect(() => formatEnsGuide({ steps: 'invalid' })).toThrow(/guide with steps is required/);
  });
});

