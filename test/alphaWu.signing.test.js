import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signAlphaWu, verifyAlphaWu } from '../src/crypto/signing.js';
import { validateAlphaWu } from '../src/types/alphaWu.js';

function buildUnsignedAlphaWu() {
  return {
    job_id: 'job-telemetry-1',
    wu_id: 'job-telemetry-1:segment-0',
    role: 'executor',
    alpha_wu_weight: 64.125,
    model_runtime: {
      name: 'LLM-70B',
      version: '1.0.0',
      runtime_type: 'container'
    },
    inputs_hash: '0x' + '11'.repeat(32),
    outputs_hash: '0x' + '22'.repeat(32),
    wall_clock_ms: 12_345,
    cpu_sec: 42.125,
    gpu_sec: 600.25,
    energy_kwh: 1.234,
    node_ens_name: 'node.alpha.eth',
    attestor_address: '0x0000000000000000000000000000000000000000',
    attestor_sig: '0x',
    created_at: new Date('2024-03-01T00:00:00Z').toISOString()
  };
}

describe('α-WU signing primitives', () => {
  const privateKey = '0x59c6995e998f97a5a0044966f0945386f0b0c9cc1fa50bdbeeb29f44cbeb2c82';

  beforeEach(() => {
    process.env.NODE_PRIVATE_KEY = privateKey;
  });

  afterEach(() => {
    delete process.env.NODE_PRIVATE_KEY;
  });

  it('signs and verifies α-WU payloads using the configured attestor key', async () => {
    const unsigned = buildUnsignedAlphaWu();
    const signed = await signAlphaWu(unsigned);

    expect(signed.attestor_sig).toMatch(/^0x[0-9a-f]{130}$/i);
    expect(signed.attestor_address).not.toBe(unsigned.attestor_address);
    expect(verifyAlphaWu(signed)).toBe(true);

    const validated = validateAlphaWu(signed);
    expect(validated.job_id).toBe(unsigned.job_id);
    expect(validated.outputs_hash).toBe(unsigned.outputs_hash);
  });

  it('rejects tampered payloads after signing', async () => {
    const unsigned = buildUnsignedAlphaWu();
    const signed = await signAlphaWu(unsigned);

    const tampered = {
      ...signed,
      wall_clock_ms: signed.wall_clock_ms + 1
    };

    expect(verifyAlphaWu(tampered)).toBe(false);
  });
});
