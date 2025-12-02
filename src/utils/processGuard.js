import pino from 'pino';

const guardLogger = pino({ level: 'error', name: 'process-guard' });
const SHUTDOWN_MESSAGE = 'Unhandled error encountered; shutting down';

function normalizeError(input) {
  if (input instanceof Error) return input;
  if (typeof input === 'string') return new Error(input, { cause: input });

  try {
    return new Error(JSON.stringify(input), { cause: input });
  } catch (serializationError) {
    const fallbackMessage = 'Unserializable error payload';
    return new Error(fallbackMessage, { cause: input ?? serializationError });
  }
}

export function installProcessGuards(logger = guardLogger) {
  const handleFatalError = (err, origin) => {
    const normalizedError = normalizeError(err);
    logger.error({ err: normalizedError, origin }, SHUTDOWN_MESSAGE);
    process.exit(1);
  };

  const onUnhandledRejection = (reason) => handleFatalError(reason, 'unhandledRejection');
  const onUncaughtException = (error) => handleFatalError(error, 'uncaughtException');

  process.on('unhandledRejection', onUnhandledRejection);
  process.on('uncaughtException', onUncaughtException);

  const cleanup = () => {
    process.off('unhandledRejection', onUnhandledRejection);
    process.off('uncaughtException', onUncaughtException);
  };

  cleanup.handlers = {
    onUnhandledRejection,
    onUncaughtException
  };

  return cleanup;
}
