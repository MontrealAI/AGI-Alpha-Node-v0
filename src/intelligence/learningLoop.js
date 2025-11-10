function validateHistoryEntry(entry, index) {
  if (!entry || typeof entry !== 'object') {
    throw new Error(`History entry at index ${index} must be an object`);
  }
  const { difficulty, successRate, reward } = entry;
  if (!Number.isFinite(difficulty)) {
    throw new Error(`History entry ${index} missing difficulty`);
  }
  if (!Number.isFinite(successRate)) {
    throw new Error(`History entry ${index} missing successRate`);
  }
  if (!Number.isFinite(reward)) {
    throw new Error(`History entry ${index} missing reward`);
  }
  return {
    difficulty,
    successRate,
    reward
  };
}

function computeMomentum(history) {
  const window = history.slice(-3);
  const avgSuccess = window.reduce((sum, entry) => sum + entry.successRate, 0) / window.length;
  const avgReward = window.reduce((sum, entry) => sum + entry.reward, 0) / window.length;
  const avgDifficulty = window.reduce((sum, entry) => sum + entry.difficulty, 0) / window.length;
  return { avgSuccess, avgReward, avgDifficulty };
}

export function runCurriculumEvolution({
  history,
  explorationBias = 0.2,
  shockFactor = 0.1,
  targetSuccessFloor = 0.78
}) {
  if (!Array.isArray(history) || history.length === 0) {
    throw new Error('history must contain at least one entry');
  }
  if (explorationBias < 0 || explorationBias > 1) {
    throw new RangeError('explorationBias must be between 0 and 1');
  }
  if (shockFactor < 0 || shockFactor > 1) {
    throw new RangeError('shockFactor must be between 0 and 1');
  }

  const normalizedHistory = history.map(validateHistoryEntry);
  const momentum = computeMomentum(normalizedHistory);

  const baselineAdjustment = momentum.avgSuccess > targetSuccessFloor ? 1 + explorationBias : 1 - shockFactor;
  const dynamicAdjustment = Math.max(1, (momentum.avgReward + momentum.avgSuccess) / 1.5);
  const adjustedDifficulty = Math.max(0.1, momentum.avgDifficulty * baselineAdjustment * dynamicAdjustment);

  const curriculum = {
    nextDifficulty: Number(adjustedDifficulty.toFixed(2)),
    explorationBias,
    shockFactor,
    trend: momentum,
    status: momentum.avgSuccess >= targetSuccessFloor ? 'expanding' : 'stabilizing'
  };

  const generatedChallenges = Array.from({ length: 3 }, (_, index) => ({
    name: `self-evolved-challenge-${index + 1}`,
    difficulty: Number((curriculum.nextDifficulty * (1 + index * 0.05)).toFixed(2)),
    rewardMultiplier: Number((1 + explorationBias + index * 0.03).toFixed(2)),
    validationThreshold: Number((targetSuccessFloor + index * 0.02).toFixed(2))
  }));

  return {
    curriculum,
    generatedChallenges,
    historicalWindow: normalizedHistory
  };
}
