import { TextEncoder } from 'node:util';
import { Wallet, computeAddress, getAddress, hashMessage, recoverAddress } from 'ethers';
import * as ed from '@noble/ed25519';
import type { NodeIdentity, NodeKeypair } from '../identity/types.js';
import {
  normalizeHealthAttestation,
  serializeAttestation,
  type HealthAttestation,
  type SignedHealthAttestation
} from './schema.js';

function toBytes(value: string): Uint8Array {
  const normalized = value.startsWith('0x') ? value.slice(2) : value;
  return ed.etc.hexToBytes(normalized);
}

function secpPublicKeyFromIdentity(nodeIdentity: NodeIdentity): string {
  return `0x04${nodeIdentity.pubkey.x.slice(2)}${nodeIdentity.pubkey.y.slice(2)}`;
}

export function serializeForSigning(attestation: HealthAttestation): string {
  const normalized = normalizeHealthAttestation(attestation);
  return serializeAttestation(normalized);
}

export async function signHealthAttestation(
  attestation: HealthAttestation,
  keypair: NodeKeypair
): Promise<SignedHealthAttestation> {
  const normalized = normalizeHealthAttestation(attestation);
  const serialized = serializeAttestation(normalized);
  const messageBytes = new TextEncoder().encode(serialized);

  if (keypair.type === 'secp256k1') {
    const signer = new Wallet(keypair.privateKey);
    const signature = await signer.signMessage(messageBytes);
    return {
      attestation: normalized,
      signature,
      signatureType: 'secp256k1'
    } satisfies SignedHealthAttestation;
  }

  const signatureBytes = await ed.signAsync(messageBytes, toBytes(keypair.privateKey));
  const signature = `0x${ed.etc.bytesToHex(signatureBytes)}`;
  return {
    attestation: normalized,
    signature,
    signatureType: 'ed25519'
  } satisfies SignedHealthAttestation;
}

export async function verifyAttestation(
  signed: SignedHealthAttestation,
  nodeIdentity: NodeIdentity
): Promise<boolean> {
  const normalized = normalizeHealthAttestation(signed.attestation);

  if (normalized.ensName !== nodeIdentity.ensName || normalized.peerId !== nodeIdentity.peerId) {
    return false;
  }

  const serialized = serializeAttestation(normalized);
  const messageHash = hashMessage(serialized);

  if (signed.signatureType === 'secp256k1') {
    try {
      const recovered = recoverAddress(messageHash, signed.signature);
      const expected = getAddress(computeAddress(secpPublicKeyFromIdentity(nodeIdentity)));
      return getAddress(recovered) === expected;
    } catch (error) {
      return false;
    }
  }

  if (signed.signatureType !== 'ed25519') {
    return false;
  }

  try {
    const publicKey = toBytes(nodeIdentity.pubkey.x);
    const signature = toBytes(signed.signature);
    const messageBytes = new TextEncoder().encode(serialized);
    return await ed.verifyAsync(signature, messageBytes, publicKey);
  } catch (error) {
    return false;
  }
}

export async function verifyAgainstENS(
  ensName: string,
  signed: SignedHealthAttestation
): Promise<boolean> {
  const { loadNodeIdentity } = await import('../identity/loader.js');
  const nodeIdentity = await loadNodeIdentity(ensName);
  return verifyAttestation(signed, nodeIdentity);
}
