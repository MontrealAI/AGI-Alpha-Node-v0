import { context, trace } from '@opentelemetry/api';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  ParentBasedSampler,
  SimpleSpanProcessor,
  TraceIdRatioBasedSampler
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import pino from 'pino';
import { parseOtlpHeaders } from './otelHeaders.js';

let tracerInstance = null;
let providerInstance = null;
let tracerServiceName = 'agi-alpha-node';

function buildSampler(samplingRatio) {
  if (samplingRatio === undefined) {
    return undefined;
  }
  const ratio = Math.min(1, Math.max(0, samplingRatio));
  return new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(ratio) });
}

export function initTelemetry(config) {
  if (tracerInstance) {
    return tracerInstance;
  }

  const logger = config.logger ?? pino({ level: 'info', name: 'telemetry' });
  const sampler = buildSampler(config.samplingRatio);
  const serviceName = config.serviceName || tracerServiceName;
  const exporterChoice = (config.exporter ?? 'console').toLowerCase();
  const otlpHeaders =
    typeof config.otlpHeaders === 'string'
      ? parseOtlpHeaders(config.otlpHeaders)
      : config.otlpHeaders;
  const spanProcessors = [];

  if (exporterChoice === 'otlp') {
    if (config.otlpEndpoint) {
      spanProcessors.push(
        new BatchSpanProcessor(
          new OTLPTraceExporter({
            url: config.otlpEndpoint,
            headers: otlpHeaders
          })
        )
      );
    } else {
      logger.warn('OTLP exporter requested but no OTEL_EXPORTER_OTLP_ENDPOINT was provided; falling back to console exporter');
    }
  }

  if (exporterChoice === 'console' || (exporterChoice === 'otlp' && spanProcessors.length === 0)) {
    spanProcessors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  }

  if (exporterChoice === 'none') {
    logger.info('Telemetry exporter disabled (exporter=none)');
  }

  const providerOptions = {
    resource: resourceFromAttributes({
      'service.name': serviceName
    }),
    sampler
  };

  if (spanProcessors.length) {
    providerOptions.spanProcessors = spanProcessors;
  }

  providerInstance = new NodeTracerProvider(providerOptions);
  tracerServiceName = serviceName;

  providerInstance.register();
  tracerInstance = providerInstance.getTracer(tracerServiceName);
  logger.info({ exporter: exporterChoice, otlpEndpoint: config.otlpEndpoint ?? null }, 'Telemetry initialized');

  return tracerInstance;
}

export function getTracer() {
  if (tracerInstance) {
    return tracerInstance;
  }
  return trace.getTracer(tracerServiceName);
}

export function withActiveSpan(span, fn) {
  context.with(trace.setSpan(context.active(), span), fn);
}
