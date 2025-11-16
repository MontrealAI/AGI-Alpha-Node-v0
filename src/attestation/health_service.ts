import { setInterval, clearInterval } from 'node:timers';
import { EventEmitter } from 'node:events';
import { performance } from 'node:perf_hooks';
import pino, { type Logger } from 'pino';
import type { NodeIdentity, NodeKeypair } from '../identity/types.js';
import {
  buildHealthAttestation,
  type BuildHealthAttestationOptions,
  type HealthAttestation,
  type SignedHealthAttestation
} from './schema.js';
import { signHealthAttestation } from './verify.js';

export interface HealthCheckOptions extends BuildHealthAttestationOptions {
  readonly intervalMs?: number;
  readonly logger?: Logger | null;
  readonly onEmit?: (signed: SignedHealthAttestation) => void;
  readonly latencyProbe?: () => number | Promise<number>;
  readonly emitter?: EventEmitter;
}

type StoppableEmitter = EventEmitter & { stop: () => void };

function defaultLogger(): Logger {
  return pino({ level: 'info', name: 'health-service' });
}

async function resolveLatency(probe?: () => number | Promise<number>): Promise<number | undefined> {
  if (!probe) {
    const start = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 0));
    return Math.max(0, Math.round(performance.now() - start));
  }
  const value = await probe();
  if (value === undefined || value === null) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : undefined;
}

async function emitAttestation(
  emitter: EventEmitter,
  nodeIdentity: NodeIdentity,
  keypair: NodeKeypair,
  options: HealthCheckOptions,
  logger: Logger
): Promise<void> {
  const latencyMs = await resolveLatency(options.latencyProbe);
  const attestation: HealthAttestation = buildHealthAttestation(nodeIdentity, {
    ...options,
    latencyMs
  });
  const signed = await signHealthAttestation(attestation, keypair);
  emitter.emit('healthAttestation', signed);
  options.onEmit?.(signed);
  logger.info({ attestation: signed.attestation, signature: signed.signature, signatureType: signed.signatureType }, 'health attestation emitted');
}

export function startHealthChecks(
  nodeIdentity: NodeIdentity,
  keypair: NodeKeypair,
  options: HealthCheckOptions = {}
): StoppableEmitter {
  const emitter = options.emitter ?? new EventEmitter();
  const logger = options.logger ?? defaultLogger();
  const intervalMs = options.intervalMs ?? 30_000;
  let timer: NodeJS.Timeout | null = null;

  const run = () => {
    emitAttestation(emitter, nodeIdentity, keypair, options, logger).catch((error) => {
      logger.error({ err: error }, 'failed to emit health attestation');
    });
  };

  run();
  timer = setInterval(run, intervalMs);
  timer.unref?.();

  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  return Object.assign(emitter, { stop });
}
