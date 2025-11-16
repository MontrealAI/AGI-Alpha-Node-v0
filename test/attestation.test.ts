import { EventEmitter } from 'node:events';
import { SigningKey, Wallet } from 'ethers';
import pino from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startHealthChecks } from '../src/attestation/health_service.js';
import { createHealthAttestation } from '../src/attestation/schema.js';
import { signHealthAttestation, verifyAttestation } from '../src/attestation/verify.js';
import type { NodeIdentity, NodeKeypair } from '../src/identity/types.js';
import type { SignedHealthAttestation } from '../src/attestation/schema.js';

function buildIdentity(): { nodeIdentity: NodeIdentity; keypair: NodeKeypair } {
  const wallet = Wallet.createRandom();
  const signingKey = new SigningKey(wallet.privateKey);
  const publicKey = signingKey.publicKey;
  const x = `0x${publicKey.slice(4, 68)}`.toLowerCase();
  const y = `0x${publicKey.slice(68)}`.toLowerCase();

  const nodeIdentity: NodeIdentity = {
    ensName: 'alpha.node.eth',
    peerId: 'peer-id-test',
    pubkey: { x, y },
    multiaddrs: ['/ip4/127.0.0.1/tcp/4001'],
    metadata: {
      'node.role': 'orchestrator',
      'node.version': '1.0.0'
    }
  };

  const keypair: NodeKeypair = {
    type: 'secp256k1',
    privateKey: wallet.privateKey,
    publicKey: nodeIdentity.pubkey
  };

  return { nodeIdentity, keypair };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('attestation verification', () => {
  it('verifies a valid secp256k1 attestation', async () => {
    const { nodeIdentity, keypair } = buildIdentity();
    const attestation = createHealthAttestation(nodeIdentity, 'healthy', {
      latencyMs: 12,
      meta: { scope: 'unit-test' }
    });

    const signed = await signHealthAttestation(attestation, keypair);
    await expect(verifyAttestation(signed, nodeIdentity)).resolves.toBe(true);
  });

  it('rejects tampered payloads or signatures', async () => {
    const { nodeIdentity, keypair } = buildIdentity();
    const attestation = createHealthAttestation(nodeIdentity, 'healthy', { latencyMs: 7 });
    const signed = await signHealthAttestation(attestation, keypair);

    const tampered = {
      ...signed,
      attestation: { ...signed.attestation, status: 'unhealthy' }
    } satisfies SignedHealthAttestation;

    await expect(verifyAttestation(tampered, nodeIdentity)).resolves.toBe(false);

    const mutatedSignature = `${signed.signature.slice(0, -1)}${
      signed.signature.slice(-1) === '0' ? '1' : '0'
    }`;
    await expect(
      verifyAttestation(
        {
          ...signed,
          signature: mutatedSignature
        },
        nodeIdentity
      )
    ).resolves.toBe(false);
  });
});

describe('health check service', () => {
  it('emits signed health attestations on an interval', async () => {
    vi.useFakeTimers();
    const { nodeIdentity, keypair } = buildIdentity();
    const emitter = new EventEmitter();
    const emissions: SignedHealthAttestation[] = [];

    const handle = startHealthChecks(nodeIdentity, keypair, {
      intervalMs: 1000,
      emitter,
      onAttestation: (signed) => emissions.push(signed),
      measureLatency: async () => 42,
      logger: pino({ level: 'silent' })
    });

    await vi.runOnlyPendingTimersAsync();
    await vi.runOnlyPendingTimersAsync();

    expect(emissions.length).toBeGreaterThan(0);
    await expect(verifyAttestation(emissions[0], nodeIdentity)).resolves.toBe(true);

    handle.stop();
  });
});
