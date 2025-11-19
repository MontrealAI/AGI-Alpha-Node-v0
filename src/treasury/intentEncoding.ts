import { AbiCoder, concat, dataSlice, getBytes, keccak256, toUtf8Bytes } from 'ethers';
import type { HexData, IntentDomainOptions, TreasuryIntentV1 } from './intentTypes.js';
import { ZERO_ADDRESS } from './intentTypes.js';

const coder = AbiCoder.defaultAbiCoder();
export const EXECUTE_TRANSACTION_SIGNATURE = 'executeTransaction(address,uint256,bytes)';
export const EXECUTE_TRANSACTION_SELECTOR = dataSlice(
  keccak256(toUtf8Bytes(EXECUTE_TRANSACTION_SIGNATURE)),
  0,
  4
) as HexData;

export function encodeTreasuryIntent(intent: TreasuryIntentV1): HexData {
  const encoded = coder.encode(['address', 'uint256', 'bytes'], [intent.to, intent.value, intent.data]);
  return encoded as HexData;
}

export function encodeIntentDomain(options: IntentDomainOptions = {}): HexData {
  const {
    chainId = 0n,
    contractAddress = ZERO_ADDRESS,
    version = 1,
    functionSelector = EXECUTE_TRANSACTION_SELECTOR,
    includeSelector = true
  } = options;

  const types: string[] = [];
  const values: Array<string | bigint> = [];
  if (includeSelector) {
    types.push('bytes4');
    values.push(functionSelector);
  }
  types.push('uint256');
  values.push(chainId);
  types.push('address');
  values.push(contractAddress);
  types.push('uint32');
  values.push(BigInt(version));

  return coder.encode(types, values) as HexData;
}

export interface DigestOptions {
  domain?: IntentDomainOptions | false;
}

export function digestTreasuryIntent(intent: TreasuryIntentV1, options: DigestOptions = {}): HexData {
  const encodedIntent = encodeTreasuryIntent(intent);
  if (options.domain === false) {
    return keccak256(encodedIntent) as HexData;
  }
  const domainHex = encodeIntentDomain(options.domain ?? {});
  const payload = concat([getBytes(domainHex), getBytes(encodedIntent)]);
  return keccak256(payload) as HexData;
}
