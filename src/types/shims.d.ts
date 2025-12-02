declare module '../config/defaults.js' {
  export const DEFAULT_CONFIG: Record<string, unknown>;
}

declare module '../config/env.js' {
  export function getConfig(): Record<string, unknown>;
  export function loadConfig(): Record<string, unknown>;
}

declare module './dcutrEvents.js' {
  import type { MeterProvider } from '@opentelemetry/sdk-metrics';
  import type { DCUtRLabelSet } from '../observability/dcutrHarness.js';
  export function wireDCUtRMetricBridge(options: {
    meterProvider?: MeterProvider;
    defaultLabels?: DCUtRLabelSet;
  }): void;
}

declare module './otelCore.js' {
  import type { Span, Tracer } from '@opentelemetry/api';
  export function initTelemetry(serviceName: string): void;
  export function getTracer(): Tracer;
  export function withActiveSpan<T>(span: Span, fn: () => T): T;
}

declare module '../utils/canonicalize.js' {
  export function canonicalJson(value: unknown): string;
}

declare module './metrics_dcutr.js' {
  import type { Counter, Gauge, Histogram, Registry } from 'prom-client';
  export interface DCUtRLabelSet {
    region?: string;
    asn?: string;
    transport?: string;
    relay_id?: string;
  }
  export function normalizeLabels(labels?: DCUtRLabelSet): Required<DCUtRLabelSet>;
  export const dcutrDirectDataBytesTotal: Counter<string>;
  export const dcutrFallbackRelayTotal: Counter<string>;
  export const dcutrPathQualityLossRate: Gauge<string>;
  export const dcutrPathQualityRttMs: Gauge<string>;
  export const dcutrPunchAttemptsTotal: Counter<string>;
  export const dcutrPunchFailureTotal: Counter<string>;
  export const dcutrPunchSuccessRate: Gauge<string>;
  export const dcutrPunchSuccessTotal: Counter<string>;
  export const dcutrRelayDataBytesTotal: Counter<string>;
  export const dcutrRelayOffloadTotal: Counter<string>;
  export const dcutrTimeToDirectSeconds: Histogram<string>;
  export function registerDCUtRMetrics(registry?: Registry): void;
  export function onPunchStart(labels?: Partial<Required<DCUtRLabelSet>>): void;
  export function onPunchSuccess(labels?: Partial<Required<DCUtRLabelSet>>): void;
  export function onPunchFailure(labels?: Partial<Required<DCUtRLabelSet>>): void;
  export function onPunchLatency(seconds: number, labels?: Partial<Required<DCUtRLabelSet>>): void;
  export function onDirectRttMs(rtt: number, labels?: Partial<Required<DCUtRLabelSet>>): void;
  export function onDirectLossRate(percent: number, labels?: Partial<Required<DCUtRLabelSet>>): void;
  export function onRelayFallback(labels?: Partial<Required<DCUtRLabelSet>>): void;
  export function onRelayOffload(labels?: Partial<Required<DCUtRLabelSet>>): void;
  export function onRelayBytes(bytes: number, labels?: Partial<Required<DCUtRLabelSet>>): void;
  export function onDirectBytes(bytes: number, labels?: Partial<Required<DCUtRLabelSet>>): void;
}
