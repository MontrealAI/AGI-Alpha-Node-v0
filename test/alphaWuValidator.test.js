import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signAlphaWu } from '../src/crypto/signing.js';
import { createAlphaWorkUnitValidator, verifyValidationResult } from '../src/validation/alpha_wu_validator.js';

const attestorKey = '0x59c6995e998f97a5a0044966f0945386f0b0c9cc1fa50bdbeeb29f44cbeb2c82';
const validatorKey = '0x8b3a350cf5c34c9194ca5b9ce735ffdac58fb5cae5be7c3f5e8c4b9f2e888d8f';

function buildUnsignedAlphaWu() {
  return {
    job_id: 'job-validator-1',
    wu_id: 'job-validator-1:segment-0',
    role: 'executor',
    alpha_wu_weight: 42.125,
    model_runtime: {
      name: 'LLM-8B',
      version: '1.0.0',
      runtime_type: 'container'
    },
    inputs_hash: '0x' + 'aa'.repeat(32),
    outputs_hash: '0x' + 'bb'.repeat(32),
    wall_clock_ms: 5432,
    cpu_sec: 210.5,
    gpu_sec: 120.25,
    energy_kwh: 3.25,
    node_ens_name: 'validator.alpha.eth',
    attestor_address: '0x0000000000000000000000000000000000000000',
    attestor_sig: '0x',
    created_at: new Date('2024-04-01T00:00:00Z').toISOString()
  };
}

describe('alpha work unit validator', () => {
  beforeEach(() => {
    process.env.NODE_PRIVATE_KEY = attestorKey;
  });

  afterEach(() => {
    delete process.env.NODE_PRIVATE_KEY;
    delete process.env.VALIDATOR_PRIVATE_KEY;
  });

  it('produces a signed ValidationResult for valid α-WUs', async () => {
    const unsigned = buildUnsignedAlphaWu();
    const signedWu = await signAlphaWu(unsigned);
    const validator = createAlphaWorkUnitValidator({
      privateKey: validatorKey,
      expectedAttestor: signedWu.attestor_address
    });

    const result = await validator.validate(signedWu);

    expect(result.wu_id).toBe(signedWu.wu_id);
    expect(result.job_id).toBe(signedWu.job_id);
    expect(result.is_valid).toBe(true);
    expect(result.failure_reason).toBeNull();
    expect(result.validator_address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(result.validator_sig).toMatch(/^0x[0-9a-fA-F]{130}$/);
    expect(verifyValidationResult(result, { expectedAddress: validator.validatorAddress })).toBe(true);
  });

  it('flags signature mismatches and annotates the failure reason', async () => {
    const unsigned = buildUnsignedAlphaWu();
    const signedWu = await signAlphaWu(unsigned);
    const tampered = { ...signedWu, outputs_hash: '0x' + 'cc'.repeat(32) };

    const validator = createAlphaWorkUnitValidator({
      privateKey: validatorKey,
      expectedAttestor: signedWu.attestor_address
    });

    const result = await validator.validate(tampered);

    expect(result.is_valid).toBe(false);
    expect(result.failure_reason).toContain('Signature verification failed');
    expect(result.validator_address).toBe(validator.validatorAddress);
    expect(verifyValidationResult(result, { expectedAddress: validator.validatorAddress })).toBe(true);
  });
});
