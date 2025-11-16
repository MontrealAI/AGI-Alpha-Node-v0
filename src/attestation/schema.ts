import type { NodeIdentity } from '../identity/types.js';
import { canonicalJson } from '../utils/canonicalize.js';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthAttestation {
  readonly version: 'v1';
  readonly timestamp: string;
  readonly ensName: string;
  readonly peerId: string;
  readonly role?: string;
  readonly nodeVersion: string;
  readonly fuses?: number;
  readonly expiry?: number;
  readonly multiaddrs: string[];
  readonly status: HealthStatus;
  readonly latencyMs?: number;
  readonly meta?: Record<string, unknown>;
}

export interface SignedHealthAttestation {
  readonly attestation: HealthAttestation;
  readonly signature: string;
  readonly signatureType: 'ed25519' | 'secp256k1';
}

export const HEALTH_ATTESTATION_VERSION = 'v1' as const;

export function canonicalizeHealthAttestation(attestation: HealthAttestation): string {
  return canonicalJson(attestation);
}

export interface BuildHealthAttestationOptions {
  readonly status?: HealthStatus;
  readonly timestamp?: string;
  readonly nodeVersion?: string;
  readonly role?: string;
  readonly fuses?: number;
  readonly expiry?: number;
  readonly multiaddrs?: string[];
  readonly latencyMs?: number;
  readonly meta?: Record<string, unknown>;
}

export function buildHealthAttestation(
  nodeIdentity: NodeIdentity,
  options: BuildHealthAttestationOptions = {}
): HealthAttestation {
  const now = options.timestamp ?? new Date().toISOString();
  return {
    version: HEALTH_ATTESTATION_VERSION,
    timestamp: now,
    ensName: nodeIdentity.ensName,
    peerId: nodeIdentity.peerId,
    role: options.role ?? nodeIdentity.metadata?.role,
    nodeVersion: options.nodeVersion ?? process.env.npm_package_version ?? process.version,
    fuses: options.fuses ?? nodeIdentity.fuses,
    expiry: options.expiry ?? nodeIdentity.expiry,
    multiaddrs: options.multiaddrs ?? nodeIdentity.multiaddrs,
    status: options.status ?? 'healthy',
    latencyMs: options.latencyMs,
    meta: options.meta
  } satisfies HealthAttestation;
}
