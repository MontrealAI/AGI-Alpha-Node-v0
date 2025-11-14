import { EventEmitter } from 'node:events';

export function createInMemoryValidationSink() {
  const emitter = new EventEmitter({ captureRejections: true });
  let closed = false;

  async function publish(result, context = {}) {
    if (closed) {
      throw new Error('validation sink closed');
    }
    emitter.emit('validation-result', { result, context });
  }

  function subscribe(handler) {
    emitter.on('validation-result', handler);
    return () => emitter.off('validation-result', handler);
  }

  async function close() {
    closed = true;
    emitter.removeAllListeners();
  }

  return {
    type: 'memory',
    publish,
    subscribe,
    close
  };
}
