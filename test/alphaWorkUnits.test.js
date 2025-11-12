import { describe, it, expect, beforeEach } from 'vitest';
import { getAddress } from 'ethers';
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
    expect(metrics.overall.quality.global).toBeCloseTo(0.9, 6);
    expect(metrics.overall.validators['0x0000000000000000000000000000000000000010']).toBe(200);
    const agentBreakdown = metrics.overall.breakdowns.agents['0x0000000000000000000000000000000000000001'];
    expect(agentBreakdown).toBeDefined();
    expect(agentBreakdown.minted).toBe(1);
    expect(agentBreakdown.accepted).toBe(1);
    expect(agentBreakdown.acceptanceRate).toBeCloseTo(1);
    expect(metrics.overall.quality.perAgent['0x0000000000000000000000000000000000000001']).toBeCloseTo(0.9, 6);
    expect(metrics.overall.quality.perNode['0x0000000000000000000000000000000000000002']).toBeCloseTo(0.9, 6);
    expect(metrics.overall.quality.perValidator['0x0000000000000000000000000000000000000010']).toBeCloseTo(0.9, 6);
    const validatorBreakdown = metrics.overall.breakdowns.validators['0x0000000000000000000000000000000000000010'];
    expect(validatorBreakdown.validations).toBe(1);
    expect(validatorBreakdown.slashes).toBe(0);
    const slashedValidatorBreakdown = metrics.overall.breakdowns.validators['0x0000000000000000000000000000000000000020'];
    expect(slashedValidatorBreakdown.slashes).toBe(1);
  });

  it('normalizes validator-weighted quality by total stake exposure', () => {
    const agent = '0x00000000000000000000000000000000000000aa';
    const node = '0x00000000000000000000000000000000000000bb';
    const validatorA = '0x00000000000000000000000000000000000000a1';
    const validatorB = '0x00000000000000000000000000000000000000b2';
    const normalizedAgent = getAddress(agent);
    const normalizedNode = getAddress(node);
    const normalizedValidatorA = getAddress(validatorA);
    const normalizedValidatorB = getAddress(validatorB);

    registry.recordMint({ id: '0x' + '05'.repeat(32), agent, node, timestamp: 1_700_000_000 });
    registry.recordValidation({
      id: '0x' + '05'.repeat(32),
      validator: validatorA,
      stake: 200,
      score: 0.8,
      timestamp: 1_700_000_010
    });
    registry.recordValidation({
      id: '0x' + '05'.repeat(32),
      validator: validatorB,
      stake: 100,
      score: 0.7,
      timestamp: 1_700_000_015
    });
    registry.recordAcceptance({ id: '0x' + '05'.repeat(32), timestamp: 1_700_000_030 });

    registry.recordMint({ id: '0x' + '06'.repeat(32), agent, node, timestamp: 1_700_100_000 });
    registry.recordValidation({
      id: '0x' + '06'.repeat(32),
      validator: validatorA,
      stake: 200,
      score: 0.9,
      timestamp: 1_700_100_010
    });
    registry.recordAcceptance({ id: '0x' + '06'.repeat(32), timestamp: 1_700_100_040 });

    const metrics = registry.getMetrics();
    const quality = metrics.overall.quality;

    expect(quality.global).toBeCloseTo(0.81, 2);
    expect(quality.perAgent[normalizedAgent]).toBeCloseTo(0.81, 2);
    expect(quality.perNode[normalizedNode]).toBeCloseTo(0.81, 2);
    expect(quality.perValidator[normalizedValidatorA]).toBeCloseTo(0.825, 3);
    expect(quality.perValidator[normalizedValidatorB]).toBeCloseTo(0.75, 6);
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
