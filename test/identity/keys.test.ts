import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadNodeKeypair, validateKeypairAgainstENS, NodeKeypairError, NodeKeyValidationError } from '../../src/identity/keys.js';
import type { NodeIdentity } from '../../src/identity/types.js';

const PRIVATE_KEY = '0x'.padEnd(66, '1');

function buildIdentityFromKeypair(keypair: ReturnType<typeof loadNodeKeypair>): NodeIdentity {
  if (!keypair.publicKey) {
    throw new Error('Keypair missing public key');
  }
  return {
    ensName: 'demo.alpha.node.agi.eth',
    peerId: '12D3KooWExample',
    pubkey: keypair.publicKey,
    multiaddrs: [],
    metadata: {}
  };
}

describe('identity keys', () => {
  it('loads a secp256k1 keypair from NODE_PRIVATE_KEY', () => {
    const keypair = loadNodeKeypair({ env: { NODE_PRIVATE_KEY: PRIVATE_KEY } });
    expect(keypair.type).toBe('secp256k1');
    expect(keypair.privateKey).toBe(PRIVATE_KEY.toLowerCase());
    expect(keypair.publicKey?.x).toMatch(/^0x[0-9a-f]{64}$/);
    expect(keypair.publicKey?.y).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('loads a keypair from a JSON keyfile', () => {
    const dir = mkdtempSync(join(tmpdir(), 'identity-keys-'));
    const file = join(dir, 'node-key.json');
    writeFileSync(file, JSON.stringify({ privateKey: PRIVATE_KEY, type: 'secp256k1' }), 'utf8');

    const keypair = loadNodeKeypair({ env: { ALPHA_NODE_KEYFILE: file } });
    expect(keypair.type).toBe('secp256k1');
    expect(keypair.privateKey).toBe(PRIVATE_KEY.toLowerCase());
    expect(keypair.publicKey?.x).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('throws when keypair configuration is missing', () => {
    expect(() => loadNodeKeypair({ env: {} })).toThrow(NodeKeypairError);
  });

  it('validates a matching keypair against ENS pubkey', () => {
    const keypair = loadNodeKeypair({ env: { NODE_PRIVATE_KEY: PRIVATE_KEY } });
    const identity = buildIdentityFromKeypair(keypair);
    expect(validateKeypairAgainstENS(identity, keypair)).toBe(true);
  });

  it('throws when local keypair does not match ENS pubkey', () => {
    const keypair = loadNodeKeypair({ env: { NODE_PRIVATE_KEY: PRIVATE_KEY } });
    const identity: NodeIdentity = {
      ensName: 'mismatch.alpha.node.agi.eth',
      peerId: '12D3KooWExample',
      pubkey: {
        x: '0x'.padEnd(66, '2'),
        y: '0x'.padEnd(66, '3')
      },
      multiaddrs: [],
      metadata: {}
    };

    expect(() => validateKeypairAgainstENS(identity, keypair)).toThrow(NodeKeyValidationError);
  });

  it('fails validation for unsupported key types', () => {
    const identity: NodeIdentity = {
      ensName: 'demo.alpha.node.agi.eth',
      peerId: '12D3KooWExample',
      pubkey: {
        x: '0x'.padEnd(66, '1'),
        y: '0x'.padEnd(66, '2')
      },
      multiaddrs: [],
      metadata: {}
    };

    expect(() =>
      validateKeypairAgainstENS(identity, {
        type: 'ed25519',
        privateKey: PRIVATE_KEY,
        publicKey: { x: '0x'.padEnd(66, '1'), y: '0x'.padEnd(66, '2') }
      })
    ).toThrow(NodeKeyValidationError);
  });
});
