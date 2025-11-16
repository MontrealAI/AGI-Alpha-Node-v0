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

let tracerInstance = null;
let providerInstance = null;

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
  const exporterChoice = (config.exporter ?? 'console').toLowerCase();
  const spanProcessors = [];

  if (exporterChoice === 'otlp') {
    if (config.otlpEndpoint) {
      spanProcessors.push(
        new BatchSpanProcessor(
          new OTLPTraceExporter({
            url: config.otlpEndpoint
          })
        )
      );
    } else {
      logger.warn('ALPHA_NODE_OTEL_EXPORTER=otlp set but ALPHA_NODE_OTLP_ENDPOINT missing; falling back to console exporter');
    }
  }

  if (exporterChoice === 'console' || (exporterChoice === 'otlp' && spanProcessors.length === 0)) {
    spanProcessors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  }

  if (exporterChoice === 'none') {
    logger.info('Telemetry exporter disabled (ALPHA_NODE_OTEL_EXPORTER=none)');
  }

  const providerOptions = {
    resource: resourceFromAttributes({
      'service.name': 'agi-alpha-node'
    }),
    sampler
  };

  if (spanProcessors.length) {
    providerOptions.spanProcessors = spanProcessors;
  }

  providerInstance = new NodeTracerProvider(providerOptions);

  if (typeof providerInstance.addSpanProcessor === 'function') {
    spanProcessors.forEach((processor) => providerInstance.addSpanProcessor(processor));
  } else if (spanProcessors.length) {
    logger.warn('Span processors could not be registered: provider does not expose addSpanProcessor');
  }

  providerInstance.register();
  tracerInstance = providerInstance.getTracer('agi-alpha-node');
  logger.info({ exporter: exporterChoice, otlpEndpoint: config.otlpEndpoint ?? null }, 'Telemetry initialized');

  return tracerInstance;
}

export function getTracer() {
  if (tracerInstance) {
    return tracerInstance;
  }
  return trace.getTracer('agi-alpha-node');
}

export function withActiveSpan(span, fn) {
  context.with(trace.setSpan(context.active(), span), fn);
}
