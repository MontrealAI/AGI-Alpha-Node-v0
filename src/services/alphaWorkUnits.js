import { getAddress, isAddress } from 'ethers';

const DEFAULT_WINDOWS = [
  { label: '7d', durationMs: 7 * 24 * 60 * 60 * 1000 },
  { label: '30d', durationMs: 30 * 24 * 60 * 60 * 1000 }
];

function normalizeWorkUnitId(value) {
  if (value === undefined || value === null) {
    throw new Error('Alpha work unit id is required');
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error('Alpha work unit id must be non-empty');
    }
    return trimmed.startsWith('0x') ? trimmed.toLowerCase() : trimmed.toLowerCase();
  }
  if (value instanceof Uint8Array) {
    return `0x${Buffer.from(value).toString('hex')}`;
  }
  if (typeof value === 'object' && typeof value.toHexString === 'function') {
    return value.toHexString().toLowerCase();
  }
  return String(value).toLowerCase();
}

function normalizeAddress(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (isAddress(trimmed)) {
      try {
        return getAddress(trimmed);
      } catch {
        return trimmed.toLowerCase();
      }
    }
    return trimmed.toLowerCase();
  }
  if (typeof value === 'object' && typeof value.toString === 'function') {
    const result = value.toString();
    return normalizeAddress(result);
  }
  return null;
}

function toSafeNumber(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'bigint') {
    const max = BigInt(Number.MAX_SAFE_INTEGER);
    const min = BigInt(-Number.MAX_SAFE_INTEGER);
    if (value > max) return Number.MAX_SAFE_INTEGER;
    if (value < min) return -Number.MAX_SAFE_INTEGER;
    return Number(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toNonNegativeNumber(value) {
  const numeric = toSafeNumber(value);
  if (numeric === null) return null;
  return numeric < 0 ? 0 : numeric;
}

function normalizeScore(value) {
  const numeric = toSafeNumber(value);
  if (numeric === null) return null;
  if (!Number.isFinite(numeric)) return null;
  return numeric;
}

function nowSeconds(clock) {
  const value = clock();
  return Math.floor(value / 1000);
}

function normalizeTimestampSeconds(value, fallbackSeconds) {
  if (value === undefined || value === null) {
    return fallbackSeconds ?? null;
  }
  if (typeof value === 'number') {
    if (Number.isFinite(value)) {
      return value;
    }
    return fallbackSeconds ?? null;
  }
  if (typeof value === 'bigint') {
    const normalized = toSafeNumber(value);
    return normalized ?? fallbackSeconds ?? null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return fallbackSeconds ?? null;
    const parsed = Number.parseFloat(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallbackSeconds ?? null;
}

function cloneRecord(record) {
  if (!record) return null;
  return {
    id: record.id,
    agent: record.agent,
    node: record.node,
    mintedAt: record.mintedAt,
    acceptedAt: record.acceptedAt,
    validations: record.validations.map((validation) => ({ ...validation })),
    slashes: record.slashes.map((slash) => ({ ...slash }))
  };
}

function computePercentile(values, percentile) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * percentile;
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  const lower = sorted[lowerIndex];
  const upper = sorted[upperIndex];
  if (lowerIndex === upperIndex) {
    return lower;
  }
  const weight = index - lowerIndex;
  return lower * (1 - weight) + upper * weight;
}

function parseWindowSpec(spec) {
  if (spec === undefined || spec === null) {
    return null;
  }
  if (typeof spec === 'number') {
    return {
      label: `${Math.round(spec / (24 * 60 * 60 * 1000))}d`,
      durationMs: spec
    };
  }
  if (typeof spec === 'string') {
    const trimmed = spec.trim();
    if (!trimmed) return null;
    const match = /^([0-9]+)\s*(ms|s|m|h|d)$/i.exec(trimmed);
    if (!match) return null;
    const value = Number.parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const unitMs =
      unit === 'ms'
        ? 1
        : unit === 's'
        ? 1000
        : unit === 'm'
        ? 60 * 1000
        : unit === 'h'
        ? 60 * 60 * 1000
        : 24 * 60 * 60 * 1000;
    return {
      label: trimmed,
      durationMs: value * unitMs
    };
  }
  if (typeof spec === 'object') {
    if (!Number.isFinite(spec.durationMs)) {
      return null;
    }
    const label = typeof spec.label === 'string' && spec.label.trim().length > 0
      ? spec.label.trim()
      : `${Math.round(spec.durationMs / (24 * 60 * 60 * 1000))}d`;
    return {
      label,
      durationMs: spec.durationMs
    };
  }
  return null;
}

function computeQualityMetrics(records, validatorsStakeMap, windowLabel) {
  const qualityTotals = {
    global: 0,
    perAgent: new Map(),
    perNode: new Map(),
    perValidator: new Map()
  };

  let globalWeight = 0;

  for (const { record, validations } of records) {
    if (!validations.length) {
      continue;
    }
    const scores = validations
      .map((entry) => entry.score)
      .filter((value) => Number.isFinite(value));
    if (!scores.length) {
      continue;
    }
    const medianScore = computePercentile(scores, 0.5);
    const unitStake = validations.reduce((sum, entry) => sum + (entry.stake ?? 0), 0);
    const totalStake = Array.from(validatorsStakeMap.values()).reduce((sum, stake) => sum + stake, 0);
    const weight = totalStake > 0 && unitStake > 0 ? unitStake / totalStake : 0;
    globalWeight += weight;
    qualityTotals.global += medianScore * weight;

    if (record.agent) {
      const previous = qualityTotals.perAgent.get(record.agent) ?? 0;
      qualityTotals.perAgent.set(record.agent, previous + medianScore * weight);
    }
    if (record.node) {
      const previous = qualityTotals.perNode.get(record.node) ?? 0;
      qualityTotals.perNode.set(record.node, previous + medianScore * weight);
    }
    if (totalStake > 0 && unitStake > 0) {
      validations.forEach((entry) => {
        const validatorWeight = entry.stake / totalStake;
        const previous = qualityTotals.perValidator.get(entry.validator) ?? 0;
        qualityTotals.perValidator.set(entry.validator, previous + medianScore * validatorWeight);
      });
    }
  }

  if (globalWeight > 0) {
    qualityTotals.global = qualityTotals.global;
  }

  return {
    window: windowLabel,
    global: Number.isFinite(qualityTotals.global) ? qualityTotals.global : 0,
    perAgent: Object.fromEntries(
      Array.from(qualityTotals.perAgent.entries()).map(([agent, value]) => [agent, value])
    ),
    perNode: Object.fromEntries(
      Array.from(qualityTotals.perNode.entries()).map(([node, value]) => [node, value])
    ),
    perValidator: Object.fromEntries(
      Array.from(qualityTotals.perValidator.entries()).map(([validator, value]) => [validator, value])
    )
  };
}

function computeMetricsForWindow({
  units,
  validatorsStakeMap,
  thresholdSeconds,
  windowLabel
}) {
  const mintedRecords = [];
  const acceptedRecords = [];
  const durationSamples = [];
  let totalSlash = 0;
  const validatorStakeWindow = new Map();

  const filteredRecords = [];
  const agentBreakdowns = new Map();
  const nodeBreakdowns = new Map();
  const validatorBreakdowns = new Map();

  function ensureBreakdown(map, key, initializer = () => ({
    minted: 0,
    accepted: 0,
    slashes: 0,
    stake: 0,
    durations: []
  })) {
    if (!key) {
      return null;
    }
    if (!map.has(key)) {
      map.set(key, initializer());
    }
    return map.get(key);
  }

  for (const record of units.values()) {
    if (record.mintedAt === null || record.mintedAt === undefined) {
      continue;
    }
    if (thresholdSeconds !== null && record.mintedAt < thresholdSeconds) {
      continue;
    }

    const validations = record.validations.filter((entry) => {
      if (thresholdSeconds === null) return true;
      if (entry.timestamp === null || entry.timestamp === undefined) return true;
      return entry.timestamp >= thresholdSeconds;
    });

    if (record.agent) {
      ensureBreakdown(agentBreakdowns, record.agent).minted += 1;
    }
    if (record.node) {
      ensureBreakdown(nodeBreakdowns, record.node).minted += 1;
    }

    validations.forEach((entry) => {
      const previous = validatorStakeWindow.get(entry.validator) ?? 0;
      const stake = entry.stake ?? 0;
      if (stake > previous) {
        validatorStakeWindow.set(entry.validator, stake);
      }
    });

    const uniqueValidators = new Set();

    validations.forEach((entry) => {
      const { validator, stake = 0 } = entry;
      if (validator) {
        uniqueValidators.add(validator);
        const validatorMetrics = ensureBreakdown(
          validatorBreakdowns,
          validator,
          () => ({ minted: 0, accepted: 0, slashes: 0, stake: 0, durations: [], validations: 0 })
        );
        validatorMetrics.validations += 1;
        if (stake > validatorMetrics.stake) {
          validatorMetrics.stake = stake;
        }
      }
      if (record.agent) {
        const agentMetrics = ensureBreakdown(agentBreakdowns, record.agent);
        agentMetrics.stake += stake;
      }
      if (record.node) {
        const nodeMetrics = ensureBreakdown(nodeBreakdowns, record.node);
        nodeMetrics.stake += stake;
      }
    });

    uniqueValidators.forEach((validator) => {
      const validatorMetrics = ensureBreakdown(
        validatorBreakdowns,
        validator,
        () => ({ minted: 0, accepted: 0, slashes: 0, stake: 0, durations: [], validations: 0 })
      );
      validatorMetrics.minted += 1;
    });

    const slashes = record.slashes.filter((entry) => {
      if (thresholdSeconds === null) return true;
      if (entry.timestamp === null || entry.timestamp === undefined) return true;
      return entry.timestamp >= thresholdSeconds;
    });

    totalSlash += slashes.reduce((sum, entry) => sum + (entry.amount ?? 0), 0);

    slashes.forEach((entry) => {
      const slashAmount = entry.amount ?? 0;
      if (record.agent) {
        ensureBreakdown(agentBreakdowns, record.agent).slashes += slashAmount;
      }
      if (record.node) {
        ensureBreakdown(nodeBreakdowns, record.node).slashes += slashAmount;
      }
      if (entry.validator) {
        ensureBreakdown(
          validatorBreakdowns,
          entry.validator,
          () => ({ minted: 0, accepted: 0, slashes: 0, stake: 0, durations: [], validations: 0 })
        ).slashes += slashAmount;
      }
    });

    filteredRecords.push({ record, validations });

    mintedRecords.push(record);
    if (record.acceptedAt !== null && record.acceptedAt !== undefined) {
      acceptedRecords.push(record);
      const latency = record.acceptedAt - record.mintedAt;
      if (Number.isFinite(latency) && latency >= 0) {
        durationSamples.push(latency);
      }
      if (record.agent) {
        const agentMetrics = ensureBreakdown(agentBreakdowns, record.agent);
        agentMetrics.accepted += 1;
        if (Number.isFinite(latency) && latency >= 0) {
          agentMetrics.durations.push(latency);
        }
      }
      if (record.node) {
        const nodeMetrics = ensureBreakdown(nodeBreakdowns, record.node);
        nodeMetrics.accepted += 1;
        if (Number.isFinite(latency) && latency >= 0) {
          nodeMetrics.durations.push(latency);
        }
      }
      const durationValue = Number.isFinite(latency) && latency >= 0 ? latency : null;
      uniqueValidators.forEach((validator) => {
        const validatorMetrics = ensureBreakdown(
          validatorBreakdowns,
          validator,
          () => ({ minted: 0, accepted: 0, slashes: 0, stake: 0, durations: [], validations: 0 })
        );
        validatorMetrics.accepted += 1;
        if (durationValue !== null) {
          validatorMetrics.durations.push(durationValue);
        }
      });
    }
  }

  const totalStake = Array.from(validatorStakeWindow.values()).reduce((sum, stake) => sum + stake, 0);
  const acceptanceRate = mintedRecords.length === 0 ? 0 : acceptedRecords.length / mintedRecords.length;
  const onTimeP95Seconds = durationSamples.length ? computePercentile(durationSamples, 0.95) : 0;
  const netAccepted = acceptedRecords.length - totalSlash;
  const slashingAdjustedYield = totalStake > 0 ? netAccepted / totalStake : 0;

  const quality = computeQualityMetrics(filteredRecords, validatorStakeWindow, windowLabel);

  function finalizeBreakdown(map, { includeValidations = false } = {}) {
    return Object.fromEntries(
      Array.from(map.entries()).map(([key, metrics]) => {
        const minted = Number.isFinite(metrics.minted) ? metrics.minted : 0;
        const accepted = Number.isFinite(metrics.accepted) ? metrics.accepted : 0;
        const slashes = Number.isFinite(metrics.slashes) ? metrics.slashes : 0;
        const stake = Number.isFinite(metrics.stake) ? metrics.stake : 0;
        const acceptanceRate = minted > 0 ? accepted / minted : 0;
        const onTime = metrics.durations?.length ? computePercentile(metrics.durations, 0.95) : 0;
        const net = accepted - slashes;
        const yieldValue = stake > 0 ? net / stake : 0;
        const base = {
          minted,
          accepted,
          acceptanceRate,
          onTimeP95Seconds: onTime,
          stake,
          slashes,
          slashingAdjustedYield: yieldValue
        };
        if (includeValidations) {
          base.validations = Number.isFinite(metrics.validations) ? metrics.validations : minted;
          base.validated = minted;
        }
        return [key, base];
      })
    );
  }

  return {
    window: windowLabel,
    totals: {
      minted: mintedRecords.length,
      accepted: acceptedRecords.length,
      slashes: totalSlash,
      totalStake
    },
    acceptanceRate,
    onTimeP95Seconds,
    slashingAdjustedYield,
    quality,
    validators: Object.fromEntries(Array.from(validatorStakeWindow.entries())),
    breakdowns: {
      agents: finalizeBreakdown(agentBreakdowns),
      nodes: finalizeBreakdown(nodeBreakdowns),
      validators: finalizeBreakdown(validatorBreakdowns, { includeValidations: true })
    }
  };
}

export function createAlphaWorkUnitRegistry({ clock = () => Date.now(), windows = DEFAULT_WINDOWS } = {}) {
  const units = new Map();
  const validatorStake = new Map();

  const normalizedWindows = windows
    .map((spec) => parseWindowSpec(spec))
    .filter((entry) => entry && entry.durationMs > 0);

  function ensureUnit(rawId) {
    const id = normalizeWorkUnitId(rawId);
    if (!units.has(id)) {
      units.set(id, {
        id,
        agent: null,
        node: null,
        mintedAt: null,
        acceptedAt: null,
        validations: [],
        slashes: []
      });
    }
    return units.get(id);
  }

  function recordMint({ id, agent = null, node = null, timestamp = null }) {
    const unit = ensureUnit(id);
    unit.agent = normalizeAddress(agent);
    unit.node = normalizeAddress(node);
    const fallback = nowSeconds(clock);
    unit.mintedAt = normalizeTimestampSeconds(timestamp, fallback);
    return cloneRecord(unit);
  }

  function recordValidation({ id, validator, stake = null, score = null, timestamp = null }) {
    if (!validator) {
      throw new Error('validator address is required for validation');
    }
    const unit = ensureUnit(id);
    const normalizedValidator = normalizeAddress(validator);
    const normalizedStake = toNonNegativeNumber(stake) ?? 0;
    const normalizedScore = normalizeScore(score);
    const fallback = unit.mintedAt ?? nowSeconds(clock);
    const normalizedTimestamp = normalizeTimestampSeconds(timestamp, fallback);

    unit.validations.push({
      validator: normalizedValidator,
      stake: normalizedStake,
      score: normalizedScore,
      timestamp: normalizedTimestamp
    });

    if (normalizedValidator) {
      const previous = validatorStake.get(normalizedValidator) ?? 0;
      if (normalizedStake > previous) {
        validatorStake.set(normalizedValidator, normalizedStake);
      }
    }

    return cloneRecord(unit);
  }

  function recordAcceptance({ id, timestamp = null }) {
    const unit = ensureUnit(id);
    const fallback = unit.mintedAt ?? nowSeconds(clock);
    unit.acceptedAt = normalizeTimestampSeconds(timestamp, fallback);
    return cloneRecord(unit);
  }

  function recordSlash({ id, validator = null, amount = null, timestamp = null }) {
    const unit = ensureUnit(id);
    const normalizedValidator = normalizeAddress(validator);
    const normalizedAmount = toNonNegativeNumber(amount) ?? 0;
    const fallback = unit.mintedAt ?? nowSeconds(clock);
    const normalizedTimestamp = normalizeTimestampSeconds(timestamp, fallback);

    unit.slashes.push({
      validator: normalizedValidator,
      amount: normalizedAmount,
      timestamp: normalizedTimestamp
    });

    return cloneRecord(unit);
  }

  function getUnit(id) {
    if (!id) return null;
    const normalized = normalizeWorkUnitId(id);
    const unit = units.get(normalized);
    return cloneRecord(unit);
  }

  function getMetrics({ windows: customWindows } = {}) {
    const windowSpecs = (customWindows && customWindows.length ? customWindows : normalizedWindows)
      .map((spec) => parseWindowSpec(spec))
      .filter((entry) => entry && entry.durationMs > 0);

    const now = nowSeconds(clock);
    const overall = computeMetricsForWindow({
      units,
      validatorsStakeMap: validatorStake,
      thresholdSeconds: null,
      windowLabel: 'all'
    });

    const windowMetrics = windowSpecs.map((spec) =>
      computeMetricsForWindow({
        units,
        validatorsStakeMap: validatorStake,
        thresholdSeconds: now - spec.durationMs / 1000,
        windowLabel: spec.label
      })
    );

    return {
      overall,
      windows: windowMetrics
    };
  }

  function exportState() {
    return {
      units: Array.from(units.values()).map((record) => cloneRecord(record)),
      validatorStake: Object.fromEntries(Array.from(validatorStake.entries()))
    };
  }

  return {
    recordMint,
    recordValidation,
    recordAcceptance,
    recordSlash,
    getMetrics,
    getUnit,
    exportState
  };
}

export { DEFAULT_WINDOWS };
