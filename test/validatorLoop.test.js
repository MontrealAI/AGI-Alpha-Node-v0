import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signAlphaWu } from '../src/crypto/signing.js';
import { createAlphaWorkUnitValidator } from '../src/validation/alpha_wu_validator.js';
import { createValidatorLoop } from '../src/validator/validatorLoop.js';
import { createInMemoryAlphaWuSource } from '../src/validator/sources/memorySource.js';
import { createInMemoryValidationSink } from '../src/validator/sinks/memorySink.js';

const attestorKey = '0x59c6995e998f97a5a0044966f0945386f0b0c9cc1fa50bdbeeb29f44cbeb2c82';
const validatorKey = '0x8b3a350cf5c34c9194ca5b9ce735ffdac58fb5cae5be7c3f5e8c4b9f2e888d8f';

function buildUnsignedAlphaWu(index) {
  return {
    job_id: `job-loop-${index}`,
    wu_id: `job-loop-${index}:segment-0`,
    role: 'executor',
    alpha_wu_weight: 32.5,
    model_runtime: {
      name: 'LLM-13B',
      version: '1.0.0',
      runtime_type: 'container'
    },
    inputs_hash: '0x' + '11'.repeat(32),
    outputs_hash: '0x' + '22'.repeat(32),
    wall_clock_ms: 1000 + index,
    cpu_sec: 80 + index,
    gpu_sec: 12,
    energy_kwh: 1.2,
    node_ens_name: 'loop.alpha.eth',
    attestor_address: '0x0000000000000000000000000000000000000000',
    attestor_sig: '0x',
    created_at: new Date('2024-05-01T00:00:00Z').toISOString()
  };
}

describe('validator loop', () => {
  beforeEach(() => {
    process.env.NODE_PRIVATE_KEY = attestorKey;
  });

  afterEach(() => {
    delete process.env.NODE_PRIVATE_KEY;
    delete process.env.VALIDATOR_PRIVATE_KEY;
  });

  it('consumes α-WUs from the source and emits signed validation results', async () => {
    const source = createInMemoryAlphaWuSource();
    const sink = createInMemoryValidationSink();
    const unsignedOne = buildUnsignedAlphaWu(1);
    const unsignedTwo = buildUnsignedAlphaWu(2);
    const signedOne = await signAlphaWu(unsignedOne);
    const signedTwo = await signAlphaWu(unsignedTwo);

    const validator = createAlphaWorkUnitValidator({
      privateKey: validatorKey,
      expectedAttestor: signedOne.attestor_address,
      nodeEnsName: 'loop.alpha.eth'
    });

    const captured = [];
    sink.subscribe(({ result }) => captured.push(result));

    const loop = createValidatorLoop({ source, validator, sink });
    const loopPromise = loop.start();

    source.push(signedOne);
    source.push(signedTwo);

    await new Promise((resolve) => {
      const check = () => {
        if (captured.length >= 2) {
          resolve();
          return;
        }
        setTimeout(check, 10);
      };
      check();
    });

    await loop.stop();
    await loopPromise;

    expect(captured).toHaveLength(2);
    expect(captured.every((entry) => entry.is_valid)).toBe(true);
  });
});
