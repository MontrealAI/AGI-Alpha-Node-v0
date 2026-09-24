import { it, expect, vi } from 'vitest';
import {
  parseSamplingRatio,
  parseTelemetryExporter,
  loadTelemetryConfig,
} from '../../src/telemetry/config.ts';
import {
  initTelemetry,
  getTracer,
  withActiveSpan,
} from '../../src/telemetry/otel.ts';
import { trace } from '@opentelemetry/api';
it('keeps exporter and sampling configuration bounded and falls back visibly on invalid input', () => {
  const logger = { warn: vi.fn(), info: vi.fn() } as any;
  expect(parseTelemetryExporter(undefined, logger)).toBe('console');
  expect(parseTelemetryExporter('other', logger)).toBe('console');
  expect(parseSamplingRatio('bad', logger)).toBeUndefined();
  expect(parseSamplingRatio('-1', logger)).toBe(0);
  expect(parseSamplingRatio('2', logger)).toBe(1);
  expect(
    loadTelemetryConfig({ ALPHA_NODE_OTEL_EXPORTER: 'otlp' }, logger).exporter,
  ).toBe('console');
  expect(
    loadTelemetryConfig(
      {
        OTEL_EXPORTER_OTLP_ENDPOINT: ' https://telemetry.example ',
        OTEL_TRACES_SAMPLER: 'traceidratio:0.25',
      },
      logger,
    ),
  ).toMatchObject({ exporter: 'otlp', samplingRatio: 0.25 });
  expect(logger.warn).toHaveBeenCalled();
});
it('keeps typed telemetry wrappers functional with export disabled', () => {
  expect(getTracer()).toBeDefined();
  const tracer = initTelemetry({ exporter: 'none', samplingRatio: 0 });
  expect(getTracer()).toBe(tracer);
  expect(initTelemetry({ exporter: 'none' })).toBe(tracer);
  const span = trace.getTracer('fixture').startSpan('bounded-wrapper');
  let called = false;
  withActiveSpan(span, () => {
    called = true;
  });
  span.end();
  expect(called).toBe(true);
});
