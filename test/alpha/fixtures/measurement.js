import { digest } from '../../../src/alpha/mission.js';
export const measurementContract = {
  taskKey: 'fixture-task',
  method: 'paired-value-v1',
  unit: 'USD',
  periodSeconds: 1,
  workloadHash: digest('explicitly synthetic fixed workload'),
  acceptanceHash: digest('all fixture outputs equal reference'),
};
export function measurementFixture(
  i = 0,
  {
    now = Date.now(),
    baselineCost = 100,
    candidateCost = 20,
    overhead = 5,
  } = {},
) {
  const start = now - 100000 + i * 3000,
    time = (n) => new Date(start + n * 1000).toISOString();
  return {
    kind: 'paired-value-v1',
    evidenceClass: 'observed',
    contract: structuredClone(measurementContract),
    baseline: {
      startedAt: time(0),
      endedAt: time(1),
      workUnits: 100,
      acceptedUnits: 100,
      grossValueUsd: 0,
      operatingCostUsd: baselineCost,
    },
    candidate: {
      startedAt: time(1),
      endedAt: time(2),
      workUnits: 100,
      acceptedUnits: 100,
      grossValueUsd: 0,
      operatingCostUsd: candidateCost,
    },
    overhead: {
      inferenceUsd: 0,
      executionUsd: 0,
      reviewUsd: overhead,
      infrastructureUsd: 0,
      settlementUsd: 0,
      otherUsd: 0,
    },
    humanMinutes: 2,
    artifacts: [
      {
        sha256: digest(`synthetic-artifact-${i}`),
        description: 'Explicit synthetic test measurements',
      },
    ],
    observedAt: time(2),
    evidence:
      'Synthetic fixture; no measured profit, live commissioning or independent people.',
  };
}
