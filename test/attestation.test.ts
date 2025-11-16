import { describe, expect, it, vi, beforeEach } from 'vitest';
import { buildHealthAttestation, HEALTH_ATTESTATION_VERSION } from '../src/attestation/schema.js';
import { startHealthChecks } from '../src/attestation/health_service.js';
import { signHealthAttestation, verifyAgainstENS, verifyAttestation } from '../src/attestation/verify.js';
import { loadNodeKeypair } from '../src/identity/keys.js';
import type { NodeIdentity } from '../src/identity/types.js';
import { loadNodeIdentity } from '../src/identity/loader.js';

vi.mock('../src/identity/loader.js', () => ({
  loadNodeIdentity: vi.fn()
}));

const PRIVATE_KEY = '0x'.padEnd(66, '1');
const keypair = loadNodeKeypair({ env: { NODE_PRIVATE_KEY: PRIVATE_KEY } });

const baseIdentity: NodeIdentity = {
  ensName: 'demo.alpha.node.agi.eth',
  peerId: '12D3KooWE7oRCA12aTestPeerId',
  pubkey: keypair.publicKey!,
  fuses: 0,
  expiry: 1_725_897_600,
  multiaddrs: ['/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWE7oRCA12aTestPeerId'],
  metadata: { role: 'orchestrator' }
};

describe('attestation signing and verification', () => {
  const mockedLoadNodeIdentity = vi.mocked(loadNodeIdentity);

  beforeEach(() => {
    mockedLoadNodeIdentity.mockReset();
  });

  it('signs and verifies a health attestation', async () => {
    const attestation = buildHealthAttestation(baseIdentity, {
      status: 'healthy',
      nodeVersion: '0.0.1',
      latencyMs: 12
    });

    expect(attestation.version).toBe(HEALTH_ATTESTATION_VERSION);

    const signed = await signHealthAttestation(attestation, keypair);
    expect(await verifyAttestation(signed, baseIdentity)).toBe(true);
  });

  it('fails verification when payload or signature is tampered', async () => {
    const attestation = buildHealthAttestation(baseIdentity, { status: 'healthy' });
    const signed = await signHealthAttestation(attestation, keypair);

    const tamperedStatus = {
      ...signed,
      attestation: { ...signed.attestation, status: 'unhealthy' as const }
    };
    expect(await verifyAttestation(tamperedStatus, baseIdentity)).toBe(false);

    const tamperedSignature = { ...signed, signature: '0x'.padEnd(signed.signature.length, '0') };
    expect(await verifyAttestation(tamperedSignature, baseIdentity)).toBe(false);
  });

  it('verifies attestations against ENS-loaded identity', async () => {
    mockedLoadNodeIdentity.mockResolvedValue(baseIdentity);
    const attestation = buildHealthAttestation(baseIdentity, { status: 'healthy' });
    const signed = await signHealthAttestation(attestation, keypair);

    await expect(verifyAgainstENS(baseIdentity.ensName, signed)).resolves.toBe(true);
    expect(mockedLoadNodeIdentity).toHaveBeenCalledWith(baseIdentity.ensName);
  });

  it('emits periodic signed health attestations', async () => {
    const emissions: string[] = [];

    await new Promise<void>((resolve) => {
      const emitter = startHealthChecks(baseIdentity, keypair, {
        intervalMs: 10,
        logger: null,
        nodeVersion: '2.0.0',
        latencyProbe: () => 5,
        onEmit: (signed) => {
          emissions.push(signed.signature);
          emitter.stop();
          resolve();
        }
      });
    });

    expect(emissions.length).toBe(1);
  });
});
