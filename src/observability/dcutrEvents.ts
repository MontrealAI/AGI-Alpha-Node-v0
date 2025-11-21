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

export function wireDCUtRMetricBridge(
  emitter: EventEmitter,
  registry: Registry = defaultRegistry,
): () => void {
  registerDCUtRMetrics(registry);

  const onRelayDial: Handler = (payload) => {
    onPunchStart(payload.labels);
    if (payload.relayBytes) {
      onRelayBytes(payload.relayBytes, payload.labels);
    }
  };

  const onPunchBegin: Handler = (_payload) => {
    // The synthetic harness already emits relayDialSuccess for every punch attempt,
    // so avoid double-counting attempts by treating holePunchStart as informational.
  };

  const onDirectConfirm: Handler = (payload) => {
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
  };

  const onRelayFallbackHandler: Handler = (payload) => {
    onPunchFailure(payload.labels);
    onRelayFallback(payload.labels);
    if (typeof payload.relayBytes === 'number') {
      onRelayBytes(payload.relayBytes, payload.labels);
    }
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
