import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHealthGate, normalizeEnsName, matchesPattern } from '../src/services/healthGate.js';
import { createJobLifecycle } from '../src/services/jobLifecycle.js';

describe('healthGate utilities', () => {
  it('normalizes ENS names consistently', () => {
    expect(normalizeEnsName(' Example.NODE.AGI.ETH ')).toBe('example.node.agi.eth');
    expect(normalizeEnsName('test.')).toBe('test');
    expect(normalizeEnsName('')).toBeNull();
  });

  it('matches wildcard and exact patterns', () => {
    expect(matchesPattern('alpha.node.agi.eth', 'alpha.node.agi.eth')).toBe(true);
    expect(matchesPattern('1.alpha.node.agi.eth', '*.alpha.node.agi.eth')).toBe(true);
    expect(matchesPattern('node.agi.eth', '*.alpha.node.agi.eth')).toBe(false);
  });
});

describe('createHealthGate', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to wildcard allowlist when none provided', () => {
    const gate = createHealthGate({ logger });
    expect(gate.matchesAllowlist('sample.alpha.node.agi.eth')).toBe(true);
  });

  it('rejects updates from non-allowlisted ENS', () => {
    const gate = createHealthGate({ allowlist: ['trusted.node.agi.eth'], logger });
    const result = gate.setStatus({ isHealthy: true, ensName: 'rogue.node.agi.eth' });
    expect(result).toBe(false);
    expect(gate.isHealthy()).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('updates state when diagnostics are healthy and allowlisted', () => {
    const gate = createHealthGate({ allowlist: ['*.node.agi.eth'], logger });
    const updated = gate.updateFromDiagnostics({
      ensName: 'trusted.node.agi.eth',
      stakeEvaluation: { meets: true, penaltyActive: false },
      diagnosticsHealthy: true
    });
    expect(updated).toBe(true);
    expect(gate.isHealthy()).toBe(true);
    expect(gate.getState().activeEns).toBe('trusted.node.agi.eth');
  });

  it('blocks alpha events when unhealthy', () => {
    const gate = createHealthGate({ allowlist: ['*.node.agi.eth'], logger });
    gate.setStatus({ isHealthy: false, ensName: 'trusted.node.agi.eth' });
    expect(gate.shouldEmitAlphaEvent({ type: 'minted' })).toBe(false);
  });

  it('records suppression count through job lifecycle integrations', () => {
    const gate = createHealthGate({ allowlist: ['trusted.node.agi.eth'], logger });
    gate.setStatus({ isHealthy: false, ensName: 'trusted.node.agi.eth' });
    const { recordAlphaWorkUnitEvent, getMetrics } = createJobLifecycle({
      profile: 'v0',
      logger,
      healthGate: gate
    });
    recordAlphaWorkUnitEvent('minted', { id: '0x1', agent: '0x2', node: '0x3' });
    const metrics = getMetrics();
    expect(metrics.alphaGate.suppressed).toBeGreaterThanOrEqual(1);
  });
});
