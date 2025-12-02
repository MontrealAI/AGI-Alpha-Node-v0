import type { Logger } from 'pino';
import * as telemetryConfig from './config.js';
import type { TelemetryConfig, TelemetryExporter } from './otel.js';

type ParseSamplingRatio = (value: string | undefined, logger?: Logger) => number | undefined;
type ParseTelemetryExporter = (value: string | undefined, logger?: Logger) => TelemetryExporter;

export const parseSamplingRatio: ParseSamplingRatio = telemetryConfig.parseSamplingRatio;
export const parseTelemetryExporter: ParseTelemetryExporter = telemetryConfig.parseTelemetryExporter;

export function loadTelemetryConfig(env: NodeJS.ProcessEnv = process.env, logger?: Logger): TelemetryConfig & { logger?: Logger } {
  return telemetryConfig.loadTelemetryConfig(env, logger);
}

export type { TelemetryConfig, TelemetryExporter };
