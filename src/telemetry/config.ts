import type { Logger } from 'pino';
import { loadTelemetryConfig as loadTelemetryConfigImpl, parseSamplingRatio, parseTelemetryExporter } from './config.js';
import type { TelemetryConfig, TelemetryExporter } from './otel.js';

export { parseSamplingRatio, parseTelemetryExporter };

export function loadTelemetryConfig(env: NodeJS.ProcessEnv = process.env, logger?: Logger): TelemetryConfig & { logger?: Logger } {
  return loadTelemetryConfigImpl(env, logger);
}

export type { TelemetryConfig, TelemetryExporter };
