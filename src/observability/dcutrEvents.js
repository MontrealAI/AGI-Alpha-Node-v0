import { EventEmitter } from 'node:events';
import {
  onDirectBytes,
  onDirectLossRate,
  onDirectRttMs,
  onPunchFailure,
  onPunchLatency,
  onPunchStart,
  onPunchSuccess,
  onRelayBytes,
  onRelayFallback,
  onRelayOffload,
  registerDCUtRMetrics,
} from '../../observability/prometheus/metrics_dcutr.js';
import { register as defaultRegistry } from 'prom-client';

/**
 * @typedef {import('prom-client').Registry} Registry
 * @typedef {import('../../observability/prometheus/metrics_dcutr.js').DCUtRLabelSet} DCUtRLabelSet
 * @typedef {object} DCUtREventPayload
 * @property {DCUtRLabelSet} [labels]
 * @property {number} [elapsedSeconds]
 * @property {number} [rttMs]
 * @property {number} [lossPercent]
 * @property {number} [relayBytes]
 * @property {number} [directBytes]
 *
 * @typedef {'relayDialSuccess' | 'holePunchStart' | 'directPathConfirmed' | 'relayFallbackActive' | 'streamMigration'} DCUtREventName
 *
 * @typedef {EventEmitter | EventTarget | { on?: EventEmitter['on']; off?: EventEmitter['off'] }} EventSource
 * @typedef {(payload: DCUtREventPayload) => void} Handler
 * @typedef {() => void} ListenerDisposer
 */

/** @type {Required<DCUtRLabelSet>} */
const DEFAULT_LABELS = {
  region: 'unknown',
  asn: 'unknown',
  transport: 'unknown',
  relay_id: 'unknown',
};

/**
 * @param {DCUtRLabelSet} [labels]
 * @returns {Required<DCUtRLabelSet>}
 */
function normalizeLabels(labels) {
  return {
    region: labels?.region ?? DEFAULT_LABELS.region,
    asn: labels?.asn ?? DEFAULT_LABELS.asn,
    transport: labels?.transport ?? DEFAULT_LABELS.transport,
    relay_id: labels?.relay_id ?? DEFAULT_LABELS.relay_id,
  };
}

/**
 * @param {DCUtRLabelSet} [labels]
 * @returns {string}
 */
function labelKey(labels) {
  const normalized = normalizeLabels(labels);
  return `${normalized.region}|${normalized.asn}|${normalized.transport}|${normalized.relay_id}`;
}

/**
 * @param {EventSource | null | undefined} source
 * @param {string} event
 * @param {(...args: any[]) => void} handler
 * @returns {ListenerDisposer}
 */
function attachListener(source, event, handler) {
  if (!source || !event || typeof handler !== 'function') return () => {};

  if ('addEventListener' in /** @type {EventTarget} */ (source)) {
    const target = /** @type {EventTarget} */ (source);
    target.addEventListener(event, /** @type {EventListener} */ (handler));
    return () => target.removeEventListener?.(event, /** @type {EventListener} */ (handler));
  }

  if (typeof /** @type {EventEmitter} */ (source).on === 'function') {
    const emitter = /** @type {EventEmitter} */ (source);
    emitter.on(event, handler);
    return () => (emitter.off ?? emitter.removeListener)?.(event, handler);
  }

  return () => {};
}

/**
 * @param {EventEmitter} emitter
 * @param {Registry} [registry]
 * @returns {() => void}
 */
export function wireDCUtRMetricBridge(emitter, registry = defaultRegistry) {
  registerDCUtRMetrics(registry);

  const inflightAttempts = new Map();

  const registerAttempt = (labels, { skipIfInflight = false } = {}) => {
    const key = labelKey(labels);
    const current = inflightAttempts.get(key) ?? 0;

    if (skipIfInflight && current > 0) return;

    const nextCount = current + 1;
    inflightAttempts.set(key, nextCount);
    onPunchStart(labels);
  };

  const ensureAttemptRegistered = (labels) => {
    const key = labelKey(labels);
    const current = inflightAttempts.get(key) ?? 0;

    if (current === 0) {
      registerAttempt(labels);
    }
  };

  const settleAttempt = (labels) => {
    const key = labelKey(labels);
    const current = inflightAttempts.get(key);

    if (!current) return;

    if (current <= 1) {
      inflightAttempts.delete(key);
    } else {
      inflightAttempts.set(key, current - 1);
    }
  };

  /** @type {Handler} */
  const onRelayDial = (payload) => {
    registerAttempt(payload.labels, { skipIfInflight: true });
    if (payload.relayBytes) {
      onRelayBytes(payload.relayBytes, payload.labels);
    }
  };

  /** @type {Handler} */
  const onPunchBegin = (payload) => {
    registerAttempt(payload.labels, { skipIfInflight: true });
  };

  /** @type {Handler} */
  const onDirectConfirm = (payload) => {
    ensureAttemptRegistered(payload.labels);
    if (typeof payload.elapsedSeconds === 'number') {
      onPunchLatency(payload.elapsedSeconds, payload.labels);
    }
    onPunchSuccess(payload.labels);
    onRelayOffload(payload.labels);
    if (typeof payload.rttMs === 'number') {
      onDirectRttMs(payload.rttMs, payload.labels);
    }
    if (typeof payload.lossPercent === 'number') {
      onDirectLossRate(payload.lossPercent, payload.labels);
    }
    if (typeof payload.directBytes === 'number') {
      onDirectBytes(payload.directBytes, payload.labels);
    }
    settleAttempt(payload.labels);
  };

  /** @type {Handler} */
  const onRelayFallbackHandler = (payload) => {
    ensureAttemptRegistered(payload.labels);
    onPunchFailure(payload.labels);
    onRelayFallback(payload.labels);
    if (typeof payload.relayBytes === 'number') {
      onRelayBytes(payload.relayBytes, payload.labels);
    }
    settleAttempt(payload.labels);
  };

  /** @type {Handler} */
  const onStreamMigrationHandler = (payload) => {
    onRelayOffload(payload.labels);
    if (typeof payload.directBytes === 'number') {
      onDirectBytes(payload.directBytes, payload.labels);
    }
    if (typeof payload.relayBytes === 'number') {
      onRelayBytes(payload.relayBytes, payload.labels);
    }
    if (typeof payload.rttMs === 'number') {
      onDirectRttMs(payload.rttMs, payload.labels);
    }
    if (typeof payload.lossPercent === 'number') {
      onDirectLossRate(payload.lossPercent, payload.labels);
    }
    settleAttempt(payload.labels);
  };

  /** @type {Record<DCUtREventName, Handler>} */
  const listeners = {
    relayDialSuccess: onRelayDial,
    holePunchStart: onPunchBegin,
    directPathConfirmed: onDirectConfirm,
    relayFallbackActive: onRelayFallbackHandler,
    streamMigration: onStreamMigrationHandler,
  };

  /** @type {Array<[DCUtREventName, Handler]>} */
  const pairs = Object.entries(listeners);
  pairs.forEach(([event, handler]) => {
    emitter.on(event, handler);
  });

  return () => {
    pairs.forEach(([event, handler]) => {
      emitter.off(event, handler);
    });
  };
}

/** @typedef {Partial<Record<DCUtREventName, string[]>>} Libp2pEventMapping */

/** @type {Libp2pEventMapping} */
const DEFAULT_LIBP2P_EVENT_MAPPING = {
  relayDialSuccess: ['relay:connect', 'relay:connected'],
  holePunchStart: ['hole-punch:start', 'holepunch:start', 'hole-punch:attempt'],
  directPathConfirmed: ['hole-punch:success', 'hole-punch:end', 'holepunch:success'],
  relayFallbackActive: ['hole-punch:failure', 'hole-punch:fail', 'holepunch:failure', 'relay:fallback'],
  streamMigration: ['stream:migrate', 'connection:migrate', 'direct:upgrade'],
};

/** @type {Libp2pEventMapping} */
const DCUTR_SERVICE_EVENT_MAPPING = {
  relayDialSuccess: ['dcutr:relay:connect', 'dcutr:relay:connected'],
  holePunchStart: ['dcutr:punch:start', 'dcutr:hole-punch:start', 'dcutr:holepunch:start'],
  directPathConfirmed: ['dcutr:punch:success', 'dcutr:hole-punch:success', 'dcutr:direct:upgrade'],
  relayFallbackActive: ['dcutr:punch:failure', 'dcutr:relay:fallback'],
  streamMigration: ['dcutr:stream:migrate', 'dcutr:direct:migrate'],
};

/**
 * @param {unknown} payload
 * @returns {DCUtREventPayload}
 */
function extractDetail(payload) {
  if (!payload || typeof payload !== 'object') {
    return {};
  }

  const maybeDetail = 'detail' in /** @type {Record<string, unknown>} */ (payload)
    ? /** @type {any} */ (payload).detail
    : payload;
  if (!maybeDetail || typeof maybeDetail !== 'object') {
    return {};
  }

  /** @type {DCUtRLabelSet} */
  const labels = {
    region: maybeDetail.region ?? maybeDetail.regionHint,
    asn: maybeDetail.asn ?? maybeDetail.asnHint,
    transport: maybeDetail.transport ?? maybeDetail.netTransport,
    relay_id: maybeDetail.relay_id ?? maybeDetail.relayId ?? maybeDetail.relay ?? maybeDetail.peerId ?? maybeDetail.remotePeer,
  };

  const elapsedSeconds = maybeDetail.elapsedSeconds ?? maybeDetail.durationSeconds;
  const rttMs = maybeDetail.rttMs ?? maybeDetail.rtt;
  const lossPercent = maybeDetail.lossPercent ?? maybeDetail.lossRate;
  const relayBytes = maybeDetail.relayBytes;
  const directBytes = maybeDetail.directBytes;

  return {
    labels,
    elapsedSeconds: typeof elapsedSeconds === 'number' ? elapsedSeconds : undefined,
    rttMs: typeof rttMs === 'number' ? rttMs : undefined,
    lossPercent: typeof lossPercent === 'number' ? lossPercent : undefined,
    relayBytes: typeof relayBytes === 'number' ? relayBytes : undefined,
    directBytes: typeof directBytes === 'number' ? directBytes : undefined,
  };
}

/**
 * @param {EventSource} libp2p
 * @param {Registry} [registry]
 * @param {Libp2pEventMapping} [eventMapping]
 * @returns {() => void}
 */
export function wireLibp2pDCUtRMetrics(libp2p, registry = defaultRegistry, eventMapping = DEFAULT_LIBP2P_EVENT_MAPPING) {
  const bridgeEmitter = new EventEmitter();
  const detachMetricBridge = wireDCUtRMetricBridge(bridgeEmitter, registry);
  /** @type {ListenerDisposer[]} */
  const disposers = [];

  const bindMapping = (source, mapping) => {
    /** @type {Array<[DCUtREventName, string[] | undefined]>} */
    const entries = Object.entries(mapping);
    entries.forEach(([eventName, aliases]) => {
      (aliases ?? []).forEach((alias) => {
        disposers.push(
          attachListener(source, alias, (payload) => {
            bridgeEmitter.emit(eventName, extractDetail(payload));
          }),
        );
      });
    });
  };

  bindMapping(libp2p, eventMapping);

  const dcutrService = libp2p?.services?.dcutr ?? libp2p?.dcutr ?? null;
  const dcutrEvents = dcutrService?.events ?? dcutrService;
  if (dcutrEvents) {
    bindMapping(dcutrEvents, {
      relayDialSuccess: [...(eventMapping.relayDialSuccess ?? []), ...(DCUTR_SERVICE_EVENT_MAPPING.relayDialSuccess ?? [])],
      holePunchStart: [...(eventMapping.holePunchStart ?? []), ...(DCUTR_SERVICE_EVENT_MAPPING.holePunchStart ?? [])],
      directPathConfirmed: [
        ...(eventMapping.directPathConfirmed ?? []),
        ...(DCUTR_SERVICE_EVENT_MAPPING.directPathConfirmed ?? []),
      ],
      relayFallbackActive: [
        ...(eventMapping.relayFallbackActive ?? []),
        ...(DCUTR_SERVICE_EVENT_MAPPING.relayFallbackActive ?? []),
      ],
      streamMigration: [...(eventMapping.streamMigration ?? []), ...(DCUTR_SERVICE_EVENT_MAPPING.streamMigration ?? [])],
    });
  }

  return () => {
    detachMetricBridge();
    disposers.forEach((dispose) => dispose());
    bridgeEmitter.removeAllListeners();
  };
}
