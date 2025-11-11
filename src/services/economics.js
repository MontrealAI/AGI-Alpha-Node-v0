import { parseTokenAmount } from '../utils/formatters.js';

const DEFAULT_DECIMALS = 18;

function toBigIntAmount(value, decimals, field) {
  if (typeof value === 'bigint') {
    if (value < 0n) {
      throw new RangeError(`${field} must be non-negative`);
    }
    return value;
  }

  if (value === null || value === undefined) {
    throw new Error(`${field} is required`);
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`${field} must be a finite number`);
    }
    value = value.toString();
  }

  if (typeof value !== 'string') {
    throw new Error(`${field} must be provided as a string, number, or bigint`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} cannot be empty`);
  }

  const parsed = parseTokenAmount(trimmed, decimals);
  if (parsed < 0n) {
    throw new RangeError(`${field} must be non-negative`);
  }
  return parsed;
}

function normalizePositiveNumber(value, field) {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`${field} must be a finite number`);
  }
  if (numeric <= 0) {
    throw new RangeError(`${field} must be greater than zero`);
  }
  return numeric;
}

function normalizeRatio(value, field) {
  if (value === null || value === undefined) {
    return undefined;
  }
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`${field} must be a finite number between 0 and 1`);
  }
  if (numeric < 0 || numeric > 1) {
    throw new RangeError(`${field} must be between 0 and 1`);
  }
  return numeric;
}

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

export function calculateAlphaWorkUnit({
  gpuSeconds,
  gflopsNorm,
  modelTier,
  sloPass,
  qualityValidation,
  decimals = DEFAULT_DECIMALS
}) {
  const normalizedGpuSeconds = normalizePositiveNumber(gpuSeconds, 'gpuSeconds');
  const normalizedGflops = normalizePositiveNumber(gflopsNorm, 'gflopsNorm');
  const normalizedModelTier = normalizePositiveNumber(modelTier, 'modelTier');
  const normalizedSlo = normalizeRatio(sloPass, 'sloPass');
  const normalizedQuality = normalizeRatio(
    qualityValidation,
    'qualityValidation'
  );

  if (normalizedSlo === undefined) {
    throw new Error('sloPass is required');
  }
  if (normalizedQuality === undefined) {
    throw new Error('qualityValidation is required');
  }

  const scale = 10n ** BigInt(decimals);
  const factors = [
    normalizedGpuSeconds,
    normalizedGflops,
    normalizedModelTier,
    normalizedSlo,
    normalizedQuality
  ];

  const alphaWu = factors.reduce((accumulator, factor, index) => {
    const scaledFactor = parseTokenAmount(factor.toString(), decimals);
    if (scaledFactor === undefined) {
      throw new Error(`Factor at position ${index} could not be parsed`);
    }
    return (accumulator * scaledFactor) / scale;
  }, scale);

  return {
    alphaWu,
    factors: {
      gpuSeconds: normalizedGpuSeconds,
      gflopsNorm: normalizedGflops,
      modelTier: normalizedModelTier,
      sloPass: normalizedSlo,
      qualityValidation: normalizedQuality
    },
    decimals
  };
}

function extractQuality(report) {
  if (report === null || report === undefined) {
    return undefined;
  }
  if (typeof report === 'object') {
    if (report.qualityValidation !== undefined) return report.qualityValidation;
    if (report.quality !== undefined) return report.quality;
    if (report.qv !== undefined) return report.qv;
  }
  return report;
}

function extractSlo(report) {
  if (report === null || report === undefined) {
    return undefined;
  }
  if (typeof report === 'object' && report.sloPass !== undefined) {
    return report.sloPass;
  }
  if (typeof report === 'object' && report.slo !== undefined) {
    return report.slo;
  }
  return report;
}

export function calculateAlphaProductivityIndex({
  reports,
  decimals = DEFAULT_DECIMALS,
  circulatingSupply
}) {
  if (!Array.isArray(reports) || reports.length === 0) {
    throw new Error('reports must be a non-empty array');
  }

  const scale = 10n ** BigInt(decimals);
  const contributions = [];
  let totalAlphaWu = 0n;
  let totalEmitted = 0n;
  let totalBurned = 0n;
  let sloAccumulator = 0;
  let qualityAccumulator = 0;
  let sloCount = 0;
  let qualityCount = 0;

  reports.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Report at index ${index} must be an object`);
    }

    let alphaWu;
    if (entry.alphaWu !== undefined) {
      alphaWu = toBigIntAmount(entry.alphaWu, decimals, `reports[${index}].alphaWu`);
    } else if (entry.alpha !== undefined) {
      alphaWu = toBigIntAmount(entry.alpha, decimals, `reports[${index}].alpha`);
    } else if (
      entry.gpuSeconds !== undefined ||
      entry.gflopsNorm !== undefined ||
      entry.modelTier !== undefined
    ) {
      alphaWu = calculateAlphaWorkUnit({
        gpuSeconds: entry.gpuSeconds,
        gflopsNorm: entry.gflopsNorm,
        modelTier: entry.modelTier,
        sloPass: entry.sloPass ?? entry.slo ?? entry.metrics?.sloPass,
        qualityValidation:
          extractQuality(entry.qualityValidation ?? entry.metrics?.qualityValidation ?? entry.qv ?? entry.quality),
        decimals
      }).alphaWu;
    } else {
      throw new Error(
        `reports[${index}] must include alpha, alphaWu, or workload metrics (gpuSeconds, gflopsNorm, modelTier)`
      );
    }

    if (alphaWu < 0n) {
      throw new RangeError(`reports[${index}] alpha value must be non-negative`);
    }

    const slo = normalizeRatio(extractSlo(entry.sloPass ?? entry.slo ?? entry.metrics?.sloPass), 'sloPass');
    if (slo !== undefined) {
      sloAccumulator += slo;
      sloCount += 1;
    }

    const quality = normalizeRatio(
      extractQuality(
        entry.qualityValidation ?? entry.metrics?.qualityValidation ?? entry.qv ?? entry.quality
      ),
      'qualityValidation'
    );
    if (quality !== undefined) {
      qualityAccumulator += quality;
      qualityCount += 1;
    }

    const emittedValue = entry.tokensEmitted ?? entry.emission;
    const burnedValue = entry.tokensBurned ?? entry.burn;

    if (emittedValue !== undefined) {
      totalEmitted += toBigIntAmount(emittedValue, decimals, `reports[${index}].tokensEmitted`);
    }

    if (burnedValue !== undefined) {
      totalBurned += toBigIntAmount(burnedValue, decimals, `reports[${index}].tokensBurned`);
    }

    contributions.push({
      epoch: entry.epoch ?? index + 1,
      alphaWu,
      sloPass: slo,
      quality,
      tokensEmitted:
        emittedValue !== undefined
          ? toBigIntAmount(emittedValue, decimals, `reports[${index}].tokensEmitted`)
          : undefined,
      tokensBurned:
        burnedValue !== undefined
          ? toBigIntAmount(burnedValue, decimals, `reports[${index}].tokensBurned`)
          : undefined
    });

    totalAlphaWu += alphaWu;
  });

  const averageAlphaWu = totalAlphaWu / BigInt(contributions.length);
  const first = contributions[0].alphaWu;
  const last = contributions[contributions.length - 1].alphaWu;
  const growthBps = first === 0n ? 0n : ((last - first) * 10_000n) / first;

  const burnToEmissionBps = totalEmitted === 0n ? null : (totalBurned * 10_000n) / totalEmitted;
  const wagePerAlpha = totalAlphaWu === 0n ? null : (totalEmitted * scale) / totalAlphaWu;

  const normalizedCirculating =
    circulatingSupply !== undefined && circulatingSupply !== null
      ? toBigIntAmount(circulatingSupply, decimals, 'circulatingSupply')
      : null;

  const syntheticLaborYield =
    normalizedCirculating && normalizedCirculating > 0n
      ? (totalAlphaWu * scale) / normalizedCirculating
      : null;

  return {
    decimals,
    epochCount: contributions.length,
    totalAlphaWu,
    averageAlphaWu,
    contributions,
    growthBps,
    averages: {
      sloPass: sloCount > 0 ? sloAccumulator / sloCount : null,
      quality: qualityCount > 0 ? qualityAccumulator / qualityCount : null
    },
    totals: {
      tokensEmitted: totalEmitted,
      tokensBurned: totalBurned,
      netTokens: totalEmitted - totalBurned
    },
    burnToEmissionBps,
    wagePerAlpha,
    syntheticLaborYield
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
