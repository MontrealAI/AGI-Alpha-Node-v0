export interface NodePubkey {
  readonly x: string;
  readonly y: string;
}

export interface NodeIdentity {
  readonly ensName: string;
  readonly peerId: string;
  readonly pubkey: NodePubkey;
  readonly fuses?: number;
  readonly expiry?: number;
  readonly multiaddrs: string[];
  readonly metadata: Record<string, string>;
}

export type SupportedKeyType = 'secp256k1' | 'ed25519';

export interface NodeKeypair {
  readonly type: SupportedKeyType;
  readonly privateKey: string;
  readonly publicKey?: NodePubkey;
}
