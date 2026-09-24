import { z } from 'zod';
import { digest, missionSchema, analyzeMission } from '../mission.js';
import { comparableOutcome } from '../measurement.js';

export const adaptivePolicySchema = z
  .object({
    enabled: z.boolean().default(false),
    minSamples: z.number().int().min(2).max(1000).default(3),
    window: z.number().int().min(2).max(1000).default(30),
    priorWeight: z.number().min(1).max(100).default(4),
    maxProbability: z.number().min(0).max(1).default(0.9),
    maxBenefitMultiplier: z.number().min(0).max(1).default(1),
    lossPauseCount: z.number().int().min(1).max(100).default(3),
  })
  .strict();

// The model is task-scoped: only the same recommendation ID supplies observations.
// Outcome signatures have already been verified by loadNode. No source/model text can
// change these controls or grant an execution capability.
export function learnModel(node, recommendation, policy = {}, mission = null) {
  const p = adaptivePolicySchema.parse(policy);
  const eligible = [...node.runs.values()]
    .filter(
      (r) =>
        r.review?.decision === 'accepted' &&
        r.outcome &&
        r.analysis.recommendation === recommendation &&
        comparableOutcome(r, mission),
    )
    .sort(
      (a, b) =>
        a.outcome.measurement.candidate.startedAt.localeCompare(
          b.outcome.measurement.candidate.startedAt,
        ) || a.hash.localeCompare(b.hash),
    );
  let lastEnd = -Infinity;
  const artifacts = new Set();
  const observations = eligible
    .filter((r) => {
      const measurement = r.outcome.measurement;
      const artifactKey = digest(
        measurement.artifacts.map((a) => a.sha256).sort(),
      );
      const start = Date.parse(measurement.candidate.startedAt);
      if (start < lastEnd || artifacts.has(artifactKey)) return false;
      lastEnd = Date.parse(measurement.candidate.endedAt);
      artifacts.add(artifactKey);
      return true;
    })
    .slice(-p.window);
  let successes = 0,
    losses = 0;
  const ratios = [];
  for (const run of observations) {
    const o = run.outcome;
    const expected = run.analysis.rankings.find((x) => x.id === recommendation);
    const net = o.measuredBenefitUsd - o.measuredCostUsd;
    if (net > 0 && o.assessment.qualityPassed) successes++;
    else losses++;
    if (expected?.benefit > 0)
      ratios.push(
        o.assessment.qualityPassed
          ? Math.max(0, Math.min(1, o.measuredBenefitUsd / expected.benefit))
          : 0,
      );
  }
  let consecutiveLosses = 0;
  for (const r of [...observations].reverse()) {
    if (
      r.outcome.measuredBenefitUsd <= r.outcome.measuredCostUsd ||
      !r.outcome.assessment.qualityPassed
    )
      consecutiveLosses++;
    else break;
  }
  return {
    schema: 1,
    kind: 'task-scoped-beta-outcome-model',
    recommendation,
    samples: observations.length,
    excludedOutcomes:
      [...node.runs.values()].filter(
        (r) => r.outcome && r.analysis.recommendation === recommendation,
      ).length - observations.length,
    successes,
    losses,
    consecutiveLosses,
    meanBenefitRatio: ratios.length
      ? ratios.reduce((a, b) => a + b, 0) / ratios.length
      : 1,
    evidence: observations.map((r) => ({
      runHash: r.hash,
      outcomeHash: r.outcome.hash,
    })),
    policy: p,
  };
}
export function planMission(input, node, policy = {}) {
  const original = missionSchema.parse(input);
  const p = adaptivePolicySchema.parse(policy);
  const models = original.opportunities.map((o) =>
    learnModel(node, o.id, p, original),
  );
  const opportunities = original.opportunities.map((o, i) => {
    const m = models[i];
    if (!p.enabled || m.samples < p.minSamples) return o;
    const posterior =
      (o.probability * p.priorWeight + m.successes) /
      (p.priorWeight + m.samples);
    return {
      ...o,
      probability: Math.min(o.probability, p.maxProbability, posterior),
      benefit: o.benefit * Math.min(p.maxBenefitMultiplier, m.meanBenefitRatio),
      rationale: `${o.rationale} Adaptive evidence: ${m.samples} accepted measured outcomes; conservative probability and benefit caps applied.`,
    };
  });
  const adjusted = { ...original, opportunities };
  const analysis = analyzeMission(adjusted);
  const scenarios = [1, 0.75, 0.5, 0].map((benefitFactor) => ({
    benefitFactor,
    rankings: opportunities.map((o) => ({
      id: o.id,
      net:
        o.probability * o.benefit * benefitFactor -
        o.cost -
        (1 - o.probability) * o.downside,
    })),
  }));
  const candidate = analysis.recommendation;
  const lossStop =
    p.enabled &&
    candidate &&
    models.find((m) => m.recommendation === candidate).consecutiveLosses >=
      p.lossPauseCount;
  const selected = lossStop ? null : candidate;
  return {
    schema: 1,
    originalDigest: digest(original),
    mission: adjusted,
    analysis,
    models,
    scenarios,
    selected,
    status: selected ? 'admitted' : 'abstained',
    reason: lossStop
      ? 'Consecutive measured losses reached owner threshold'
      : selected
        ? 'Owner risk policy passed'
        : 'No candidate passes owner policy',
    steps: selected
      ? [
          {
            capability: 'evidence-analysis',
            requires: [],
            opportunity: selected,
          },
          {
            capability: 'risk-review',
            requires: ['evidence-analysis'],
            opportunity: selected,
          },
          {
            capability: 'owner-authorized-action',
            requires: ['risk-review'],
            opportunity: selected,
          },
        ]
      : [],
    limitation:
      'Task-scoped inference from reviewer-attested measurements; not a general world model, causal proof or guaranteed forecast. Adaptation can only tighten supplied probability and benefit.',
  };
}
