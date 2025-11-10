import { parseTokenAmount } from '../utils/formatters.js';

function normalizeHistory(rewardHistory, decimals) {
  if (!Array.isArray(rewardHistory) || rewardHistory.length === 0) {
    throw new Error('rewardHistory must contain at least one entry');
  }
  return rewardHistory.map((value, index) => {
    try {
      return parseTokenAmount(value, decimals);
    } catch (error) {
      throw new Error(`Invalid reward history value at index ${index}: ${error.message}`);
    }
  });
}

function normalizeObligations(upcomingObligations, decimals) {
  if (!upcomingObligations) return [];
  if (!Array.isArray(upcomingObligations)) {
    throw new Error('upcomingObligations must be an array when provided');
  }
  return upcomingObligations.map((value, index) => {
    try {
      return parseTokenAmount(value, decimals);
    } catch (error) {
      throw new Error(`Invalid upcoming obligation at index ${index}: ${error.message}`);
    }
  });
}

function normalizeReinvestOptions(options) {
  if (!options || options.length === 0) {
    throw new Error('reinvestOptions must contain at least one basis point value');
  }
  return options.map((option, index) => {
    const numeric = Number.parseInt(option, 10);
    if (!Number.isFinite(numeric) || Number.isNaN(numeric)) {
      throw new Error(`Invalid reinvest option at index ${index}`);
    }
    if (numeric < 0 || numeric > 10_000) {
      throw new Error(`reinvest option at index ${index} must be between 0 and 10000 basis points`);
    }
    return numeric;
  });
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0n);
}

function calculateRewardStats(history) {
  const total = sum(history);
  const length = BigInt(history.length);
  const average = total / length;
  let minimum = history[0];
  let maximum = history[0];
  let totalDeviation = 0n;

  for (const value of history) {
    if (value < minimum) minimum = value;
    if (value > maximum) maximum = value;
    const deviation = value >= average ? value - average : average - value;
    totalDeviation += deviation;
  }

  const meanAbsoluteDeviation = totalDeviation / length;

  return {
    total,
    average,
    minimum,
    maximum,
    meanAbsoluteDeviation
  };
}

function computeBufferRequirement({ averageReward, minimumBufferBps, upcomingObligations }) {
  const requirementFromPolicy = (averageReward * BigInt(minimumBufferBps)) / 10_000n;
  const obligationsTotal = sum(upcomingObligations);
  const required = requirementFromPolicy > obligationsTotal ? requirementFromPolicy : obligationsTotal;
  return {
    requirementFromPolicy,
    obligationsTotal,
    required
  };
}

function evaluateStrategy({
  currentStake,
  stats,
  reinvestBps,
  riskAversionBps,
  bufferRequirement
}) {
  const reinvestAmount = (stats.average * BigInt(reinvestBps)) / 10_000n;
  const bufferAmount = stats.average - reinvestAmount;
  const projectedStake = currentStake + reinvestAmount;

  const riskFactor = (BigInt(riskAversionBps) * BigInt(reinvestBps)) / 10_000n;
  const riskPenalty = (stats.meanAbsoluteDeviation * riskFactor) / 10_000n;
  const adjustedStability = stats.average > riskPenalty ? stats.average - riskPenalty : 0n;

  const bufferShortfall = bufferAmount >= bufferRequirement.required ? 0n : bufferRequirement.required - bufferAmount;
  const obligationsShortfall = bufferAmount >= bufferRequirement.obligationsTotal
    ? 0n
    : bufferRequirement.obligationsTotal - bufferAmount;

  const growthScore = projectedStake;
  const stabilityScore = adjustedStability * 4n;
  const riskScore = riskPenalty * 3n;
  const score = growthScore + stabilityScore - riskScore - bufferShortfall * 4n - obligationsShortfall * 2n;

  return {
    reinvestBps,
    reinvestAmount,
    bufferAmount,
    projectedStake,
    riskPenalty,
    bufferShortfall,
    obligationsShortfall,
    adjustedStability,
    score
  };
}

export function optimizeReinvestmentStrategy({
  currentStake,
  rewardHistory,
  reinvestOptions = [9000, 8000, 7000, 6000, 5000],
  upcomingObligations = [],
  decimals = 18,
  minimumBufferBps = 2500,
  riskAversionBps = 2500
}) {
  if (minimumBufferBps < 0 || minimumBufferBps > 10_000) {
    throw new RangeError('minimumBufferBps must be between 0 and 10000');
  }
  if (riskAversionBps < 0 || riskAversionBps > 10_000) {
    throw new RangeError('riskAversionBps must be between 0 and 10000');
  }

  const normalizedStake = parseTokenAmount(currentStake, decimals);
  const normalizedHistory = normalizeHistory(rewardHistory, decimals);
  const normalizedObligations = normalizeObligations(upcomingObligations, decimals);
  const normalizedReinvestOptions = normalizeReinvestOptions(reinvestOptions);

  const stats = calculateRewardStats(normalizedHistory);
  const bufferRequirement = computeBufferRequirement({
    averageReward: stats.average,
    minimumBufferBps,
    upcomingObligations: normalizedObligations
  });

  const strategies = normalizedReinvestOptions.map((bps) =>
    evaluateStrategy({
      currentStake: normalizedStake,
      stats,
      reinvestBps: bps,
      riskAversionBps,
      bufferRequirement
    })
  );

  const recommended = strategies.reduce((best, candidate) => {
    if (!best) return candidate;
    if (candidate.score > best.score) return candidate;
    if (candidate.score === best.score && candidate.bufferAmount > best.bufferAmount) return candidate;
    return best;
  }, null);

  const epochsCovered = stats.average === 0n ? 0n : recommended.bufferAmount / stats.average;

  return {
    currentStake: normalizedStake,
    rewardHistory: normalizedHistory,
    upcomingObligations: normalizedObligations,
    historyStats: stats,
    bufferRequirement,
    strategies,
    recommended,
    bufferCoverage: {
      meetsMinimum: recommended.bufferAmount >= bufferRequirement.required,
      epochsCovered,
      requiredBuffer: bufferRequirement.required
    }
  };
}

export function summarizeStrategy(plan) {
  if (!plan || !plan.recommended) {
    throw new Error('plan with recommended strategy is required');
  }
  const { recommended, bufferCoverage } = plan;
  return {
    reinvestBps: recommended.reinvestBps,
    meetsMinimumBuffer: bufferCoverage.meetsMinimum,
    bufferEpochs: bufferCoverage.epochsCovered,
    bufferShortfall: recommended.bufferShortfall,
    obligationsShortfall: recommended.obligationsShortfall
  };
}
