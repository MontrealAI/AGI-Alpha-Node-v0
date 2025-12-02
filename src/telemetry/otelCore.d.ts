import type { Span, Tracer } from '@opentelemetry/api';
import type { TelemetryConfig } from './otel.js';
export function initTelemetry(config: TelemetryConfig): Tracer;
export function getTracer(): Tracer;
export function withActiveSpan<T>(span: Span, fn: () => T): void;
