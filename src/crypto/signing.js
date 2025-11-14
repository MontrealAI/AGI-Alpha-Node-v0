import { Wallet, getAddress, verifyMessage } from 'ethers';
import { canonicalizeAlphaWuForSigning, validateAlphaWu } from '../types/alphaWu.js';

function canonicalize(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (typeof value === 'object') {
    return Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .reduce((acc, key) => {
        const val = value[key];
        if (val === undefined) {
          return acc;
        }
        acc[key] = canonicalize(val);
        return acc;
      }, {});
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Cannot canonicalize non-finite number');
    }
    return value;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function buildSigner({ privateKey, env = process.env } = {}) {
  const key = privateKey ?? env.NODE_PRIVATE_KEY;
  if (!key) {
    throw new Error('NODE_PRIVATE_KEY must be configured to sign α-WUs');
  }
  try {
    return new Wallet(key);
  } catch (error) {
    const wrapped = new Error('Failed to initialize signer for α-WU signing');
    wrapped.cause = error;
    throw wrapped;
  }
}

export function canonicalAlphaWuString(alphaWu) {
  const sanitized = canonicalizeAlphaWuForSigning(alphaWu);
  return canonicalJson(sanitized);
}

export async function signAlphaWu(alphaWu, options = {}) {
  const signer = buildSigner(options);
  const attestorAddress = getAddress(signer.address);
  const prepared = {
    ...alphaWu,
    attestor_address: attestorAddress,
    attestor_sig: '0x'
  };
  const canonical = canonicalAlphaWuString(prepared);
  let signature;
  try {
    signature = await signer.signMessage(canonical);
  } catch (error) {
    const wrapped = new Error('Failed to sign α-WU payload');
    wrapped.cause = error;
    throw wrapped;
  }
  const finalized = {
    ...prepared,
    attestor_sig: signature
  };
  return validateAlphaWu(finalized);
}

export function verifyAlphaWu(alphaWu, { expectedAddress = null } = {}) {
  const validated = validateAlphaWu(alphaWu);
  const canonical = canonicalAlphaWuString(validated);
  let recovered;
  try {
    recovered = verifyMessage(canonical, validated.attestor_sig);
  } catch (error) {
    const wrapped = new Error('Failed to verify α-WU signature');
    wrapped.cause = error;
    throw wrapped;
  }
  const recoveredAddress = getAddress(recovered);
  const attestorAddress = getAddress(validated.attestor_address);
  if (recoveredAddress !== attestorAddress) {
    return false;
  }
  if (expectedAddress) {
    return recoveredAddress === getAddress(expectedAddress);
  }
  return true;
}
