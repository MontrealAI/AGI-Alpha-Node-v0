import { parseTokenAmount } from '../utils/formatters.js';

const DEFAULT_STRATEGIES = [
  {
    name: 'sovereign-baseline',
    computeCost: '150',
    reliability: 0.9,
    capability: 6,
    parallelism: 1.4
  },
  {
    name: 'mesh-synergy',
    computeCost: '240',
    reliability: 0.96,
    capability: 8,
    parallelism: 2.1
  },
  {
    name: 'hyperstate-overdrive',
    computeCost: '400',
    reliability: 0.985,
    capability: 9.5,
    parallelism: 3
  }
];

function normalizeStrategies(strategies, decimals) {
  const normalized = (strategies ?? DEFAULT_STRATEGIES).map((strategy, index) => {
    if (!strategy || typeof strategy !== 'object') {
      throw new Error(`Strategy at index ${index} must be an object`);
    }
    const { name, computeCost, reliability, capability, parallelism } = strategy;
    if (!name) {
      throw new Error(`Strategy at index ${index} is missing name`);
    }
    if (reliability <= 0 || reliability > 1) {
      throw new Error(`Strategy ${name} must have reliability between 0 and 1`);
    }
    if (capability <= 0) {
      throw new Error(`Strategy ${name} must have capability > 0`);
    }
    if (parallelism <= 0) {
      throw new Error(`Strategy ${name} must have parallelism > 0`);
    }
    return {
      name,
      reliability,
      capability,
      parallelism,
      computeCost: parseTokenAmount(String(computeCost ?? '0'), decimals)
    };
  });

  return normalized;
}

function buildJobProfile({ name, reward, complexity, deadlineHours, riskBps, penaltiesBps }, decimals) {
  if (!reward) {
    throw new Error('Job reward is required');
  }
  if (complexity <= 0) {
    throw new Error('Job complexity must be > 0');
  }
  if (deadlineHours <= 0) {
    throw new Error('deadlineHours must be > 0');
  }
  const normalizedReward = parseTokenAmount(reward, decimals);
  return {
    name: name ?? 'unlabeled-mission',
    reward: normalizedReward,
    complexity,
    deadlineHours,
    riskBps: riskBps ?? 2500,
    penaltiesBps: penaltiesBps ?? 500
  };
}

function estimateDuration({ deadlineHours, complexity }, strategy) {
  const base = complexity / strategy.capability;
  const duration = base <= 0 ? 1 : base * (1 / strategy.parallelism);
  return Math.max(duration * 6, 1); // convert from abstract steps to hours
}

function computeNetValue(job, strategy) {
  const gross = job.reward;
  const cost = strategy.computeCost;
  return gross > cost ? gross - cost : 0n;
}

function computePenalty(job, strategy, durationHours) {
  const deadlinePenalty = durationHours > job.deadlineHours ? (durationHours - job.deadlineHours) / job.deadlineHours : 0;
  const complexityGap = job.complexity > strategy.capability ? job.complexity - strategy.capability : 0;
  const baseRiskPenalty = (job.reward * BigInt(job.riskBps ?? 0)) / 10_000n;
  const secondaryPenalty = (job.reward * BigInt(job.penaltiesBps ?? 0)) / 10_000n;
  const penaltyWeight = Math.max(1, 1 + deadlinePenalty + complexityGap * 0.1);
  const scaledWeight = BigInt(Math.round(penaltyWeight * 1_000));
  const penalty = ((baseRiskPenalty + secondaryPenalty) * scaledWeight) / 1_000n;
  const capabilityDeficit = job.complexity > strategy.capability ? job.complexity - strategy.capability : 0;
  const capabilityPenalty = capabilityDeficit
    ? (job.reward * BigInt(Math.round(capabilityDeficit * 1_000))) / 10_000n
    : 0n;
  return penalty + capabilityPenalty;
}

function computeScore({ job, strategy }) {
  const duration = estimateDuration(job, strategy);
  const netValue = computeNetValue(job, strategy);
  const penalty = computePenalty(job, strategy, duration);
  const riskAdjusted = netValue > penalty ? netValue - penalty : 0n;
  const reliabilityMultiplier = BigInt(Math.round(strategy.reliability * 10_000));
  const capabilityRatio = strategy.capability / job.complexity;
  const capabilityBps = BigInt(Math.round(Math.min(Math.max(capabilityRatio, 0.25), 1.75) * 10_000));
  const deadlineRatio = job.deadlineHours / duration;
  const deadlineBps = BigInt(Math.round(Math.min(Math.max(deadlineRatio, 0.5), 1.5) * 10_000));
  const compositeMultiplier = (reliabilityMultiplier * capabilityBps * deadlineBps) / (10_000n * 10_000n);
  const score = (riskAdjusted * compositeMultiplier) / 10_000n;
  return {
    strategy,
    duration,
    netValue,
    penalty,
    riskAdjusted,
    score,
    reliabilityMultiplier,
    capabilityBps,
    deadlineBps
  };
}

export function planJobExecution({ jobProfile, strategies, horizon = 3, decimals = 18 }) {
  if (!Number.isFinite(horizon) || horizon <= 0) {
    throw new Error('horizon must be a positive number');
  }
  const normalizedJob = buildJobProfile(jobProfile, decimals);
  const normalizedStrategies = normalizeStrategies(strategies, decimals);

  const evaluations = normalizedStrategies.map((strategy) => computeScore({ job: normalizedJob, strategy }));
  evaluations.sort((a, b) => (a.score === b.score ? Number(b.netValue - a.netValue) : Number(b.score - a.score)));

  const recommended = evaluations[0];
  const projectedTimeline = [];
  let projectedReward = 0n;
  for (let step = 1; step <= horizon; step += 1) {
    const scalar = Math.max(0, 10_000 - step * 350);
    const decay = BigInt(scalar);
    const adjusted = (recommended.netValue * decay) / 10_000n;
    projectedReward += adjusted;
    projectedTimeline.push({ epoch: step, adjustedNet: adjusted });
  }

  return {
    job: normalizedJob,
    recommended,
    evaluations,
    projection: {
      horizon,
      projectedReward,
      timeline: projectedTimeline
    }
  };
}

export function describeStrategyComparison(plan, decimals = 18) {
  if (!plan || !plan.evaluations) {
    throw new Error('plan with evaluations is required');
  }
  return plan.evaluations.map((entry) => ({
    name: entry.strategy.name,
    reliability: entry.strategy.reliability,
    capability: entry.strategy.capability,
    durationHours: Number(entry.duration.toFixed(2)),
    netValue: entry.netValue.toString(),
    riskAdjusted: entry.riskAdjusted.toString(),
    score: entry.score.toString()
  }));
}

export { DEFAULT_STRATEGIES };
