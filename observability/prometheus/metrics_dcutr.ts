// @ts-nocheck
import type { Counter, Gauge, Histogram, Registry } from 'prom-client';
import * as dcutr from './metrics_dcutr.js';

export interface DCUtRLabelSet {
  region?: string;
  asn?: string;
  transport?: string;
  relay_id?: string;
}

export type NormalizedLabelSet = Required<DCUtRLabelSet>;

const normalizeLabels: (labels?: DCUtRLabelSet) => NormalizedLabelSet = dcutr.normalizeLabels;

const metricsImpl = {
  dcutrDirectDataBytesTotal: dcutr.dcutrDirectDataBytesTotal as Counter<string>,
  dcutrFallbackRelayTotal: dcutr.dcutrFallbackRelayTotal as Counter<string>,
  dcutrPathQualityLossRate: dcutr.dcutrPathQualityLossRate as Gauge<string>,
  dcutrPathQualityRttMs: dcutr.dcutrPathQualityRttMs as Gauge<string>,
  dcutrPunchAttemptsTotal: dcutr.dcutrPunchAttemptsTotal as Counter<string>,
  dcutrPunchFailureTotal: dcutr.dcutrPunchFailureTotal as Counter<string>,
  dcutrPunchSuccessRate: dcutr.dcutrPunchSuccessRate as Gauge<string>,
  dcutrPunchSuccessTotal: dcutr.dcutrPunchSuccessTotal as Counter<string>,
  dcutrRelayDataBytesTotal: dcutr.dcutrRelayDataBytesTotal as Counter<string>,
  dcutrRelayOffloadTotal: dcutr.dcutrRelayOffloadTotal as Counter<string>,
  dcutrTimeToDirectSeconds: dcutr.dcutrTimeToDirectSeconds as Histogram<string>
};

export const metrics = metricsImpl;

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
  dcutr.registerDCUtRMetrics(registry);
}

export function onPunchStart(labels?: Partial<NormalizedLabelSet>): void {
  dcutr.onPunchStart(labels);
}

export function onPunchSuccess(labels?: Partial<NormalizedLabelSet>): void {
  dcutr.onPunchSuccess(labels);
}

export function onPunchFailure(labels?: Partial<NormalizedLabelSet>): void {
  dcutr.onPunchFailure(labels);
}

export function onPunchLatency(seconds: number, labels?: Partial<NormalizedLabelSet>): void {
  dcutr.onPunchLatency(seconds, labels);
}

export function onDirectRttMs(rtt: number, labels?: Partial<NormalizedLabelSet>): void {
  dcutr.onDirectRttMs(rtt, labels);
}

export function onDirectLossRate(percent: number, labels?: Partial<NormalizedLabelSet>): void {
  dcutr.onDirectLossRate(percent, labels);
}

export function onRelayFallback(labels?: Partial<NormalizedLabelSet>): void {
  dcutr.onRelayFallback(labels);
}

export function onRelayOffload(labels?: Partial<NormalizedLabelSet>): void {
  dcutr.onRelayOffload(labels);
}

export function onRelayBytes(bytes: number, labels?: Partial<NormalizedLabelSet>): void {
  dcutr.onRelayBytes(bytes, labels);
}

export function onDirectBytes(bytes: number, labels?: Partial<NormalizedLabelSet>): void {
  dcutr.onDirectBytes(bytes, labels);
}

export { normalizeLabels };
