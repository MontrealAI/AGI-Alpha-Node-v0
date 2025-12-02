import pino from 'pino';

const guardLogger = pino({ level: 'error', name: 'process-guard' });
const SHUTDOWN_MESSAGE = 'Unhandled error encountered; shutting down';
const GRACEFUL_SHUTDOWN_MESSAGE = 'Graceful shutdown requested; draining tasks';
const SHUTDOWN_HANDLER_FAILURE = 'Error during shutdown handler';

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

export function installProcessGuards(logger = guardLogger, options = {}) {
  const { onShutdown } = options;

  const handleFatalError = (err, origin) => {
    const normalizedError = normalizeError(err);
    logger.error({ err: normalizedError, origin }, SHUTDOWN_MESSAGE);
    process.exit(1);
  };

  const onUnhandledRejection = (reason) => handleFatalError(reason, 'unhandledRejection');
  const onUncaughtException = (error) => handleFatalError(error, 'uncaughtException');

  const onSignal = async (signal) => {
    logger.warn({ signal }, GRACEFUL_SHUTDOWN_MESSAGE);

    if (typeof onShutdown === 'function') {
      try {
        await onShutdown(signal);
      } catch (err) {
        logger.error({ err: normalizeError(err), signal }, SHUTDOWN_HANDLER_FAILURE);
      }
    }

    process.exit(0);
  };

  process.on('unhandledRejection', onUnhandledRejection);
  process.on('uncaughtException', onUncaughtException);
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  const cleanup = () => {
    process.off('unhandledRejection', onUnhandledRejection);
    process.off('uncaughtException', onUncaughtException);
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  };

  cleanup.handlers = {
    onUnhandledRejection,
    onUncaughtException,
    onSignal
  };

  return cleanup;
}
