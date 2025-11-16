import type { Tracer } from '@opentelemetry/api';
import type { Logger } from 'pino';
import { getTracer as getTracerImpl, initTelemetry as initTelemetryImpl, withActiveSpan as withActiveSpanImpl } from './otelCore.js';

export type TelemetryExporter = 'otlp' | 'console' | 'none';

export interface TelemetryConfig {
  exporter?: TelemetryExporter;
  otlpEndpoint?: string;
  samplingRatio?: number;
  logger?: Logger;
}

export function initTelemetry(config: TelemetryConfig): Tracer {
  return initTelemetryImpl(config);
}

export function getTracer(): Tracer {
  return getTracerImpl();
}

export function withActiveSpan(span: Parameters<typeof withActiveSpanImpl>[0], fn: Parameters<typeof withActiveSpanImpl>[1]): void {
  withActiveSpanImpl(span, fn);
}
