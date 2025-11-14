import { describe, expect, it } from 'vitest';
import { createAlphaWuTelemetry } from '../src/telemetry/alphaWuTelemetry.js';

function createDeterministicTelemetry() {
  let now = 1_700_000_000_000;
  const clock = () => {
    now += 1_000;
    return now;
  };
  const cpuUsage = (start) => {
    if (!start) {
      return { user: 5_000_000, system: 2_000_000 };
    }
    return {
      user: 9_000_000 - (start.user ?? 0),
      system: 3_000_000 - (start.system ?? 0)
    };
  };
  const telemetry = createAlphaWuTelemetry({
    enabled: true,
    hashAlgorithm: 'sha256',
    nodeEnsName: 'node.alpha.eth',
    attestorAddress: '0x0000000000000000000000000000000000000002',
    clock,
    cpuUsage
  });
  return telemetry;
}

describe('alpha-wu telemetry collector', () => {
  it('captures timing, hashes, and device metrics across lifecycle', () => {
    const telemetry = createDeterministicTelemetry();
    telemetry.beginContext({
      jobId: 'job-1',
      job: {
        jobId: 'job-1',
        tags: ['model:LLM_8B', 'runtime:cuda', 'version:1.0.0']
      }
    });
    telemetry.recordSegment('job-1', {
      segmentId: 'segment-123',
      alphaWU: 12.5,
      startedAt: new Date('2024-01-01T00:00:00Z').toISOString(),
      endedAt: new Date('2024-01-01T00:05:00Z').toISOString(),
      gpuMinutes: 10
    });
    const alphaWu = telemetry.finalize('job-1', {
      outputs: { result: { ok: true } },
      alphaWuWeight: 12.5
    });
    expect(alphaWu).toBeTruthy();
    expect(alphaWu.job_id).toBe('job-1');
    expect(alphaWu.wu_id).toBe('segment-123');
    expect(alphaWu.alpha_wu_weight).toBeCloseTo(12.5, 4);
    expect(alphaWu.wall_clock_ms).toBe(5 * 60 * 1000);
    expect(alphaWu.cpu_sec).toBeCloseTo(5.0, 3);
    expect(alphaWu.gpu_sec).toBeCloseTo(600, 3);
    expect(alphaWu.inputs_hash).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(alphaWu.outputs_hash).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(alphaWu.node_ens_name).toBe('node.alpha.eth');
    expect(alphaWu.attestor_address).toBe('0x0000000000000000000000000000000000000002');
  });
});
