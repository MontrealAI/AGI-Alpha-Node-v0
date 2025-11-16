import { EventEmitter } from 'node:events';
import * as ed from '@noble/ed25519';
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

function hex(value: Uint8Array): string {
  return `0x${Buffer.from(value).toString('hex')}`;
}

async function buildEd25519Identity(): Promise<{ nodeIdentity: NodeIdentity; keypair: NodeKeypair }> {
  const privateKeyBytes = ed.utils.randomPrivateKey();
  const publicKeyBytes = await ed.getPublicKeyAsync(privateKeyBytes);

  const nodeIdentity: NodeIdentity = {
    ensName: 'ed.alpha.node.eth',
    peerId: 'peer-id-ed-test',
    pubkey: { x: hex(publicKeyBytes), y: '0x00' },
    multiaddrs: ['/ip4/127.0.0.1/tcp/4002'],
    metadata: {
      'node.role': 'validator',
      'node.version': '1.0.0'
    }
  };

  const keypair: NodeKeypair = {
    type: 'ed25519',
    privateKey: hex(privateKeyBytes),
    publicKey: nodeIdentity.pubkey
  };

  return { nodeIdentity, keypair };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetModules();
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

  it('verifies a valid ed25519 attestation', async () => {
    const { nodeIdentity, keypair } = await buildEd25519Identity();
    const attestation = createHealthAttestation(nodeIdentity, 'healthy', { latencyMs: 5 });

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

  it('loads NodeIdentity through verifyAgainstENS before verifying signatures', async () => {
    const { nodeIdentity, keypair } = buildIdentity();
    const attestation = createHealthAttestation(nodeIdentity, 'healthy', { latencyMs: 21 });
    const signed = await signHealthAttestation(attestation, keypair);

    const loadNodeIdentity = vi.fn().mockResolvedValue(nodeIdentity);
    vi.doMock('../src/identity/loader.js', () => ({ loadNodeIdentity }));

    const { verifyAgainstENS } = await import('../src/attestation/verify.js');

    await expect(verifyAgainstENS(nodeIdentity.ensName, signed)).resolves.toBe(true);
    expect(loadNodeIdentity).toHaveBeenCalledWith(nodeIdentity.ensName);
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
