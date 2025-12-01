import pino from 'pino';

const guardLogger = pino({ level: 'error', name: 'process-guard' });
const SHUTDOWN_MESSAGE = 'Unhandled error encountered; shutting down';

function normalizeError(input) {
  if (input instanceof Error) return input;
  return new Error(typeof input === 'string' ? input : JSON.stringify(input));
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
