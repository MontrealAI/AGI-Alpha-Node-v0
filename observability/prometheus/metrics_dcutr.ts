import type { Counter, Gauge, Histogram, Registry } from 'prom-client';
import {
  dcutrDirectDataBytesTotal,
  dcutrFallbackRelayTotal,
  dcutrPathQualityLossRate,
  dcutrPathQualityRttMs,
  dcutrPunchAttemptsTotal,
  dcutrPunchFailureTotal,
  dcutrPunchSuccessRate,
  dcutrPunchSuccessTotal,
  dcutrRelayDataBytesTotal,
  dcutrRelayOffloadTotal,
  dcutrTimeToDirectSeconds,
  normalizeLabels,
  onDirectBytes as jsOnDirectBytes,
  onDirectLossRate as jsOnDirectLossRate,
  onDirectRttMs as jsOnDirectRttMs,
  onPunchFailure as jsOnPunchFailure,
  onPunchLatency as jsOnPunchLatency,
  onPunchStart as jsOnPunchStart,
  onPunchSuccess as jsOnPunchSuccess,
  onRelayBytes as jsOnRelayBytes,
  onRelayFallback as jsOnRelayFallback,
  onRelayOffload as jsOnRelayOffload,
  registerDCUtRMetrics as jsRegisterDCUtRMetrics,
} from './metrics_dcutr.js';

export type { DCUtRLabelSet } from './metrics_dcutr.js';
export type NormalizedLabelSet = ReturnType<typeof normalizeLabels>;

export const metrics = {
  dcutrPunchAttemptsTotal,
  dcutrPunchSuccessTotal,
  dcutrPunchFailureTotal,
  dcutrPunchSuccessRate,
  dcutrTimeToDirectSeconds,
  dcutrPathQualityRttMs,
  dcutrPathQualityLossRate,
  dcutrFallbackRelayTotal,
  dcutrRelayOffloadTotal,
  dcutrRelayDataBytesTotal,
  dcutrDirectDataBytesTotal,
};

export const dcutrMetrics: {
  dcutrPunchAttemptsTotal: Counter<string>;
  dcutrPunchSuccessTotal: Counter<string>;
  dcutrPunchFailureTotal: Counter<string>;
  dcutrPunchSuccessRate: Gauge<string>;
  dcutrTimeToDirectSeconds: Histogram<string>;
  dcutrPathQualityRttMs: Gauge<string>;
  dcutrPathQualityLossRate: Gauge<string>;
  dcutrFallbackRelayTotal: Counter<string>;
  dcutrRelayOffloadTotal: Counter<string>;
  dcutrRelayDataBytesTotal: Counter<string>;
  dcutrDirectDataBytesTotal: Counter<string>;
} = metrics;

export function registerDCUtRMetrics(registry?: Registry): void {
  jsRegisterDCUtRMetrics(registry);
}

export function onPunchStart(labels?: Partial<NormalizedLabelSet>): void {
  jsOnPunchStart(labels);
}

export function onPunchSuccess(labels?: Partial<NormalizedLabelSet>): void {
  jsOnPunchSuccess(labels);
}

export function onPunchFailure(labels?: Partial<NormalizedLabelSet>): void {
  jsOnPunchFailure(labels);
}

export function onPunchLatency(seconds: number, labels?: Partial<NormalizedLabelSet>): void {
  jsOnPunchLatency(seconds, labels);
}

export function onDirectRttMs(rtt: number, labels?: Partial<NormalizedLabelSet>): void {
  jsOnDirectRttMs(rtt, labels);
}

export function onDirectLossRate(percent: number, labels?: Partial<NormalizedLabelSet>): void {
  jsOnDirectLossRate(percent, labels);
}

export function onRelayFallback(labels?: Partial<NormalizedLabelSet>): void {
  jsOnRelayFallback(labels);
}

export function onRelayOffload(labels?: Partial<NormalizedLabelSet>): void {
  jsOnRelayOffload(labels);
}

export function onRelayBytes(bytes: number, labels?: Partial<NormalizedLabelSet>): void {
  jsOnRelayBytes(bytes, labels);
}

export function onDirectBytes(bytes: number, labels?: Partial<NormalizedLabelSet>): void {
  jsOnDirectBytes(bytes, labels);
}

export { normalizeLabels };
