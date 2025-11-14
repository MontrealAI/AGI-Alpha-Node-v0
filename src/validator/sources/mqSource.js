import { EventEmitter } from 'node:events';

export function createMessageQueueAlphaWuSource() {
  const emitter = new EventEmitter({ captureRejections: true });
  const queue = [];
  let closed = false;

  function enqueue(message) {
    if (closed) {
      throw new Error('message queue source is closed');
    }
    queue.push(message);
    emitter.emit('message');
  }

  async function *stream() {
    while (!closed || queue.length) {
      if (queue.length) {
        yield queue.shift();
        continue;
      }
      await new Promise((resolve) => {
        const handler = () => {
          emitter.off('message', handler);
          resolve();
        };
        emitter.once('message', handler);
      });
    }
  }

  async function close() {
    closed = true;
    emitter.emit('message');
  }

  return {
    type: 'mq',
    enqueue,
    stream,
    close
  };
}
