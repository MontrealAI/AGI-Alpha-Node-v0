function validateScenario(scenario, index) {
  if (!scenario || typeof scenario !== 'object') {
    throw new Error(`Scenario at index ${index} must be an object`);
  }
  const { name, loadFactor, errorRate, downtimeMinutes, financialExposure } = scenario;
  if (!name) {
    throw new Error(`Scenario at index ${index} requires a name`);
  }
  if (!Number.isFinite(loadFactor) || loadFactor <= 0) {
    throw new Error(`Scenario ${name} must have loadFactor > 0`);
  }
  if (!Number.isFinite(errorRate) || errorRate < 0) {
    throw new Error(`Scenario ${name} must have errorRate >= 0`);
  }
  return {
    name,
    loadFactor,
    errorRate,
    downtimeMinutes: Number.isFinite(downtimeMinutes) ? downtimeMinutes : 0,
    financialExposure: Number.isFinite(financialExposure) ? financialExposure : 0
  };
}

function computeResilienceScore(scenario, baseline) {
  const loadPenalty = scenario.loadFactor / Math.max(baseline.capacityIndex, 1);
  const errorPenalty = scenario.errorRate / Math.max(baseline.errorBudget, 0.01);
  const downtimePenalty = scenario.downtimeMinutes / Math.max(baseline.downtimeBudget, 1);
  const exposurePenalty = scenario.financialExposure / Math.max(baseline.financialBuffer, 1);
  const combinedPenalty = loadPenalty * 0.35 + errorPenalty * 0.25 + downtimePenalty * 0.2 + exposurePenalty * 0.2;
  const rawScore = Math.max(0, 1.25 - combinedPenalty);
  return Number(rawScore.toFixed(3));
}

export function assessAntifragility({
  baseline,
  scenarios,
  remediationBias = 0.65
}) {
  if (!baseline || typeof baseline !== 'object') {
    throw new Error('baseline metrics are required');
  }
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    throw new Error('scenarios must contain at least one entry');
  }
  const normalizedBaseline = {
    capacityIndex: Number.isFinite(baseline.capacityIndex) ? baseline.capacityIndex : 1,
    errorBudget: Number.isFinite(baseline.errorBudget) ? baseline.errorBudget : 0.05,
    downtimeBudget: Number.isFinite(baseline.downtimeBudget) ? baseline.downtimeBudget : 15,
    financialBuffer: Number.isFinite(baseline.financialBuffer) ? baseline.financialBuffer : 100_000
  };
  const normalizedScenarios = scenarios.map(validateScenario);

  const evaluations = normalizedScenarios.map((scenario) => ({
    scenario,
    resilienceScore: computeResilienceScore(scenario, normalizedBaseline),
    improvementPlan: {
      capacity: Number((scenario.loadFactor * remediationBias).toFixed(2)),
      redundancy: Number((scenario.errorRate * (1 + remediationBias)).toFixed(2)),
      coverageMinutes: Math.ceil(scenario.downtimeMinutes * (1 + remediationBias)),
      insuranceBuffer: Math.ceil(scenario.financialExposure * (1 + remediationBias))
    }
  }));

  const antifragileGain = evaluations.reduce((sum, entry) => sum + (1 - entry.resilienceScore), 0);
  const recommendedFocus = evaluations
    .slice()
    .sort((a, b) => a.resilienceScore - b.resilienceScore)
    .slice(0, 2)
    .map((entry) => entry.scenario.name);

  return {
    baseline: normalizedBaseline,
    evaluations,
    antifragileGain: Number(antifragileGain.toFixed(3)),
    recommendedFocus
  };
}
