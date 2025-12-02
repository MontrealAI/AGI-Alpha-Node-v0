import { beforeEach, describe, expect, it, vi } from 'vitest';

const tracerStub = {};

const mockRegister = vi.fn();
const mockGetTracer = vi.fn(() => tracerStub);
const providerOptions = [];

vi.mock('@opentelemetry/sdk-trace-node', () => ({
  NodeTracerProvider: vi.fn((options) => {
    providerOptions.push(options);
    return {
      register: mockRegister,
      getTracer: mockGetTracer
    };
  })
}));

vi.mock('@opentelemetry/resources', () => ({
  resourceFromAttributes: vi.fn(() => ({}))
}));

const exporterOptions = [];

vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: vi.fn((options) => {
    exporterOptions.push(options);
    return {};
  })
}));

vi.mock('@opentelemetry/sdk-trace-base', () => ({
  BatchSpanProcessor: vi.fn((exporter) => ({ exporter })),
  SimpleSpanProcessor: vi.fn((exporter) => ({ exporter })),
  ParentBasedSampler: vi.fn(),
  TraceIdRatioBasedSampler: vi.fn()
}));

vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), warn: vi.fn() })
}));

describe('initTelemetry', () => {
  beforeEach(() => {
    vi.resetModules();
    exporterOptions.length = 0;
    mockRegister.mockClear();
    mockGetTracer.mockClear();
    providerOptions.length = 0;
  });

  it('parses OTLP headers provided as a string', async () => {
    const { initTelemetry } = await import('../../src/telemetry/otelCore.js');

    const logger = { info: vi.fn(), warn: vi.fn() };
    initTelemetry({
      exporter: 'otlp',
      otlpEndpoint: 'https://otel.example/v1/traces',
      otlpHeaders: 'api-key=secret-123; env=prod',
      logger
    });

    expect(exporterOptions[0]).toEqual({
      url: 'https://otel.example/v1/traces',
      headers: { 'api-key': 'secret-123', env: 'prod' }
    });
    expect(providerOptions[0].spanProcessors).toHaveLength(1);
    expect(logger.info).toHaveBeenCalled();
    expect(mockRegister).toHaveBeenCalled();
    expect(mockGetTracer).toHaveBeenCalled();
  });
});
