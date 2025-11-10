import fs from 'node:fs';
import path from 'node:path';
import pino from 'pino';

const DEFAULT_MODELS = [
  {
    name: 'atlas',
    domains: ['energy', 'infrastructure'],
    reliability: 0.92,
    capability: 0.88,
    description: 'Grid optimisation heuristics optimised for deterministic offline execution.'
  },
  {
    name: 'helix-local',
    domains: ['biotech', 'health'],
    reliability: 0.87,
    capability: 0.81,
    description: 'Bio-synthesis modelling approximations with conservative safety margins.'
  },
  {
    name: 'vault-local',
    domains: ['finance', 'governance'],
    reliability: 0.9,
    capability: 0.84,
    description: 'Financial hedging and policy triage heuristics derived from historic on-chain data.'
  }
];

const DEFAULT_CONTEXT = {
  source: 'embedded-defaults',
  models: DEFAULT_MODELS
};

function readModelFile(modelPath) {
  const resolved = path.resolve(modelPath);
  const payload = fs.readFileSync(resolved, 'utf8');
  const parsed = JSON.parse(payload);
  const models = Array.isArray(parsed?.models) ? parsed.models : Array.isArray(parsed) ? parsed : null;
  if (!models || models.length === 0) {
    throw new Error('Model definition file does not contain any models');
  }
  return { source: resolved, models };
}

export function loadLocalModels({
  modelPath = process.env.LOCAL_MODEL_PATH,
  logger = pino({ level: 'info', name: 'local-model-loader' })
} = {}) {
  if (!modelPath) {
    return DEFAULT_CONTEXT;
  }

  try {
    const context = readModelFile(modelPath);
    logger.info({ source: context.source, total: context.models.length }, 'Loaded local model definitions');
    return context;
  } catch (error) {
    logger.warn(
      {
        modelPath,
        error: error.message
      },
      'Failed to load local model definitions – falling back to embedded defaults'
    );
    return DEFAULT_CONTEXT;
  }
}

function scoreModelForTask(model, task) {
  const domains = Array.isArray(model?.domains) ? model.domains.map((domain) => domain.toLowerCase()) : [];
  const taskDomain = typeof task?.domain === 'string' ? task.domain.toLowerCase() : null;
  const domainBonus = taskDomain && domains.includes(taskDomain) ? 0.45 : 0.2;
  const reliability = Number.isFinite(model?.reliability) ? model.reliability : 0.75;
  const capability = Number.isFinite(model?.capability) ? model.capability : 0.7;
  const complexity = Number.isFinite(task?.complexity) ? task.complexity : 5;

  const normalizedComplexity = Math.min(Math.max(complexity / 10, 0), 1);
  const score = domainBonus + reliability * 0.35 + capability * 0.25 - normalizedComplexity * 0.05;
  return Math.min(Math.max(score, 0.1), 0.99);
}

function buildAssignment(task, model, score) {
  return {
    task: task?.name ?? 'task',
    domain: task?.domain ?? 'general',
    model: model?.name ?? 'generalist',
    confidence: Number.parseFloat(score.toFixed(3)),
    reasoning:
      model?.description ??
      'Assigned to local heuristic model based on domain affinity and reliability profile.'
  };
}

export function simulateLocalInference({
  jobProfile,
  tasks,
  models,
  logger = pino({ level: 'info', name: 'local-model-runtime' })
} = {}) {
  const availableTasks = Array.isArray(tasks) && tasks.length ? tasks : [];
  const availableModels = Array.isArray(models) && models.length ? models : DEFAULT_MODELS;

  const assignments = availableTasks.map((task) => {
    const scored = availableModels
      .map((model) => ({ model, score: scoreModelForTask(model, task) }))
      .sort((a, b) => b.score - a.score);
    const best = scored[0] ?? { model: null, score: 0.5 };
    return buildAssignment(task, best.model, best.score);
  });

  const totalConfidence = assignments.reduce((sum, item) => sum + item.confidence, 0);
  const averageConfidence = assignments.length ? totalConfidence / assignments.length : 0;
  const modelsUsed = Array.from(new Set(assignments.map((assignment) => assignment.model)));

  const summary = {
    job: jobProfile?.name ?? 'mission',
    assignments,
    throughput: assignments.length,
    averageConfidence: Number.parseFloat(averageConfidence.toFixed(3)),
    modelsUsed
  };

  logger.debug?.({
    job: summary.job,
    throughput: summary.throughput,
    modelsUsed: summary.modelsUsed
  }, 'Local model inference executed');

  return summary;
}

export { DEFAULT_MODELS };
