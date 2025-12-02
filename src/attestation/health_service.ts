import { EventEmitter } from 'node:events';
import { performance } from 'node:perf_hooks';
import { SpanStatusCode, context, trace, type Tracer } from '@opentelemetry/api';
import pino, { type Logger } from 'pino';
import type { NodeIdentity, NodeKeypair } from '../identity/types.js';
import type { HealthAttestation, SignedHealthAttestation } from './schema.js';
import { createHealthAttestation, serializeSignedAttestation } from './schema.js';
import { signHealthAttestation } from './verify.js';
import { getTracer } from '../telemetry/otel.js';

const createLogger = pino as unknown as typeof import('pino').default;

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
  readonly tracer?: Tracer;
}

export interface HealthCheckHandle {
  readonly stop: () => void;
  readonly emitter: EventEmitter;
}

const DEFAULT_INTERVAL_MS = 30_000;

function hasDnsaddrRecord(multiaddrs: string[]): boolean {
  return multiaddrs.some((addr) => addr.includes('/dnsaddr/') || addr.startsWith('/dns') || addr.includes('/dns/'));
}

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
  const logger = opts.logger ?? createLogger({ level: 'info', name: 'health-service' });
  const intervalMs = Math.max(opts.intervalMs ?? DEFAULT_INTERVAL_MS, 250);
  const measureLatency = opts.measureLatency ?? defaultMeasureLatency;
  const statusEvaluator = opts.statusEvaluator ?? defaultStatus;
  const logToConsole = opts.logToConsole ?? false;
  const tracer = opts.tracer ?? getTracer();

  let inFlight = false;

  const emitAttestation = async () => {
    const span = tracer.startSpan('node.healthcheck', {
      attributes: {
        'agent.ens': nodeIdentity.ensName,
        'agent.peer_id': nodeIdentity.peerId,
        'agent.version': opts.nodeVersion ?? nodeIdentity.metadata?.['node.version'],
        'agent.role': opts.role ?? nodeIdentity.metadata?.['node.role'],
        'ens.fuses': nodeIdentity.fuses,
        'ens.expiry': nodeIdentity.expiry,
        'dnsaddr.present': hasDnsaddrRecord(nodeIdentity.multiaddrs),
        'attestation.signature_type': keypair.type
      }
    });

    let latencyMs: number | undefined;
    try {
      latencyMs = await measureLatency();
      if (latencyMs !== undefined) {
        span.setAttribute('check.latency_ms', latencyMs);
      }
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Health latency measurement failed' });
      logger.error({ err: error }, 'Health latency measurement failed');
    }

    const status = statusEvaluator(latencyMs);
    span.setAttribute('check.status', status);

    const attestation = createHealthAttestation(nodeIdentity, status, {
      timestamp: new Date().toISOString(),
      role: opts.role,
      nodeVersion: opts.nodeVersion,
      latencyMs,
      meta: opts.meta
    });

    try {
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

      if (status !== 'healthy') {
        span.setStatus({ code: SpanStatusCode.ERROR, message: `Health status reported as ${status}` });
      }
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Health attestation emission failed' });
      logger.error({ err: error }, 'Health attestation emission failed');
    } finally {
      context.with(trace.setSpan(context.active(), span), () => span.end());
    }
  };

  const runAttestation = async () => {
    if (inFlight) {
      logger?.warn?.(
        { intervalMs },
        'Health attestation skipped because previous emission is still in flight'
      );
      return;
    }

    inFlight = true;
    try {
      await emitAttestation();
    } finally {
      inFlight = false;
    }
  };

  const timer = setInterval(() => {
    runAttestation().catch((error) => {
      logger.error({ err: error }, 'Health attestation emission failed');
    });
  }, intervalMs);

  runAttestation().catch((error) => {
    logger.error({ err: error }, 'Initial health attestation failed');
  });

  return {
    stop: () => clearInterval(timer),
    emitter
  } satisfies HealthCheckHandle;
}
