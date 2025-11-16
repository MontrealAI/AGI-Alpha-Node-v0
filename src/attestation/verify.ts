import { utils as edUtils, signAsync as signEd25519, verifyAsync as verifyEd25519 } from '@noble/ed25519';
import { Wallet, computeAddress, getAddress, verifyMessage } from 'ethers';
import type { NodeIdentity, NodeKeypair, NodePubkey } from '../identity/types.js';
import {
  canonicalizeHealthAttestation,
  type HealthAttestation,
  type SignedHealthAttestation
} from './schema.js';
import { loadNodeIdentity } from '../identity/loader.js';

function normalizeHex(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty hex string`);
  }
  const prefixed = value.startsWith('0x') ? value : `0x${value}`;
  if (prefixed.length % 2 !== 0) {
    throw new Error(`${label} must contain an even number of hex characters`);
  }
  return prefixed.toLowerCase();
}

function toUncompressedPublicKey(pubkey: NodePubkey): string {
  const x = normalizeHex(pubkey.x, 'public key x');
  const y = normalizeHex(pubkey.y, 'public key y');
  if (!/^0x[0-9a-f]{64}$/.test(x) || !/^0x[0-9a-f]{64}$/.test(y)) {
    throw new Error('Public key coordinates must be 32-byte hex strings');
  }
  return `0x04${x.slice(2)}${y.slice(2)}`;
}

async function signWithSecp256k1(attestation: HealthAttestation, keypair: NodeKeypair): Promise<SignedHealthAttestation> {
  const wallet = new Wallet(keypair.privateKey);
  const canonical = canonicalizeHealthAttestation(attestation);
  const signature = await wallet.signMessage(canonical);
  return { attestation, signature, signatureType: 'secp256k1' } satisfies SignedHealthAttestation;
}

async function signWithEd25519(attestation: HealthAttestation, keypair: NodeKeypair): Promise<SignedHealthAttestation> {
  const canonical = canonicalizeHealthAttestation(attestation);
  const privateKey = normalizeHex(keypair.privateKey, 'ed25519 private key');
  const privateKeyBytes = edUtils.hexToBytes(privateKey);
  if (privateKeyBytes.length !== 32 && privateKeyBytes.length !== 64) {
    throw new Error('ed25519 private key must be 32 or 64 bytes');
  }
  const signature = await signEd25519(edUtils.utf8ToBytes(canonical), privateKeyBytes);
  return {
    attestation,
    signature: `0x${edUtils.bytesToHex(signature)}`,
    signatureType: 'ed25519'
  } satisfies SignedHealthAttestation;
}

export async function signHealthAttestation(
  attestation: HealthAttestation,
  keypair: NodeKeypair
): Promise<SignedHealthAttestation> {
  if (keypair.type === 'ed25519') {
    return signWithEd25519(attestation, keypair);
  }
  return signWithSecp256k1(attestation, keypair);
}

async function verifySecp256k1(
  signed: SignedHealthAttestation,
  nodeIdentity: NodeIdentity
): Promise<boolean> {
  const canonical = canonicalizeHealthAttestation(signed.attestation);
  const expectedAddress = computeAddress(toUncompressedPublicKey(nodeIdentity.pubkey));
  const recovered = verifyMessage(canonical, signed.signature);
  return getAddress(recovered) === getAddress(expectedAddress);
}

async function verifyEd25519(
  signed: SignedHealthAttestation,
  nodeIdentity: NodeIdentity
): Promise<boolean> {
  const canonical = canonicalizeHealthAttestation(signed.attestation);
  const signatureBytes = edUtils.hexToBytes(normalizeHex(signed.signature, 'signature'));
  const publicKeyBytes = edUtils.hexToBytes(normalizeHex(nodeIdentity.pubkey.x, 'public key'));
  if (publicKeyBytes.length !== 32 && publicKeyBytes.length !== 64) {
    throw new Error('ed25519 public key must be 32 or 64 bytes');
  }
  return verifyEd25519(signatureBytes, edUtils.utf8ToBytes(canonical), publicKeyBytes);
}

export async function verifyAttestation(
  signed: SignedHealthAttestation,
  nodeIdentity: NodeIdentity
): Promise<boolean> {
  if (signed.attestation.ensName !== nodeIdentity.ensName) {
    return false;
  }
  if (signed.attestation.peerId !== nodeIdentity.peerId) {
    return false;
  }
  if (signed.signatureType === 'ed25519') {
    try {
      return await verifyEd25519(signed, nodeIdentity);
    } catch {
      return false;
    }
  }
  try {
    return await verifySecp256k1(signed, nodeIdentity);
  } catch {
    return false;
  }
}

export async function verifyAgainstENS(
  ensName: string,
  signed: SignedHealthAttestation
): Promise<boolean> {
  const nodeIdentity = await loadNodeIdentity(ensName);
  return verifyAttestation(signed, nodeIdentity);
}
