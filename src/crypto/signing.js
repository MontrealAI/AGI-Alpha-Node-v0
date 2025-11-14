import { Wallet, getAddress, verifyMessage } from 'ethers';
import { canonicalizeAlphaWuForSigning, validateAlphaWu } from '../types/alphaWu.js';
import { canonicalJson } from '../utils/canonicalize.js';

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
