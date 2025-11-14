import { EventEmitter } from 'node:events';

export function createInMemoryAlphaWuSource({ initial = [] } = {}) {
  const queue = Array.isArray(initial) ? [...initial] : [];
  const emitter = new EventEmitter({ captureRejections: true });
  let closed = false;

  function push(entry) {
    if (closed) {
      throw new Error('Alpha WU source is closed');
    }
    queue.push(entry);
    emitter.emit('data');
  }

  async function *stream() {
    while (!closed || queue.length) {
      if (queue.length) {
        yield queue.shift();
        continue;
      }
      await new Promise((resolve) => {
        const handler = () => {
          emitter.off('data', handler);
          resolve();
        };
        emitter.once('data', handler);
      });
    }
  }

  async function close() {
    closed = true;
    emitter.emit('data');
  }

  return {
    type: 'memory',
    push,
    stream,
    close
  };
}
