import { roundTo } from '../constants/workUnits.js';

export const DEFAULT_ALPHA_WB_CONFIG = Object.freeze({
  baselineEnergyCostPerKwh: 0.12,
  baselineEnergyPerAlphaWU: 1,
  baselineQuality: 1,
  baselineConsensus: 0.99,
  energyAdjustmentFloor: 0.65,
  energyAdjustmentCap: 1.25,
  qualityAdjustmentFloor: 0.6,
  qualityAdjustmentCap: 1.5,
  consensusAdjustmentFloor: 0.8,
  consensusAdjustmentCap: 1.05,
  rebalanceCap: 0.15,
  rebalanceFloor: 0.01,
  smoothingWindowDays: 90,
  baseDivisor: 1_000
});

function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return Number.NaN;
  }
  const lower = Number(min);
  const upper = Number(max);
  if (Number.isFinite(lower) && numeric < lower) {
    return lower;
  }
  if (Number.isFinite(upper) && numeric > upper) {
    return upper;
  }
  return numeric;
}

function normalizeConfig(config = {}) {
  return {
    ...DEFAULT_ALPHA_WB_CONFIG,
    ...(config && typeof config === 'object' ? config : {})
  };
}

export function computeRawThroughput({ tasksCompleted = 0, taskDifficultyCoefficient = 1 }) {
  const tasks = Number(tasksCompleted);
  const coefficient = Number(taskDifficultyCoefficient);
  if (!Number.isFinite(tasks) || tasks < 0) {
    throw new Error('tasksCompleted must be a non-negative finite number');
  }
  if (!Number.isFinite(coefficient) || coefficient <= 0) {
    throw new Error('taskDifficultyCoefficient must be a positive finite number');
  }
  return roundTo(tasks * coefficient, 4);
}

export function computeEnergyAdjustment(
  { energyKwhPerAlphaWU, energyCostPerKwh },
  config = DEFAULT_ALPHA_WB_CONFIG
) {
  const normalizedConfig = normalizeConfig(config);
  const observedEnergy = Number(energyKwhPerAlphaWU ?? normalizedConfig.baselineEnergyPerAlphaWU);
  const observedCost = Number(energyCostPerKwh ?? normalizedConfig.baselineEnergyCostPerKwh);
  if (!Number.isFinite(observedEnergy) || observedEnergy <= 0) {
    throw new Error('energyKwhPerAlphaWU must be a positive finite number');
  }
  if (!Number.isFinite(observedCost) || observedCost <= 0) {
    throw new Error('energyCostPerKwh must be a positive finite number');
  }
  const baselineCost = normalizedConfig.baselineEnergyPerAlphaWU * normalizedConfig.baselineEnergyCostPerKwh;
  const observedUnitCost = observedEnergy * observedCost;
  const ratio = roundTo(baselineCost / observedUnitCost, 4);
  const clamped = clamp(ratio, normalizedConfig.energyAdjustmentFloor, normalizedConfig.energyAdjustmentCap);
  if (!Number.isFinite(clamped)) {
    throw new Error('Unable to compute a valid energy adjustment factor');
  }
  return clamped;
}

export function computeQualityAdjustment({ qualityScore }, config = DEFAULT_ALPHA_WB_CONFIG) {
  const normalizedConfig = normalizeConfig(config);
  const quality = Number(qualityScore ?? normalizedConfig.baselineQuality);
  if (!Number.isFinite(quality) || quality <= 0) {
    throw new Error('qualityScore must be a positive finite number');
  }
  const ratio = roundTo(quality / normalizedConfig.baselineQuality, 4);
  const clamped = clamp(ratio, normalizedConfig.qualityAdjustmentFloor, normalizedConfig.qualityAdjustmentCap);
  if (!Number.isFinite(clamped)) {
    throw new Error('Unable to compute a valid quality adjustment factor');
  }
  return clamped;
}

export function computeValidatorConsensus(
  { consensusRate, reproducibilityPenalty = 0, slashRate = 0 },
  config = DEFAULT_ALPHA_WB_CONFIG
) {
  const normalizedConfig = normalizeConfig(config);
  const baseRate = Number(consensusRate ?? normalizedConfig.baselineConsensus);
  const penalty = Number(reproducibilityPenalty ?? 0);
  const slashing = Number(slashRate ?? 0);
  if (!Number.isFinite(baseRate) || baseRate < 0) {
    throw new Error('consensusRate must be a non-negative finite number');
  }
  if (!Number.isFinite(penalty) || penalty < 0) {
    throw new Error('reproducibilityPenalty must be a non-negative finite number');
  }
  if (!Number.isFinite(slashing) || slashing < 0) {
    throw new Error('slashRate must be a non-negative finite number');
  }
  const adjusted = roundTo(Math.max(0, baseRate - penalty - slashing), 4);
  const clamped = clamp(
    adjusted,
    normalizedConfig.consensusAdjustmentFloor,
    normalizedConfig.consensusAdjustmentCap
  );
  if (!Number.isFinite(clamped)) {
    throw new Error('Unable to compute a valid validator consensus factor');
  }
  return clamped;
}

export function computeConstituentAlphaWU(observation = {}, config = DEFAULT_ALPHA_WB_CONFIG) {
  const normalizedConfig = normalizeConfig(config);
  const rawThroughput = computeRawThroughput({
    tasksCompleted: observation.tasksCompleted,
    taskDifficultyCoefficient: observation.taskDifficultyCoefficient
  });
  const energyAdjustment = computeEnergyAdjustment(observation, normalizedConfig);
  const qualityAdjustment = computeQualityAdjustment(observation, normalizedConfig);
  const consensusAdjustment = computeValidatorConsensus(observation, normalizedConfig);
  const alphaWU = roundTo(
    rawThroughput * energyAdjustment * qualityAdjustment * consensusAdjustment,
    4
  );
  return {
    label: observation.label ?? 'unnamed',
    rawThroughput,
    energyAdjustment,
    qualityAdjustment,
    consensusAdjustment,
    alphaWU
  };
}

function normalizeWeight(rawWeight) {
  const numeric = Number(rawWeight ?? 0);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }
  return numeric;
}

function distributeWeights(rawWeights, floor, cap) {
  const count = rawWeights.length;
  if (!count) {
    return [];
  }
  const totalRaw = rawWeights.reduce((acc, weight) => acc + weight, 0);
  const base = totalRaw > 0 ? rawWeights.map((weight) => weight / totalRaw) : Array(count).fill(1 / count);
  let weights = base.map((weight) => clamp(weight, floor, cap));
  const fixed = weights.map((weight) => weight === cap || weight === floor);
  let remaining = 1 - weights.reduce((acc, weight) => acc + weight, 0);
  let iteration = 0;

  while (Math.abs(remaining) > 1e-6 && iteration < 50) {
    const adjustable = weights
      .map((weight, index) => ({ index, weight }))
      .filter(({ index }) => !fixed[index]);

    if (adjustable.length === 0) {
      break;
    }

    const adjustableTotal = adjustable.reduce((acc, entry) => acc + entry.weight, 0) || adjustable.length;
    for (const { index } of adjustable) {
      const share = adjustableTotal > 0 ? weights[index] / adjustableTotal : 1 / adjustable.length;
      let next = weights[index] + remaining * share;
      next = clamp(next, floor, cap);
      if (next === cap || next === floor) {
        fixed[index] = true;
      }
      weights[index] = next;
    }

    remaining = 1 - weights.reduce((acc, weight) => acc + weight, 0);
    iteration += 1;
  }

  const total = weights.reduce((acc, weight) => acc + weight, 0);
  const normalizer = total > 0 ? total : 1;
  const normalized = weights.map((weight) => weight / normalizer);
  const rounded = normalized.map((weight) => roundTo(weight, 6));
  const roundedTotal = rounded.reduce((acc, weight) => acc + weight, 0);
  if (rounded.length > 0 && Math.abs(roundedTotal - 1) > 1e-6) {
    const correction = roundTo(1 - roundedTotal, 6);
    rounded[rounded.length - 1] = roundTo(rounded[rounded.length - 1] + correction, 6);
  }
  return rounded;
}

export function rebalanceConstituentWeights(constituents = [], config = DEFAULT_ALPHA_WB_CONFIG) {
  const normalizedConfig = normalizeConfig(config);
  if (!Array.isArray(constituents)) {
    throw new Error('constituents must be an array');
  }

  const effectiveCap = Math.max(normalizedConfig.rebalanceCap, constituents.length > 0 ? 1 / constituents.length : 0);
  const effectiveFloor = Math.min(normalizedConfig.rebalanceFloor, effectiveCap);

  const distributed = distributeWeights(
    constituents.map((entry) => normalizeWeight(entry?.weight ?? entry?.workShare)),
    effectiveFloor,
    effectiveCap
  );

  const equalFallback = constituents.length ? roundTo(1 / constituents.length, 4) : 0;

  return constituents.map((entry, index) => ({
    ...entry,
    weight: distributed[index] ?? equalFallback
  }));
}

export function computeAlphaWorkBenchmarkIndex(constituents = [], config = DEFAULT_ALPHA_WB_CONFIG) {
  const normalizedConfig = normalizeConfig(config);
  if (!Array.isArray(constituents) || constituents.length === 0) {
    return {
      alphaWB: 0,
      constituents: [],
      baseDivisor: normalizedConfig.baseDivisor
    };
  }

  const evaluated = constituents.map((entry) => {
    if (entry && typeof entry.alphaWU === 'number') {
      return { ...entry };
    }
    return computeConstituentAlphaWU(entry, normalizedConfig);
  });

  const withWeights = rebalanceConstituentWeights(evaluated, normalizedConfig);
  const numerator = withWeights.reduce((acc, entry) => acc + entry.weight * entry.alphaWU, 0);
  const alphaWB = roundTo(numerator / normalizedConfig.baseDivisor, 6);

  return {
    alphaWB,
    constituents: withWeights,
    baseDivisor: normalizedConfig.baseDivisor
  };
}

export function deriveThroughputFromSegments(segments = []) {
  if (!Array.isArray(segments)) {
    throw new Error('segments must be an array');
  }
  if (segments.length === 0) {
    return {
      tasksCompleted: 0,
      taskDifficultyCoefficient: 1
    };
  }
  const tasksCompleted = segments.length;
  const aggregateQuality = segments.reduce((acc, segment) => acc + Number(segment?.qualityMultiplier ?? 1), 0);
  const taskDifficultyCoefficient = roundTo(aggregateQuality / tasksCompleted, 4);
  return {
    tasksCompleted,
    taskDifficultyCoefficient
  };
}
