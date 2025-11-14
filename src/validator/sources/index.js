import { createInMemoryAlphaWuSource } from './memorySource.js';
import { createFileAlphaWuSource } from './fileSource.js';
import { createHttpAlphaWuSource } from './httpSource.js';
import { createMessageQueueAlphaWuSource } from './mqSource.js';

export function createAlphaWuSource({ type = 'memory', options = {} } = {}) {
  const normalized = type.toLowerCase();
  switch (normalized) {
    case 'memory':
      return createInMemoryAlphaWuSource(options);
    case 'file':
      return createFileAlphaWuSource(options);
    case 'http':
      return createHttpAlphaWuSource(options);
    case 'mq':
    case 'message-queue':
      return createMessageQueueAlphaWuSource(options);
    default:
      throw new Error(`Unsupported α-WU source type: ${type}`);
  }
}

export {
  createInMemoryAlphaWuSource,
  createFileAlphaWuSource,
  createHttpAlphaWuSource,
  createMessageQueueAlphaWuSource
};
