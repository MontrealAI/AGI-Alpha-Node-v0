import { describe, it, expect } from 'vitest';
import { createHealthGate } from '../src/services/healthGate.js';
import { deriveOwnerDirectives } from '../src/services/controlPlane.js';
import { createJobLifecycle } from '../src/services/jobLifecycle.js';

describe('owner control and ENS gate smoke tests', () => {
  it('produces pause directives and suppresses alpha events when gate blocks emissions', () => {
    const stakeStatus = { minimumStake: 10n ** 18n * 3n, operatorStake: 10n ** 18n };
    const stakeEvaluation = {
      meets: false,
      deficit: 2n * 10n ** 18n,
      penaltyActive: true,
      heartbeatStale: false,
      recommendedAction: 'pause'
    };

    const directives = deriveOwnerDirectives({
      stakeStatus,
      stakeEvaluation,
      config: {
        systemPauseAddress: '0x00000000000000000000000000000000000000aa',
        incentivesAddress: '0x00000000000000000000000000000000000000bb'
      }
    });

    expect(directives.priority).toBe('critical');
    expect(directives.actions.some((action) => action.type === 'pause')).toBe(true);

    const gate = createHealthGate({ allowlist: ['trusted.alpha.node.agi.eth'] });
    const lifecycle = createJobLifecycle({ profile: 'v0', healthGate: gate, logger: null });
    const events = [];
    lifecycle.on('alpha-wu:event', (event) => events.push(event));

    gate.setStatus({ isHealthy: true, ensName: 'trusted.alpha.node.agi.eth', source: 'smoke-test' });
    lifecycle.recordAlphaWorkUnitEvent('minted', { id: '0x01', agent: '0x02', node: '0x03' });
    expect(events).toHaveLength(1);

    gate.setStatus({ isHealthy: false, ensName: 'trusted.alpha.node.agi.eth', source: 'smoke-test' });
    lifecycle.recordAlphaWorkUnitEvent('minted', { id: '0x02', agent: '0x02', node: '0x03' });
    expect(events).toHaveLength(1);
    expect(lifecycle.getMetrics().alphaGate.suppressed).toBeGreaterThan(0);
  });
});
