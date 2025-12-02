import type { EventEmitter } from 'node:events';
import type { Registry } from 'prom-client';
import type { DCUtRLabelSet } from './dcutrHarness.js';

export interface DCUtREventPayload {
  labels?: DCUtRLabelSet;
  elapsedSeconds?: number;
  rttMs?: number;
  lossPercent?: number;
  relayBytes?: number;
  directBytes?: number;
}

export function wireDCUtRMetricBridge(emitter: EventEmitter, registry?: Registry): () => void;
