import { createInMemoryValidationSink } from './memorySink.js';

export function createValidationResultSink({ type = 'memory', options = {} } = {}) {
  const normalized = type.toLowerCase();
  switch (normalized) {
    case 'memory':
      return createInMemoryValidationSink(options);
    default:
      throw new Error(`Unsupported validation sink type: ${type}`);
  }
}

export { createInMemoryValidationSink };
