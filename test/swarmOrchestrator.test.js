import { describe, it, expect } from 'vitest';
import { orchestrateSwarm } from '../src/intelligence/swarmOrchestrator.js';

describe('swarm orchestrator', () => {
  it('assigns urgent tasks to high capability agents with fallbacks', () => {
    const plan = orchestrateSwarm({
      tasks: [
        { name: 'energy-grid', domain: 'energy', complexity: 7, urgency: 5, value: 8 },
        { name: 'bio-synthesis', domain: 'biotech', complexity: 6, urgency: 4, value: 7 }
      ],
      agents: [
        { name: 'orion', domains: ['energy', 'finance'], capacity: 2, latencyMs: 80, quality: 0.95, capability: 8 },
        { name: 'helix', domains: ['biotech'], capacity: 1, latencyMs: 140, quality: 0.9, capability: 7 },
        { name: 'vault', domains: ['governance', 'finance'], capacity: 1, latencyMs: 90, quality: 0.85, capability: 5 }
      ],
      latencyBudgetMs: 150
    });

    expect(plan.assignments).toHaveLength(2);
    expect(plan.fallbacks).toHaveLength(2);
    const primaryAgents = plan.assignments.map((assignment) => assignment.agent.name);
    expect(primaryAgents).toContain('orion');
    expect(primaryAgents).toContain('helix');
    const utilization = plan.utilization.find((entry) => entry.agent === 'orion');
    expect(utilization.used).toBeGreaterThan(0);
  });

  it('requires tasks and agents', () => {
    expect(() => orchestrateSwarm({ tasks: [], agents: [] })).toThrow();
  });
});
