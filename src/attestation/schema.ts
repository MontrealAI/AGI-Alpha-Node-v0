import type { NodeIdentity } from '../identity/types.js';
import { canonicalJson } from '../utils/canonicalize.js';

export const HEALTH_ATTESTATION_VERSION = 'v1';

export interface HealthAttestation {
  readonly version: typeof HEALTH_ATTESTATION_VERSION;
  readonly timestamp: string;
  readonly ensName: string;
  readonly peerId: string;
  readonly role?: string;
  readonly nodeVersion: string;
  readonly fuses?: number;
  readonly expiry?: number;
  readonly multiaddrs: string[];
  readonly status: 'healthy' | 'degraded' | 'unhealthy';
  readonly latencyMs?: number;
  readonly meta?: Record<string, unknown>;
}

export interface SignedHealthAttestation {
  readonly attestation: HealthAttestation;
  readonly signature: string;
  readonly signatureType: 'ed25519' | 'secp256k1';
}

export function normalizeHealthAttestation(attestation: HealthAttestation): HealthAttestation {
  const canonical = JSON.parse(canonicalJson(attestation)) as HealthAttestation;
  return canonical;
}

export function serializeAttestation(attestation: HealthAttestation): string {
  const normalized = normalizeHealthAttestation(attestation);
  return JSON.stringify(normalized, null, 2);
}

export function serializeSignedAttestation(attestation: SignedHealthAttestation): string {
  const normalized = {
    attestation: normalizeHealthAttestation(attestation.attestation),
    signature: attestation.signature,
    signatureType: attestation.signatureType
  } satisfies SignedHealthAttestation;

  return JSON.stringify(normalized, null, 2);
}

export function createHealthAttestation(
  nodeIdentity: NodeIdentity,
  status: HealthAttestation['status'],
  options: {
    timestamp?: string;
    role?: string;
    nodeVersion?: string;
    latencyMs?: number;
    meta?: Record<string, unknown>;
  } = {}
): HealthAttestation {
  const role = options.role ?? nodeIdentity.metadata['node.role'];
  const nodeVersion =
    options.nodeVersion ??
    nodeIdentity.metadata['node.version'] ??
    nodeIdentity.metadata['version'] ??
    'unknown';

  const attestation: HealthAttestation = {
    version: HEALTH_ATTESTATION_VERSION,
    timestamp: options.timestamp ?? new Date().toISOString(),
    ensName: nodeIdentity.ensName,
    peerId: nodeIdentity.peerId,
    role,
    nodeVersion,
    fuses: nodeIdentity.fuses,
    expiry: nodeIdentity.expiry,
    multiaddrs: [...nodeIdentity.multiaddrs],
    status
  };

  if (options.latencyMs !== undefined) {
    attestation.latencyMs = options.latencyMs;
  }
  if (options.meta) {
    attestation.meta = options.meta;
  }

  return attestation;
}
