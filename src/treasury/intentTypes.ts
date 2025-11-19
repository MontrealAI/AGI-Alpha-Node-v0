import { isHexString } from 'ethers';

export type HexData = `0x${string}`;
export type Address = HexData;

export interface TreasuryIntentV1 {
  to: Address;
  value: bigint;
  data: HexData;
}

export interface IntentDomainOptions {
  chainId?: bigint;
  contractAddress?: Address;
  version?: number;
  functionSelector?: HexData;
  includeSelector?: boolean;
}

export interface CanonicalIntentPayload {
  intent: TreasuryIntentV1;
  digest: HexData;
  encoded: HexData;
}

export const ZERO_ADDRESS: Address = '0x0000000000000000000000000000000000000000';

export function ensureHex(value: string | HexData): HexData {
  if (typeof value !== 'string') {
    throw new TypeError('Hex value must be a string.');
  }
  if (!value.startsWith('0x')) {
    throw new TypeError('Hex value must be 0x-prefixed.');
  }
  if (!isHexString(value)) {
    throw new TypeError('Value is not valid hex data.');
  }
  return value as HexData;
}

export function normalizeIntent(raw: Partial<TreasuryIntentV1>): TreasuryIntentV1 {
  if (!raw.to) {
    throw new Error('Intent requires a `to` address.');
  }
  const to = ensureHex(raw.to);
  if (to.length !== 42) {
    throw new Error('Intent `to` must be a 20-byte address.');
  }

  if (raw.value === undefined || raw.value === null) {
    throw new Error('Intent requires a `value`.');
  }
  const value = typeof raw.value === 'bigint' ? raw.value : BigInt(raw.value);

  const data = raw.data ? ensureHex(raw.data) : ('0x' as HexData);

  return { to, value, data } satisfies TreasuryIntentV1;
}
