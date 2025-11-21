// Auto-generated from dcutrEvents.ts to provide a TS-loader-free runtime bridge.
// Update dcutrEvents.ts and re-transpile when changing DCUtR event wiring.
import { EventEmitter } from 'node:events';
import { onDirectBytes, onDirectLossRate, onDirectRttMs, onPunchFailure, onPunchLatency, onPunchStart, onPunchSuccess, onRelayBytes, onRelayFallback, onRelayOffload, registerDCUtRMetrics, } from '../../observability/prometheus/metrics_dcutr.js';
import { register as defaultRegistry } from 'prom-client';
const DEFAULT_LABELS = {
    region: 'unknown',
    asn: 'unknown',
    transport: 'unknown',
    relay_id: 'unknown',
};
function normalizeLabels(labels) {
    return {
        region: labels?.region ?? DEFAULT_LABELS.region,
        asn: labels?.asn ?? DEFAULT_LABELS.asn,
        transport: labels?.transport ?? DEFAULT_LABELS.transport,
        relay_id: labels?.relay_id ?? DEFAULT_LABELS.relay_id,
    };
}
function labelKey(labels) {
    const normalized = normalizeLabels(labels);
    return `${normalized.region}|${normalized.asn}|${normalized.transport}|${normalized.relay_id}`;
}
function attachListener(source, event, handler) {
    if (!source || !event || typeof handler !== 'function')
        return () => { };
    if ('addEventListener' in source) {
        const target = source;
        target.addEventListener(event, handler);
        return () => target.removeEventListener?.(event, handler);
    }
    if (typeof source.on === 'function') {
        const emitter = source;
        emitter.on(event, handler);
        return () => (emitter.off ?? emitter.removeListener)?.(event, handler);
    }
    return () => { };
}
export function wireDCUtRMetricBridge(emitter, registry = defaultRegistry) {
    registerDCUtRMetrics(registry);
    const inflightAttempts = new Map();
    const registerAttempt = (labels, { skipIfInflight = false } = {}) => {
        const key = labelKey(labels);
        const current = inflightAttempts.get(key) ?? 0;
        if (skipIfInflight && current > 0)
            return;
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
        if (!current)
            return;
        if (current <= 1) {
            inflightAttempts.delete(key);
        }
        else {
            inflightAttempts.set(key, current - 1);
        }
    };
    const onRelayDial = (payload) => {
        registerAttempt(payload.labels, { skipIfInflight: true });
        if (payload.relayBytes) {
            onRelayBytes(payload.relayBytes, payload.labels);
        }
    };
    const onPunchBegin = (payload) => {
        registerAttempt(payload.labels, { skipIfInflight: true });
    };
    const onDirectConfirm = (payload) => {
        ensureAttemptRegistered(payload.labels);
        onPunchSuccess(payload.labels);
        onRelayOffload(payload.labels);
        if (typeof payload.elapsedSeconds === 'number') {
            onPunchLatency(payload.elapsedSeconds, payload.labels);
        }
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
    const onRelayFallbackHandler = (payload) => {
        ensureAttemptRegistered(payload.labels);
        onPunchFailure(payload.labels);
        onRelayFallback(payload.labels);
        if (typeof payload.relayBytes === 'number') {
            onRelayBytes(payload.relayBytes, payload.labels);
        }
        settleAttempt(payload.labels);
    };
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
    const listeners = {
        relayDialSuccess: onRelayDial,
        holePunchStart: onPunchBegin,
        directPathConfirmed: onDirectConfirm,
        relayFallbackActive: onRelayFallbackHandler,
        streamMigration: onStreamMigrationHandler,
    };
    Object.entries(listeners).forEach(([event, handler]) => {
        emitter.on(event, handler);
    });
    return () => {
        Object.entries(listeners).forEach(([event, handler]) => {
            emitter.off(event, handler);
        });
    };
}
const DEFAULT_LIBP2P_EVENT_MAPPING = {
    relayDialSuccess: ['relay:connect', 'relay:connected'],
    holePunchStart: ['hole-punch:start', 'holepunch:start', 'hole-punch:attempt'],
    directPathConfirmed: ['hole-punch:success', 'hole-punch:end', 'holepunch:success'],
    relayFallbackActive: ['hole-punch:failure', 'hole-punch:fail', 'holepunch:failure', 'relay:fallback'],
    streamMigration: ['stream:migrate', 'connection:migrate', 'direct:upgrade'],
};
function extractDetail(payload) {
    if (!payload || typeof payload !== 'object') {
        return {};
    }
    const maybeDetail = 'detail' in payload ? payload.detail : payload;
    if (!maybeDetail || typeof maybeDetail !== 'object') {
        return {};
    }
    const labels = {
        region: maybeDetail.region ?? maybeDetail.regionHint,
        asn: maybeDetail.asn ?? maybeDetail.asnHint,
        transport: maybeDetail.transport ?? maybeDetail.netTransport,
        relay_id: maybeDetail.relay_id ??
            maybeDetail.relayId ??
            maybeDetail.relay ??
            maybeDetail.peerId ??
            maybeDetail.remotePeer,
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
export function wireLibp2pDCUtRMetrics(libp2p, registry = defaultRegistry, eventMapping = DEFAULT_LIBP2P_EVENT_MAPPING) {
    const bridgeEmitter = new EventEmitter();
    const detachMetricBridge = wireDCUtRMetricBridge(bridgeEmitter, registry);
    const disposers = [];
    Object.entries(eventMapping).forEach(([eventName, aliases]) => {
        (aliases ?? []).forEach((alias) => {
            disposers.push(attachListener(libp2p, alias, (payload) => {
                bridgeEmitter.emit(eventName, extractDetail(payload));
            }));
        });
    });
    return () => {
        detachMetricBridge();
        disposers.forEach((dispose) => dispose());
        bridgeEmitter.removeAllListeners();
    };
}
