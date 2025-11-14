import pino from 'pino';

export function createValidatorLoop({
  source,
  validator,
  sink,
  logger = pino({ level: 'info', name: 'alpha-validator' })
}) {
  if (!source || typeof source.stream !== 'function') {
    throw new Error('Validator loop requires a source with a stream() method');
  }
  if (!validator || typeof validator.validate !== 'function') {
    throw new Error('Validator loop requires a validator with validate()');
  }
  if (!sink || typeof sink.publish !== 'function') {
    throw new Error('Validator loop requires a sink with publish()');
  }

  let running = false;
  let loopPromise = null;

  async function run() {
    running = true;
    try {
      for await (const alphaWu of source.stream()) {
        if (!running) {
          break;
        }
        try {
          const result = await validator.validate(alphaWu);
          await sink.publish(result, { alphaWu });
        } catch (error) {
          logger.error(error, 'Failed to validate α-WU payload');
        }
      }
    } finally {
      running = false;
    }
  }

  async function start() {
    if (running) {
      return loopPromise;
    }
    loopPromise = run();
    return loopPromise;
  }

  async function stop() {
    running = false;
    await source?.close?.();
    await sink?.close?.();
    return loopPromise;
  }

  return {
    start,
    stop,
    get status() {
      return running ? 'running' : 'stopped';
    },
    get loopPromise() {
      return loopPromise;
    }
  };
}
