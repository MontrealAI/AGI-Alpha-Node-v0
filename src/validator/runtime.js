import pino from 'pino';
import { getAddress } from 'ethers';
import { createAlphaWorkUnitValidator } from '../validation/alphaWuValidator.js';
import { createValidatorLoop } from './validatorLoop.js';
import { createAlphaWuSource } from './sources/index.js';
import { createValidationResultSink } from './sinks/index.js';

function buildSourceOptions(config) {
  const type = (config.VALIDATOR_SOURCE_TYPE ?? 'memory').toLowerCase();
  const base = { type, options: {} };
  if (type === 'file') {
    base.options.path = config.VALIDATOR_SOURCE_PATH;
  }
  if (type === 'http') {
    base.options.url = config.VALIDATOR_SOURCE_PATH;
  }
  return base;
}

export async function startValidatorRuntime({
  config,
  logger = pino({ level: 'info', name: 'validator-runtime' })
}) {
  if (!config) {
    throw new Error('config is required to start validator runtime');
  }

  const { type, options } = buildSourceOptions(config);
  const source = createAlphaWuSource({ type, options });
  const sink = createValidationResultSink({ type: config.VALIDATOR_SINK_TYPE ?? 'memory' });

  let expectedAttestor = null;
  if (config.OPERATOR_ADDRESS) {
    try {
      expectedAttestor = getAddress(config.OPERATOR_ADDRESS);
    } catch {
      expectedAttestor = null;
    }
  }

  const validator = createAlphaWorkUnitValidator({
    privateKey: config.VALIDATOR_PRIVATE_KEY ?? config.OPERATOR_PRIVATE_KEY ?? null,
    expectedAttestor,
    maxFutureDriftMs: 10 * 60 * 1000,
    logger
  });

  const loop = createValidatorLoop({ source, validator, sink, logger });
  const loopPromise = loop.start();

  async function stop() {
    await loop.stop();
  }

  return {
    source,
    sink,
    validator,
    loop,
    loopPromise,
    stop
  };
}
