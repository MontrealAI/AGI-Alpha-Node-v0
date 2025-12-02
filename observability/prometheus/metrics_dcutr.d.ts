import type { Counter, Gauge, Histogram, Registry } from 'prom-client';

export interface DCUtRLabelSet {
  region?: string;
  asn?: string;
  transport?: string;
  relay_id?: string;
}

export type NormalizedLabelSet = Required<DCUtRLabelSet>;

export const dcutrPunchAttemptsTotal: Counter<string>;
export const dcutrPunchSuccessTotal: Counter<string>;
export const dcutrPunchFailureTotal: Counter<string>;
export const dcutrPunchSuccessRate: Gauge<string>;
export const dcutrTimeToDirectSeconds: Histogram<string>;
export const dcutrPathQualityRttMs: Gauge<string>;
export const dcutrPathQualityLossRate: Gauge<string>;
export const dcutrFallbackRelayTotal: Counter<string>;
export const dcutrRelayOffloadTotal: Counter<string>;
export const dcutrRelayDataBytesTotal: Counter<string>;
export const dcutrDirectDataBytesTotal: Counter<string>;

export function normalizeLabels(labels?: DCUtRLabelSet): NormalizedLabelSet;
export function registerDCUtRMetrics(registry?: Registry): void;
export function onPunchStart(labels?: Partial<NormalizedLabelSet>): void;
export function onPunchSuccess(labels?: Partial<NormalizedLabelSet>): void;
export function onPunchFailure(labels?: Partial<NormalizedLabelSet>): void;
export function onPunchLatency(seconds: number, labels?: Partial<NormalizedLabelSet>): void;
export function onDirectRttMs(rtt: number, labels?: Partial<NormalizedLabelSet>): void;
export function onDirectLossRate(percent: number, labels?: Partial<NormalizedLabelSet>): void;
export function onRelayFallback(labels?: Partial<NormalizedLabelSet>): void;
export function onRelayOffload(labels?: Partial<NormalizedLabelSet>): void;
export function onRelayBytes(bytes: number, labels?: Partial<NormalizedLabelSet>): void;
export function onDirectBytes(bytes: number, labels?: Partial<NormalizedLabelSet>): void;
