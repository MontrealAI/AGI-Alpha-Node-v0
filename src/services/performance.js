import { planJobExecution, DEFAULT_STRATEGIES } from '../intelligence/planning.js';
import { orchestrateSwarm } from '../intelligence/swarmOrchestrator.js';

const DEFAULT_JOB_PROFILE = {
  name: 'sovereign-yield-circuit',
  reward: '2500',
  complexity: 5.5,
  deadlineHours: 24,
  riskBps: 2200,
  penaltiesBps: 450
};

const DEFAULT_TASKS = [
  { name: 'grid-balancing', domain: 'energy', complexity: 6, urgency: 5, value: 9 },
  { name: 'biosynthetic-scan', domain: 'biotech', complexity: 5, urgency: 4, value: 7 },
  { name: 'treasury-hedge', domain: 'finance', complexity: 4, urgency: 3, value: 6 }
];

const DEFAULT_AGENTS = [
  { name: 'orion', domains: ['energy', 'finance'], capacity: 2, latencyMs: 80, quality: 0.95, capability: 8 },
  { name: 'helix', domains: ['biotech'], capacity: 1, latencyMs: 140, quality: 0.9, capability: 7 },
  { name: 'vault', domains: ['governance', 'finance'], capacity: 1, latencyMs: 90, quality: 0.88, capability: 6 }
];

const DEFAULT_HISTORY = [
  { difficulty: 4, successRate: 0.85, reward: 1.4 },
  { difficulty: 4.5, successRate: 0.82, reward: 1.5 },
  { difficulty: 5, successRate: 0.8, reward: 1.6 }
];

function normalizeHistory(history) {
  if (!Array.isArray(history) || history.length === 0) {
    return DEFAULT_HISTORY;
  }
  return history.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`History entry at index ${index} must be an object`);
    }
    const difficulty = Number.parseFloat(entry.difficulty ?? 0);
    const successRate = Number.parseFloat(entry.successRate ?? 0);
    const reward = Number.parseFloat(entry.reward ?? 0);
    if (!Number.isFinite(difficulty) || difficulty <= 0) {
      throw new Error(`History entry at index ${index} requires positive difficulty`);
    }
    if (!Number.isFinite(successRate) || successRate <= 0 || successRate > 1) {
      throw new Error(`History entry at index ${index} requires successRate between 0 and 1`);
    }
    if (!Number.isFinite(reward) || reward <= 0) {
      throw new Error(`History entry at index ${index} requires positive reward`);
    }
    return {
      difficulty,
      successRate,
      reward
    };
  });
}

export function derivePerformanceProfile({
  jobProfile = DEFAULT_JOB_PROFILE,
  strategies = DEFAULT_STRATEGIES,
  tasks = DEFAULT_TASKS,
  agents = DEFAULT_AGENTS,
  history = DEFAULT_HISTORY,
  horizon = 5,
  decimals = 18
} = {}) {
  const normalizedHistory = normalizeHistory(history);
  const plan = planJobExecution({ jobProfile, strategies, horizon, decimals });
  const swarm = orchestrateSwarm({ tasks, agents });

  const throughputPerEpoch = swarm.assignments.length;
  const successRate = normalizedHistory.reduce((sum, entry) => sum + entry.successRate, 0) /
    normalizedHistory.length;
  const averageReward = normalizedHistory.reduce((sum, entry) => sum + entry.reward, 0) /
    normalizedHistory.length;

  return {
    plan,
    swarm,
    history: normalizedHistory,
    throughputPerEpoch,
    successRate,
    averageReward,
    tokenEarningsProjection: plan.projection.projectedReward,
    utilization: swarm.utilization
  };
}

export const DEFAULT_PERFORMANCE_JOB = DEFAULT_JOB_PROFILE;
export const DEFAULT_PERFORMANCE_TASKS = DEFAULT_TASKS;
export const DEFAULT_PERFORMANCE_AGENTS = DEFAULT_AGENTS;
export const DEFAULT_PERFORMANCE_HISTORY = DEFAULT_HISTORY;
