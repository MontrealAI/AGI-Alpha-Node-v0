import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signAlphaWu } from '../src/crypto/signing.js';
import { createAlphaWorkUnitValidator } from '../src/validation/alpha_wu_validator.js';
import { createQuorumEngine } from '../src/settlement/quorumEngine.js';

const attestorKey = '0x59c6995e998f97a5a0044966f0945386f0b0c9cc1fa50bdbeeb29f44cbeb2c82';
const validatorKeys = [
  '0x8b3a350cf5c34c9194ca5b9ce735ffdac58fb5cae5be7c3f5e8c4b9f2e888d8f',
  '0x6cde7f7f9b0ba3e8e3c0f8f6bf3b9ef6c1d7f9f6b9c3e7f4f9e6d3c1b8a6f4d2',
  '0x1899a3b3fbe6e5acda8a0c4b46f1b6c8e3f7a1b2c3d4e5f6a7b8c9d0e1f2a3b4'
];

function buildUnsignedAlphaWu(weight) {
  return {
    job_id: 'job-quorum-1',
    wu_id: 'job-quorum-1:segment-0',
    role: 'executor',
    alpha_wu_weight: weight,
    model_runtime: {
      name: 'LLM-70B',
      version: '1.0.0',
      runtime_type: 'container'
    },
    inputs_hash: '0x' + '44'.repeat(32),
    outputs_hash: '0x' + '55'.repeat(32),
    wall_clock_ms: 2000,
    cpu_sec: 100,
    gpu_sec: 45,
    energy_kwh: 2.1,
    node_ens_name: 'quorum.alpha.eth',
    attestor_address: '0x0000000000000000000000000000000000000000',
    attestor_sig: '0x',
    created_at: new Date('2024-06-01T00:00:00Z').toISOString()
  };
}

describe('quorum engine', () => {
  beforeEach(() => {
    process.env.NODE_PRIVATE_KEY = attestorKey;
  });

  afterEach(() => {
    delete process.env.NODE_PRIVATE_KEY;
  });

  it('declares acceptance when quorum passes', async () => {
    const unsigned = buildUnsignedAlphaWu(100);
    const signed = await signAlphaWu(unsigned);
    const engine = createQuorumEngine({ minimumVotes: 3, quorumNumerator: 2, quorumDenominator: 3 });
    const settlements = [];
    engine.on('settled', (payload) => settlements.push(payload));

    for (let i = 0; i < validatorKeys.length; i += 1) {
      const validator = createAlphaWorkUnitValidator({
        privateKey: validatorKeys[i],
        expectedAttestor: signed.attestor_address,
        nodeEnsName: 'quorum.alpha.eth'
      });
      const result = await validator.validate(signed);
      engine.ingest(result);
    }

    expect(settlements).toHaveLength(1);
    expect(settlements[0].status).toBe('accepted');
    expect(settlements[0].wuId).toBe(signed.wu_id);
  });

  it('declares rejection when quorum fails', async () => {
    const unsigned = buildUnsignedAlphaWu(150);
    const signed = await signAlphaWu(unsigned);
    const engine = createQuorumEngine({ minimumVotes: 3, quorumNumerator: 2, quorumDenominator: 3 });
    const settlements = [];
    engine.on('settled', (payload) => settlements.push(payload));

    const validatorSuccess = createAlphaWorkUnitValidator({
      privateKey: validatorKeys[0],
      expectedAttestor: signed.attestor_address,
      nodeEnsName: 'quorum.alpha.eth'
    });
    const validatorFailure = createAlphaWorkUnitValidator({
      privateKey: validatorKeys[1],
      expectedAttestor: '0x000000000000000000000000000000000000dead',
      nodeEnsName: 'quorum.alpha.eth'
    });
    const validatorFailureTwo = createAlphaWorkUnitValidator({
      privateKey: validatorKeys[2],
      expectedAttestor: '0x000000000000000000000000000000000000dead',
      nodeEnsName: 'quorum.alpha.eth'
    });

    const validResult = await validatorSuccess.validate(signed);
    const invalidResultOne = await validatorFailure.validate(signed);
    const invalidResultTwo = await validatorFailureTwo.validate(signed);

    engine.ingest(validResult);
    engine.ingest(invalidResultOne);
    engine.ingest(invalidResultTwo);

    expect(settlements).toHaveLength(1);
    expect(settlements[0].status).toBe('rejected');
  });
});
