import pino from 'pino';
import { roundTo } from '../constants/workUnits.js';
import { initializeDatabase } from '../persistence/database.js';
import {
  EnergyReportRepository,
  ProviderRepository,
  QualityEvaluationRepository,
  SyntheticLaborScoreRepository,
  TaskRunRepository,
  TaskTypeRepository
} from '../persistence/repositories.js';

const REFERENCE_TOKENS = 8000;
const REFERENCE_TOOL_CALLS = 3;
const REFERENCE_STEPS = 6;
const BASELINE_ENERGY_PRICE = 0.12; // USD per kWh reference
const BASELINE_KWH_PER_SLU = 0.5;
const BASELINE_QUALITY = 0.9;
const MIN_ENERGY_ADJUSTMENT = 0.25;
const MAX_ENERGY_ADJUSTMENT = 1.75;
const MIN_QUALITY_ADJUSTMENT = 0.5;
const MAX_QUALITY_ADJUSTMENT = 1.5;
const MIN_CONSENSUS_FACTOR = 0.7;
const MAX_CONSENSUS_FACTOR = 1.1;

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function toDateOnly(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

function normalizeMetric(value, reference, floor = 0.25, ceiling = 4) {
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(reference) || reference <= 0) {
    return 1;
  }
  return clamp(value / reference, floor, ceiling);
}

export function computeDifficultyCoefficient(taskType, metrics = {}) {
  const base = Number(taskType?.difficulty_coefficient ?? 1) || 1;
  const tokens = metrics.tokens_processed ?? metrics.token_count ?? 0;
  const toolCalls = metrics.tool_calls ?? 0;
  const steps = metrics.steps ?? metrics.step_count ?? metrics?.metadata?.steps ?? 0;

  const tokenIntensity = normalizeMetric(tokens, REFERENCE_TOKENS, 0.25, 3.5);
  const toolIntensity = normalizeMetric(Math.sqrt(toolCalls || 1), Math.sqrt(REFERENCE_TOOL_CALLS), 0.5, 2.5);
  const stepIntensity = normalizeMetric(steps || REFERENCE_STEPS, REFERENCE_STEPS, 0.5, 2.5);

  const providedSignals = [tokenIntensity, toolIntensity, stepIntensity].filter((value) => Number.isFinite(value));
  const blended = providedSignals.length
    ? providedSignals.reduce((acc, value) => acc + value, 0) / providedSignals.length
    : 1;

  return roundTo(base * blended, 4);
}

function computeEnergyAdjustment({ rawThroughput, totalCostUsd, totalKwh }) {
  if (!Number.isFinite(rawThroughput) || rawThroughput <= 0) {
    return { energyAdjustment: 1, metadata: { energyCostPerSlu: null, baselineCostPerSlu: null } };
  }

  const observedCost = Number.isFinite(totalCostUsd) && totalCostUsd > 0
    ? totalCostUsd
    : Number.isFinite(totalKwh) && totalKwh > 0
      ? totalKwh * BASELINE_ENERGY_PRICE
      : null;

  if (observedCost === null || observedCost <= 0) {
    return { energyAdjustment: 1, metadata: { energyCostPerSlu: null, baselineCostPerSlu: null } };
  }

  const energyCostPerSlu = observedCost / rawThroughput;
  const baselineCostPerSlu = BASELINE_ENERGY_PRICE * BASELINE_KWH_PER_SLU;
  const ratio = baselineCostPerSlu / energyCostPerSlu;
  const energyAdjustment = roundTo(clamp(ratio, MIN_ENERGY_ADJUSTMENT, MAX_ENERGY_ADJUSTMENT), 4);
  return { energyAdjustment, metadata: { energyCostPerSlu, baselineCostPerSlu } };
}

function winsorizeQuality(scores = []) {
  return scores.map((value) => clamp(value, 0.1, 1.75));
}

function computeQualityAdjustment({ qualitySignals }) {
  if (!qualitySignals || qualitySignals.length === 0) {
    return { qualityAdjustment: 1, metadata: { observedQuality: null, baselineQuality: BASELINE_QUALITY } };
  }
  const winsorized = winsorizeQuality(qualitySignals);
  const average = winsorized.reduce((acc, value) => acc + value, 0) / winsorized.length;
  const qualityAdjustment = roundTo(clamp(average / BASELINE_QUALITY, MIN_QUALITY_ADJUSTMENT, MAX_QUALITY_ADJUSTMENT), 4);
  return { qualityAdjustment, metadata: { observedQuality: average, baselineQuality: BASELINE_QUALITY } };
}

function computeConsensusFactor(taskRuns) {
  if (!taskRuns || taskRuns.length === 0) {
    return { consensusFactor: 1, metadata: { reproducibility: null } };
  }
  const runsByTaskType = new Map();
  for (const run of taskRuns) {
    const key = run.task_type_id ?? 'unknown';
    if (!runsByTaskType.has(key)) {
      runsByTaskType.set(key, []);
    }
    runsByTaskType.get(key).push(run);
  }

  const reproducibilityScores = [];
  for (const [, runs] of runsByTaskType.entries()) {
    if (runs.length < 2) continue;
    const completed = runs.filter((run) => run.status === 'completed').length;
    reproducibilityScores.push(completed / runs.length);
  }

  if (reproducibilityScores.length === 0) {
    return { consensusFactor: 1, metadata: { reproducibility: null } };
  }

  const average = reproducibilityScores.reduce((acc, value) => acc + value, 0) / reproducibilityScores.length;
  const consensusFactor = roundTo(clamp(average, MIN_CONSENSUS_FACTOR, MAX_CONSENSUS_FACTOR), 4);
  return { consensusFactor, metadata: { reproducibility: average } };
}

function resolveRunDate(run) {
  return toDateOnly(run.started_at) || toDateOnly(run.completed_at) || toDateOnly(run.created_at);
}

function scoreTaskRuns(taskRuns, taskTypes) {
  let rawThroughput = 0;
  for (const run of taskRuns) {
    const taskType = run.task_type_id ? taskTypes.get(run.task_type_id) : null;
    const difficulty = computeDifficultyCoefficient(taskType, {
      tokens_processed: run.tokens_processed,
      tool_calls: run.tool_calls,
      steps: run.metadata?.steps,
      metadata: run.metadata
    });
    const baseThroughput = Number(run.raw_throughput ?? 0);
    rawThroughput += roundTo(baseThroughput * difficulty, 6);
  }
  return rawThroughput;
}

export class SyntheticLaborEngine {
  constructor({ db = null, logger = pino({ level: 'info', name: 'synthetic-labor-engine' }) } = {}) {
    this.db = db ?? initializeDatabase({ withSeed: true });
    this.logger = logger;
    this.providers = new ProviderRepository(this.db);
    this.taskTypes = new TaskTypeRepository(this.db);
    this.taskRuns = new TaskRunRepository(this.db);
    this.energyReports = new EnergyReportRepository(this.db);
    this.qualityEvaluations = new QualityEvaluationRepository(this.db);
    this.syntheticLaborScores = new SyntheticLaborScoreRepository(this.db);
  }

  listProviders() {
    return this.providers.list();
  }

  computeDailyScoreForProvider(providerId, measurementDate = new Date().toISOString().slice(0, 10)) {
    const taskTypes = new Map(this.taskTypes.list().map((type) => [type.id, type]));
    const runs = this.taskRuns.listByProvider(providerId).filter((run) => resolveRunDate(run) === measurementDate);

    const rawThroughput = scoreTaskRuns(runs, taskTypes);

    let totalKwh = 0;
    let totalCostUsd = 0;
    const qualitySignals = [];

    for (const run of runs) {
      const energyReports = this.energyReports.listForTaskRun(run.id);
      for (const report of energyReports) {
        totalKwh += Number(report.kwh ?? 0);
        if (Number.isFinite(report.cost_usd)) {
          totalCostUsd += Number(report.cost_usd);
        }
      }

      const evaluations = this.qualityEvaluations.listForTaskRun(run.id);
      for (const evaluation of evaluations) {
        qualitySignals.push(Number(evaluation.score));
      }
      if (Number.isFinite(run.quality_score)) {
        qualitySignals.push(Number(run.quality_score));
      }
    }

    const { energyAdjustment, metadata: energyMetadata } = computeEnergyAdjustment({
      rawThroughput,
      totalCostUsd,
      totalKwh
    });

    const { qualityAdjustment, metadata: qualityMetadata } = computeQualityAdjustment({ qualitySignals });
    const { consensusFactor, metadata: consensusMetadata } = computeConsensusFactor(runs);

    const slu = roundTo(rawThroughput * energyAdjustment * qualityAdjustment * consensusFactor, 6);
    const rationale = `Daily SLU for ${measurementDate}`;
    const metadata = {
      energy: energyMetadata,
      quality: qualityMetadata,
      consensus: consensusMetadata,
      totals: { rawThroughput, totalKwh, totalCostUsd }
    };

    const existing = this.syntheticLaborScores.findByProviderAndDate(providerId, measurementDate);
    if (existing) {
      return this.syntheticLaborScores.update(existing.id, {
        raw_throughput: rawThroughput,
        energy_adjustment: energyAdjustment,
        quality_adjustment: qualityAdjustment,
        consensus_factor: consensusFactor,
        slu,
        rationale,
        metadata,
        measurement_date: measurementDate
      });
    }

    return this.syntheticLaborScores.create({
      provider_id: providerId,
      measurement_date: measurementDate,
      raw_throughput: rawThroughput,
      energy_adjustment: energyAdjustment,
      quality_adjustment: qualityAdjustment,
      consensus_factor: consensusFactor,
      slu,
      rationale,
      metadata
    });
  }

  computeDailyScores(measurementDate = new Date().toISOString().slice(0, 10)) {
    const providers = this.listProviders();
    return providers.map((provider) =>
      this.computeDailyScoreForProvider(provider.id, measurementDate)
    );
  }
}

export function createSyntheticLaborEngine(options = {}) {
  return new SyntheticLaborEngine(options);
}
