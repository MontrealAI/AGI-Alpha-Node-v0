import { describe, it, expect, beforeEach } from 'vitest';
import { createAlphaWorkUnitRegistry } from '../src/services/alphaWorkUnits.js';

describe('alpha work unit registry', () => {
  let registry;

  beforeEach(() => {
    registry = createAlphaWorkUnitRegistry({
      clock: () => 1_700_000_000_000,
      windows: [
        { label: '7d', durationMs: 7 * 24 * 60 * 60 * 1000 },
        { label: '1d', durationMs: 24 * 60 * 60 * 1000 }
      ]
    });
  });

  it('tracks mint, validation, acceptance, and slash events', () => {
    registry.recordMint({
      id: '0x' + '01'.repeat(32),
      agent: '0x0000000000000000000000000000000000000001',
      node: '0x0000000000000000000000000000000000000002',
      timestamp: 1_700_000_000
    });
    registry.recordValidation({
      id: '0x' + '01'.repeat(32),
      validator: '0x0000000000000000000000000000000000000010',
      stake: 200,
      score: 0.92,
      timestamp: 1_700_000_100
    });
    registry.recordValidation({
      id: '0x' + '01'.repeat(32),
      validator: '0x0000000000000000000000000000000000000020',
      stake: 100,
      score: 0.88,
      timestamp: 1_700_000_120
    });
    registry.recordAcceptance({
      id: '0x' + '01'.repeat(32),
      timestamp: 1_700_000_200
    });
    registry.recordSlash({
      id: '0x' + '01'.repeat(32),
      validator: '0x0000000000000000000000000000000000000020',
      amount: 1,
      timestamp: 1_700_000_220
    });

    const metrics = registry.getMetrics();
    expect(metrics.overall.totals.minted).toBe(1);
    expect(metrics.overall.totals.accepted).toBe(1);
    expect(metrics.overall.acceptanceRate).toBeCloseTo(1);
    expect(metrics.overall.quality.global).toBeGreaterThan(0);
    expect(metrics.overall.validators['0x0000000000000000000000000000000000000010']).toBe(200);
    const agentBreakdown = metrics.overall.breakdowns.agents['0x0000000000000000000000000000000000000001'];
    expect(agentBreakdown).toBeDefined();
    expect(agentBreakdown.minted).toBe(1);
    expect(agentBreakdown.accepted).toBe(1);
    expect(agentBreakdown.acceptanceRate).toBeCloseTo(1);
    const validatorBreakdown = metrics.overall.breakdowns.validators['0x0000000000000000000000000000000000000010'];
    expect(validatorBreakdown.validations).toBe(1);
    expect(validatorBreakdown.slashes).toBe(0);
    const slashedValidatorBreakdown = metrics.overall.breakdowns.validators['0x0000000000000000000000000000000000000020'];
    expect(slashedValidatorBreakdown.slashes).toBe(1);
  });

  it('applies window filters when computing metrics', () => {
    registry.recordMint({ id: '0x' + '02'.repeat(32), timestamp: 1_600_000_000 });
    registry.recordAcceptance({ id: '0x' + '02'.repeat(32), timestamp: 1_600_000_100 });

    registry.recordMint({ id: '0x' + '03'.repeat(32), timestamp: 1_700_000_000 });
    registry.recordAcceptance({ id: '0x' + '03'.repeat(32), timestamp: 1_700_000_020 });

    const metrics = registry.getMetrics();
    const window7d = metrics.windows.find((entry) => entry.window === '7d');
    expect(window7d).toBeDefined();
    expect(window7d.totals.minted).toBe(1);
    expect(window7d.acceptanceRate).toBeCloseTo(1);
  });

  it('exports registry state for diagnostics', () => {
    registry.recordMint({ id: '0x' + '04'.repeat(32) });
    const state = registry.exportState();
    expect(Array.isArray(state.units)).toBe(true);
    expect(state.units[0].id).toBe('0x' + '04'.repeat(32));
  });
});
