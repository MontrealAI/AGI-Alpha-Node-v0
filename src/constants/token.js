import { getAddress } from 'ethers';

export const AGIALPHA_TOKEN_ADDRESS = '0xa61a3b3a130a9c20768eebf97e21515a6046a1fa';
export const AGIALPHA_TOKEN_DECIMALS = 18;
export const AGIALPHA_TOKEN_SYMBOL = '$AGIALPHA';

export const AGIALPHA_TOKEN_CHECKSUM_ADDRESS = getAddress(AGIALPHA_TOKEN_ADDRESS);

export function normalizeTokenAddress(address = AGIALPHA_TOKEN_ADDRESS) {
  return getAddress(address);
}

export function isCanonicalAgialphaAddress(address) {
  try {
    return getAddress(address) === AGIALPHA_TOKEN_CHECKSUM_ADDRESS;
  } catch (error) {
    return false;
  }
}

export function assertCanonicalAgialphaAddress(address) {
  if (!isCanonicalAgialphaAddress(address)) {
    throw new Error(
      `Token address must equal canonical ${AGIALPHA_TOKEN_SYMBOL} contract ${AGIALPHA_TOKEN_CHECKSUM_ADDRESS}`
    );
  }
  return getAddress(address);
}
