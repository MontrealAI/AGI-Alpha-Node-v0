import pino from 'pino';
import { planJobExecution, describeStrategyComparison, DEFAULT_STRATEGIES } from './planning.js';
import { orchestrateSwarm } from './swarmOrchestrator.js';
import { runCurriculumEvolution } from './learningLoop.js';
import { assessAntifragility } from './stressHarness.js';

const DEFAULT_JOB_PROFILE = {
  name: 'institutional-alpha-mission',
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

const DEFAULT_SCENARIOS = [
  { name: 'flash-crash', loadFactor: 12, errorRate: 0.12, downtimeMinutes: 14, financialExposure: 180_000 },
  { name: 'api-outage', loadFactor: 4, errorRate: 0.05, downtimeMinutes: 60, financialExposure: 50_000 }
];

const DEFAULT_BASELINE = {
  capacityIndex: 1.2,
  errorBudget: 0.05,
  downtimeBudget: 30,
  financialBuffer: 200_000
};

async function determineRuntimeMode({ offlineMode = false, logger }) {
  if (offlineMode) {
    return { mode: 'offline', reason: 'offline-mode-enabled' };
  }

  const providerUrl = process.env.AI_API_URL;
  if (!providerUrl) {
    return { mode: 'local', reason: 'no-remote-provider-configured' };
  }

  const controller = new AbortController();
  const timeout = Number.parseInt(process.env.AI_PROVIDER_TIMEOUT ?? '2500', 10);
  const timer = setTimeout(() => controller.abort(), Number.isFinite(timeout) ? timeout : 2500);

  try {
    const response = await fetch(providerUrl, {
      method: 'HEAD',
      headers: {
        Authorization: process.env.OPENAI_API_KEY ? `Bearer ${process.env.OPENAI_API_KEY}` : undefined
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Remote provider responded with status ${response.status}`);
    }

    return { mode: 'remote', reason: 'remote-provider-healthy' };
  } catch (error) {
    logger?.warn?.(
      {
        error: error.message,
        providerUrl
      },
      'Remote AI provider unreachable – using local heuristics'
    );
    return { mode: 'local-fallback', reason: 'remote-provider-unreachable', error: error.message };
  } finally {
    clearTimeout(timer);
  }
}

function sanitizeBaseline(baseline) {
  if (!baseline || typeof baseline !== 'object') {
    return DEFAULT_BASELINE;
  }
  return {
    capacityIndex: Number.isFinite(baseline.capacityIndex) ? baseline.capacityIndex : DEFAULT_BASELINE.capacityIndex,
    errorBudget: Number.isFinite(baseline.errorBudget) ? baseline.errorBudget : DEFAULT_BASELINE.errorBudget,
    downtimeBudget: Number.isFinite(baseline.downtimeBudget) ? baseline.downtimeBudget : DEFAULT_BASELINE.downtimeBudget,
    financialBuffer: Number.isFinite(baseline.financialBuffer)
      ? baseline.financialBuffer
      : DEFAULT_BASELINE.financialBuffer
  };
}

export async function evaluateJobRequest(
  {
    jobProfile = DEFAULT_JOB_PROFILE,
    strategies = DEFAULT_STRATEGIES,
    tasks = DEFAULT_TASKS,
    agents = DEFAULT_AGENTS,
    history = DEFAULT_HISTORY,
    scenarios = DEFAULT_SCENARIOS,
    baseline = DEFAULT_BASELINE,
    horizon = 5,
    decimals = 18
  } = {},
  { offlineMode = false, logger = pino({ level: 'info', name: 'agent-runtime' }) } = {}
) {
  const providerStatus = await determineRuntimeMode({ offlineMode, logger });

  const plan = planJobExecution({
    jobProfile,
    strategies: Array.isArray(strategies) && strategies.length ? strategies : DEFAULT_STRATEGIES,
    horizon,
    decimals
  });
  const swarm = orchestrateSwarm({
    tasks: Array.isArray(tasks) && tasks.length ? tasks : DEFAULT_TASKS,
    agents: Array.isArray(agents) && agents.length ? agents : DEFAULT_AGENTS
  });
  const curriculum = runCurriculumEvolution({
    history: Array.isArray(history) && history.length ? history : DEFAULT_HISTORY
  });
  const antifragility = assessAntifragility({
    baseline: sanitizeBaseline(baseline),
    scenarios: Array.isArray(scenarios) && scenarios.length ? scenarios : DEFAULT_SCENARIOS
  });
  const comparison = describeStrategyComparison(plan, decimals);

  const jobMetrics = {
    projectedReward: plan.projection.projectedReward,
    throughput: swarm.assignments.length,
    successRate: curriculum.curriculum.trend.avgSuccess,
    provider: providerStatus.mode
  };

  return {
    providerStatus,
    plan,
    swarm,
    curriculum,
    antifragility,
    comparison,
    metrics: jobMetrics
  };
}
