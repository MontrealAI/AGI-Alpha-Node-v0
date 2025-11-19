import pino from 'pino';
import { parseOtlpHeaders } from './otelHeaders.js';

export function parseTelemetryExporter(value, logger = pino({ level: 'info' })) {
  if (!value) {
    return 'console';
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'otlp' || normalized === 'console' || normalized === 'none') {
    return normalized;
  }
  logger.warn({ exporter: value }, 'Unsupported ALPHA_NODE_OTEL_EXPORTER; defaulting to console');
  return 'console';
}

export function parseSamplingRatio(value, logger = pino({ level: 'info' })) {
  if (value === undefined) {
    return undefined;
  }
  const ratio = Number.parseFloat(value);
  if (!Number.isFinite(ratio)) {
    logger.warn({ ratio: value }, 'Invalid ALPHA_NODE_OTEL_SAMPLING_RATIO; ignoring');
    return undefined;
  }
  if (ratio < 0 || ratio > 1) {
    logger.warn({ ratio }, 'ALPHA_NODE_OTEL_SAMPLING_RATIO must be between 0 and 1; clipping to bounds');
  }
  return Math.min(1, Math.max(0, ratio));
}

export function loadTelemetryConfig(env = process.env, logger = pino({ level: 'info' })) {
  const otlpEndpoint =
    env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim() || env.ALPHA_NODE_OTLP_ENDPOINT?.trim() || undefined;
  const rawExporter = env.ALPHA_NODE_OTEL_EXPORTER ?? (otlpEndpoint ? 'otlp' : 'console');
  const exporter = parseTelemetryExporter(rawExporter, logger);
  const samplingRatio = parseSamplingRatio(
    env.OTEL_TRACES_SAMPLER?.startsWith('traceidratio')
      ? env.OTEL_TRACES_SAMPLER.split(':')[1]
      : env.ALPHA_NODE_OTEL_SAMPLING_RATIO,
    logger
  );
  const serviceName = env.OTEL_SERVICE_NAME?.trim() || env.ALPHA_NODE_SERVICE_NAME?.trim() || 'agi-alpha-node';
  const otlpHeaders = parseOtlpHeaders(env.OTEL_EXPORTER_OTLP_HEADERS ?? env.ALPHA_NODE_OTLP_HEADERS);

  if (exporter === 'otlp' && !otlpEndpoint) {
    logger.warn('ALPHA_NODE_OTEL_EXPORTER=otlp but ALPHA_NODE_OTLP_ENDPOINT not set; using console exporter');
    return { exporter: 'console', samplingRatio, logger, serviceName };
  }

  return {
    exporter,
    otlpEndpoint,
    otlpHeaders,
    samplingRatio,
    logger,
    serviceName
  };
}
