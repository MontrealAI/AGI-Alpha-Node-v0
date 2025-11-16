import { context, trace } from '@opentelemetry/api';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor, ConsoleSpanExporter, ParentBasedSampler, SimpleSpanProcessor, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

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

  const sampler = buildSampler(config.samplingRatio);
  const spanProcessors = [];

  const exporter = config.exporter ?? 'console';
  if (exporter === 'otlp' && config.otlpEndpoint) {
    spanProcessors.push(
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: config.otlpEndpoint
        })
      )
    );
  } else if (exporter === 'console') {
    spanProcessors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  } else {
    config.logger?.info?.('Telemetry exporter disabled (ALPHA_NODE_OTEL_EXPORTER=none)');
  }

  providerInstance = new NodeTracerProvider({
    resource: resourceFromAttributes({
      'service.name': 'agi-alpha-node'
    }),
    sampler,
    spanProcessors
  });

  if (spanProcessors.length && providerInstance._activeSpanProcessor?._spanProcessors?.length === 0) {
    providerInstance._activeSpanProcessor._spanProcessors.push(...spanProcessors);
  }

  providerInstance.register();
  tracerInstance = providerInstance.getTracer('agi-alpha-node');

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
