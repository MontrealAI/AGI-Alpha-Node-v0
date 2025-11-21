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
  type DCUtRLabelSet,
} from '../../observability/prometheus/metrics_dcutr.js';
import { register as defaultRegistry, type Registry } from 'prom-client';

type ListenerDisposer = () => void;
type EventSource = EventEmitter | EventTarget | { on?: EventEmitter['on']; off?: EventEmitter['off'] };

export type DCUtREventPayload = {
  labels?: DCUtRLabelSet;
  elapsedSeconds?: number;
  rttMs?: number;
  lossPercent?: number;
  relayBytes?: number;
  directBytes?: number;
};

export type DCUtREventName =
  | 'relayDialSuccess'
  | 'holePunchStart'
  | 'directPathConfirmed'
  | 'relayFallbackActive'
  | 'streamMigration';

type Handler = (payload: DCUtREventPayload) => void;

const DEFAULT_LABELS: Required<DCUtRLabelSet> = {
  region: 'unknown',
  asn: 'unknown',
  transport: 'unknown',
  relay_id: 'unknown',
};

function normalizeLabels(labels?: DCUtRLabelSet): Required<DCUtRLabelSet> {
  return {
    region: labels?.region ?? DEFAULT_LABELS.region,
    asn: labels?.asn ?? DEFAULT_LABELS.asn,
    transport: labels?.transport ?? DEFAULT_LABELS.transport,
    relay_id: labels?.relay_id ?? DEFAULT_LABELS.relay_id,
  };
}

function labelKey(labels?: DCUtRLabelSet): string {
  const normalized = normalizeLabels(labels);
  return `${normalized.region}|${normalized.asn}|${normalized.transport}|${normalized.relay_id}`;
}

function attachListener(source: EventSource | null | undefined, event: string, handler: (...args: any[]) => void): ListenerDisposer {
  if (!source || !event || typeof handler !== 'function') return () => {};

  if ('addEventListener' in (source as EventTarget)) {
    const target = source as EventTarget;
    target.addEventListener(event, handler as EventListener);
    return () => target.removeEventListener?.(event, handler as EventListener);
  }

  if (typeof (source as EventEmitter).on === 'function') {
    const emitter = source as EventEmitter;
    emitter.on(event, handler);
    return () => (emitter.off ?? emitter.removeListener)?.(event, handler);
  }

  return () => {};
}

export function wireDCUtRMetricBridge(
  emitter: EventEmitter,
  registry: Registry = defaultRegistry,
): () => void {
  registerDCUtRMetrics(registry);

  const inflightAttempts = new Map<string, number>();

  const registerAttempt = (labels?: DCUtRLabelSet, { skipIfInflight = false } = {}) => {
    const key = labelKey(labels);
    const current = inflightAttempts.get(key) ?? 0;
    if (skipIfInflight && current > 0) return;

    const nextCount = current + 1;
    inflightAttempts.set(key, nextCount);
    onPunchStart(labels);
  };

  const settleAttempt = (labels?: DCUtRLabelSet) => {
    const key = labelKey(labels);
    const current = inflightAttempts.get(key);

    if (!current) return;

    if (current <= 1) {
      inflightAttempts.delete(key);
    } else {
      inflightAttempts.set(key, current - 1);
    }
  };

  const onRelayDial: Handler = (payload) => {
    if (payload.relayBytes) {
      onRelayBytes(payload.relayBytes, payload.labels);
    }
  };

  const onPunchBegin: Handler = (payload) => {
    registerAttempt(payload.labels);
  };

  const onDirectConfirm: Handler = (payload) => {
    registerAttempt(payload.labels, { skipIfInflight: true });
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

  const onRelayFallbackHandler: Handler = (payload) => {
    registerAttempt(payload.labels, { skipIfInflight: true });
    onPunchFailure(payload.labels);
    onRelayFallback(payload.labels);
    if (typeof payload.relayBytes === 'number') {
      onRelayBytes(payload.relayBytes, payload.labels);
    }
    settleAttempt(payload.labels);
  };

  const onStreamMigrationHandler: Handler = (payload) => {
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

  const listeners: Record<DCUtREventName, Handler> = {
    relayDialSuccess: onRelayDial,
    holePunchStart: onPunchBegin,
    directPathConfirmed: onDirectConfirm,
    relayFallbackActive: onRelayFallbackHandler,
    streamMigration: onStreamMigrationHandler,
  };

  (Object.entries(listeners) as Array<[DCUtREventName, Handler]>).forEach(([event, handler]) => {
    emitter.on(event, handler);
  });

  return () => {
    (Object.entries(listeners) as Array<[DCUtREventName, Handler]>).forEach(([event, handler]) => {
      emitter.off(event, handler);
    });
  };
}

type Libp2pEventMapping = Partial<Record<DCUtREventName, string[]>>;

const DEFAULT_LIBP2P_EVENT_MAPPING: Libp2pEventMapping = {
  relayDialSuccess: ['relay:connect', 'relay:connected'],
  holePunchStart: ['hole-punch:start', 'holepunch:start', 'hole-punch:attempt'],
  directPathConfirmed: ['hole-punch:success', 'hole-punch:end', 'holepunch:success'],
  relayFallbackActive: ['hole-punch:failure', 'hole-punch:fail', 'holepunch:failure', 'relay:fallback'],
  streamMigration: ['stream:migrate', 'connection:migrate', 'direct:upgrade'],
};

function extractDetail(payload: unknown): DCUtREventPayload {
  if (!payload || typeof payload !== 'object') {
    return {};
  }

  const maybeDetail = 'detail' in (payload as Record<string, unknown>) ? (payload as any).detail : payload;
  if (!maybeDetail || typeof maybeDetail !== 'object') {
    return {};
  }

  const labels: DCUtRLabelSet = {
    region: (maybeDetail as any).region ?? (maybeDetail as any).regionHint,
    asn: (maybeDetail as any).asn ?? (maybeDetail as any).asnHint,
    transport: (maybeDetail as any).transport ?? (maybeDetail as any).netTransport,
    relay_id:
      (maybeDetail as any).relay_id ??
      (maybeDetail as any).relayId ??
      (maybeDetail as any).relay ??
      (maybeDetail as any).peerId ??
      (maybeDetail as any).remotePeer,
  };

  const elapsedSeconds = (maybeDetail as any).elapsedSeconds ?? (maybeDetail as any).durationSeconds;
  const rttMs = (maybeDetail as any).rttMs ?? (maybeDetail as any).rtt;
  const lossPercent = (maybeDetail as any).lossPercent ?? (maybeDetail as any).lossRate;
  const relayBytes = (maybeDetail as any).relayBytes;
  const directBytes = (maybeDetail as any).directBytes;

  return {
    labels,
    elapsedSeconds: typeof elapsedSeconds === 'number' ? elapsedSeconds : undefined,
    rttMs: typeof rttMs === 'number' ? rttMs : undefined,
    lossPercent: typeof lossPercent === 'number' ? lossPercent : undefined,
    relayBytes: typeof relayBytes === 'number' ? relayBytes : undefined,
    directBytes: typeof directBytes === 'number' ? directBytes : undefined,
  };
}

export function wireLibp2pDCUtRMetrics(
  libp2p: EventSource,
  registry: Registry = defaultRegistry,
  eventMapping: Libp2pEventMapping = DEFAULT_LIBP2P_EVENT_MAPPING,
): () => void {
  const bridgeEmitter = new EventEmitter();
  const detachMetricBridge = wireDCUtRMetricBridge(bridgeEmitter, registry);
  const disposers: ListenerDisposer[] = [];

  (Object.entries(eventMapping) as Array<[DCUtREventName, string[] | undefined]>).forEach(([eventName, aliases]) => {
    (aliases ?? []).forEach((alias) => {
      disposers.push(
        attachListener(libp2p, alias, (payload) => {
          bridgeEmitter.emit(eventName, extractDetail(payload));
        }),
      );
    });
  });

  return () => {
    detachMetricBridge();
    disposers.forEach((dispose) => dispose());
    bridgeEmitter.removeAllListeners();
  };
}
