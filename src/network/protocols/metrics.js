import {
  recordProtocolTraffic,
  startProtocolTimer
} from '../../telemetry/networkMetrics.js';

function estimatePayloadBytes(payload) {
  if (payload === null || payload === undefined) return 0;
  if (typeof payload === 'string') return Buffer.byteLength(payload, 'utf8');
  if (payload instanceof Uint8Array) return payload.byteLength ?? payload.length ?? 0;
  if (typeof payload === 'number' || typeof payload === 'boolean') return String(payload).length;
  if (Array.isArray(payload)) {
    try {
      return Buffer.byteLength(JSON.stringify(payload), 'utf8');
    } catch (error) {
      return payload.length ?? 0;
    }
  }
  if (typeof payload === 'object') {
    try {
      return Buffer.byteLength(JSON.stringify(payload), 'utf8');
    } catch (error) {
      return 0;
    }
  }
  return 0;
}

function trackProtocolMessage(metrics, { protocol, direction = 'out', payload, overheadBytes = 0 } = {}) {
  const baseBytes = estimatePayloadBytes(payload);
  const boundedOverhead = Number.isFinite(overheadBytes) ? Math.max(0, overheadBytes) : 0;
  recordProtocolTraffic(metrics, {
    protocol,
    direction,
    bytes: baseBytes + boundedOverhead,
    messages: 1
  });
  return baseBytes + boundedOverhead;
}

function instrumentProtocolHandler({
  metrics,
  protocol,
  direction = 'in',
  estimateBytes = estimatePayloadBytes
} = {}) {
  return (handler) => {
    if (typeof handler !== 'function') {
      throw new Error('instrumentProtocolHandler expects a function handler');
    }

    return async function instrumentedHandler(message, ...args) {
      const timer = startProtocolTimer(metrics, { protocol, direction });
      try {
        const result = await handler(message, ...args);
        const estimatedBytes = estimateBytes(message, result);
        recordProtocolTraffic(metrics, {
          protocol,
          direction,
          bytes: Number.isFinite(estimatedBytes) ? estimatedBytes : estimatePayloadBytes(message),
          messages: 1
        });
        return result;
      } finally {
        timer.stop();
      }
    };
  };
}

async function observeProtocolExchange(
  metrics,
  { protocol, direction = 'out', payload = null, overheadBytes = 0, estimator = estimatePayloadBytes } = {},
  operation
) {
  if (typeof operation !== 'function') {
    throw new Error('observeProtocolExchange expects a function operation');
  }

  const timer = startProtocolTimer(metrics, { protocol, direction });
  try {
    const result = await operation();
    const requestBytes = estimator(payload);
    const responseBytes = estimator(result);
    const boundedOverhead = Number.isFinite(overheadBytes) ? Math.max(0, overheadBytes) : 0;
    const totalBytes = requestBytes + responseBytes + boundedOverhead;
    recordProtocolTraffic(metrics, {
      protocol,
      direction,
      bytes: Number.isFinite(totalBytes) ? totalBytes : requestBytes + boundedOverhead,
      messages: 1
    });
    return result;
  } finally {
    timer.stop();
  }
}

export {
  estimatePayloadBytes,
  instrumentProtocolHandler,
  observeProtocolExchange,
  trackProtocolMessage
};
