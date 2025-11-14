import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const validatorKey = '0x8b3a350cf5c34c9194ca5b9ce735ffdac58fb5cae5be7c3f5e8c4b9f2e888d8f';

const createAlphaWorkUnitValidatorMock = vi.fn(() => ({
  validatorAddress: '0x0000000000000000000000000000000000000001',
  validate: vi.fn()
}));

const createAlphaWuSourceMock = vi.fn(() => ({
  subscribe: vi.fn(),
  push: vi.fn()
}));

const createValidationResultSinkMock = vi.fn(() => ({
  subscribe: vi.fn()
}));

const loop = {
  start: vi.fn(() => Promise.resolve()),
  stop: vi.fn(() => Promise.resolve())
};
const createValidatorLoopMock = vi.fn(() => loop);

vi.mock('../src/validation/alpha_wu_validator.js', () => ({
  createAlphaWorkUnitValidator: createAlphaWorkUnitValidatorMock
}));

vi.mock('../src/validator/sources/index.js', () => ({
  createAlphaWuSource: createAlphaWuSourceMock
}));

vi.mock('../src/validator/sinks/index.js', () => ({
  createValidationResultSink: createValidationResultSinkMock
}));

vi.mock('../src/validator/validatorLoop.js', () => ({
  createValidatorLoop: createValidatorLoopMock
}));

describe('startValidatorRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.VALIDATOR_PRIVATE_KEY;
    delete process.env.NODE_PRIVATE_KEY;
  });

  afterEach(() => {
    delete process.env.VALIDATOR_PRIVATE_KEY;
    delete process.env.NODE_PRIVATE_KEY;
  });

  it('passes hydrated config private key to the validator signer', async () => {
    const { startValidatorRuntime } = await import('../src/validator/runtime.js');

    const runtime = await startValidatorRuntime({
      config: {
        OPERATOR_PRIVATE_KEY: validatorKey
      }
    });

    expect(createAlphaWorkUnitValidatorMock).toHaveBeenCalledWith(
      expect.objectContaining({ privateKey: validatorKey })
    );

    await runtime.stop();
    await runtime.loopPromise;
  });
});
