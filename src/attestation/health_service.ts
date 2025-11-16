import { EventEmitter } from 'node:events';
import { performance } from 'node:perf_hooks';
import pino, { type Logger } from 'pino';
import type { NodeIdentity, NodeKeypair } from '../identity/types.js';
import type { HealthAttestation, SignedHealthAttestation } from './schema.js';
import { createHealthAttestation, serializeSignedAttestation } from './schema.js';
import { signHealthAttestation } from './verify.js';

export interface HealthCheckOptions {
  readonly intervalMs?: number;
  readonly emitter?: EventEmitter;
  readonly onAttestation?: (signed: SignedHealthAttestation) => void;
  readonly measureLatency?: () => Promise<number>;
  readonly logger?: Logger;
  readonly statusEvaluator?: (latencyMs?: number) => HealthAttestation['status'];
  readonly role?: string;
  readonly nodeVersion?: string;
  readonly meta?: Record<string, unknown>;
  readonly logToConsole?: boolean;
}

export interface HealthCheckHandle {
  readonly stop: () => void;
  readonly emitter: EventEmitter;
}

const DEFAULT_INTERVAL_MS = 30_000;

async function defaultMeasureLatency(): Promise<number> {
  const start = performance.now();
  await Promise.resolve();
  return Math.max(0, Math.round(performance.now() - start));
}

function defaultStatus(latencyMs?: number): HealthAttestation['status'] {
  if (latencyMs === undefined) {
    return 'healthy';
  }
  if (!Number.isFinite(latencyMs)) {
    return 'unhealthy';
  }
  if (latencyMs > 2000) {
    return 'unhealthy';
  }
  if (latencyMs > 800) {
    return 'degraded';
  }
  return 'healthy';
}

export function startHealthChecks(
  nodeIdentity: NodeIdentity,
  keypair: NodeKeypair,
  opts: HealthCheckOptions = {}
): HealthCheckHandle {
  const emitter = opts.emitter ?? new EventEmitter();
  const logger = opts.logger ?? pino({ level: 'info', name: 'health-service' });
  const intervalMs = Math.max(opts.intervalMs ?? DEFAULT_INTERVAL_MS, 250);
  const measureLatency = opts.measureLatency ?? defaultMeasureLatency;
  const statusEvaluator = opts.statusEvaluator ?? defaultStatus;
  const logToConsole = opts.logToConsole ?? false;

  const emitAttestation = async () => {
    let latencyMs: number | undefined;
    try {
      latencyMs = await measureLatency();
    } catch (error) {
      logger.error({ err: error }, 'Health latency measurement failed');
    }

    const attestation = createHealthAttestation(nodeIdentity, statusEvaluator(latencyMs), {
      timestamp: new Date().toISOString(),
      role: opts.role,
      nodeVersion: opts.nodeVersion,
      latencyMs,
      meta: opts.meta
    });

    const signed = await signHealthAttestation(attestation, keypair);

    if (opts.onAttestation) {
      opts.onAttestation(signed);
    }

    emitter.emit('attestation', signed);

    if (logToConsole) {
      console.log(serializeSignedAttestation(signed));
    } else {
      logger.debug?.({ attestation: signed.attestation }, 'Health attestation emitted');
    }
  };

  const timer = setInterval(() => {
    emitAttestation().catch((error) => {
      logger.error({ err: error }, 'Health attestation emission failed');
    });
  }, intervalMs);

  emitAttestation().catch((error) => {
    logger.error({ err: error }, 'Initial health attestation failed');
  });

  return {
    stop: () => clearInterval(timer),
    emitter
  } satisfies HealthCheckHandle;
}
