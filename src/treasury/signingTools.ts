import { dataSlice, id } from 'ethers';
import { normalizeIntent, ensureHex, ZERO_ADDRESS } from './intentTypes.js';
import type { IntentDomainOptions, TreasuryIntentV1, HexData } from './intentTypes.js';
import {
  digestTreasuryIntent,
  EXECUTE_TRANSACTION_SELECTOR,
  EXECUTE_TRANSACTION_SIGNATURE
} from './intentEncoding.js';
import { signIntentDigest } from './pqEnvelope.js';
import type { DilithiumParameterSet, EnvelopeMetadata, SignedIntentEnvelope } from './pqEnvelope.js';

export interface IntentSigningRequest {
  intent?: TreasuryIntentV1 | Partial<TreasuryIntentV1>;
  digest?: HexData;
  domain?: IntentDomainOptions | false;
  metadata?: EnvelopeMetadata;
  parameterSet?: DilithiumParameterSet;
  privateKey: Uint8Array | string;
  publicKey: Uint8Array | string;
}

export interface IntentSigningResult {
  digest: HexData;
  envelope: SignedIntentEnvelope;
  intent?: TreasuryIntentV1;
}

export function computeFunctionSelector(signature = EXECUTE_TRANSACTION_SIGNATURE): HexData {
  const normalized = signature?.trim();
  if (!normalized) {
    return EXECUTE_TRANSACTION_SELECTOR;
  }
  return dataSlice(id(normalized), 0, 4) as HexData;
}

function normalizeDomain(domain?: IntentDomainOptions | false): IntentDomainOptions | false {
  if (domain === false) {
    return false;
  }
  const normalized: IntentDomainOptions = {
    chainId: domain?.chainId ?? 0n,
    contractAddress: domain?.contractAddress ?? ZERO_ADDRESS,
    version: domain?.version ?? 1,
    functionSelector: domain?.functionSelector ?? EXECUTE_TRANSACTION_SELECTOR,
    includeSelector: domain?.includeSelector ?? true
  };
  return normalized;
}

export async function signIntentWithKeys(request: IntentSigningRequest): Promise<IntentSigningResult> {
  const normalizedIntent = request.intent ? normalizeIntent(request.intent) : undefined;
  let digest = request.digest ? ensureHex(request.digest) : undefined;

  if (!digest) {
    if (!normalizedIntent) {
      throw new Error('Intent payload is required when digest is not provided.');
    }
    const normalizedDomain = normalizeDomain(request.domain);
    digest = digestTreasuryIntent(normalizedIntent, { domain: normalizedDomain });
  }

  const envelope = await signIntentDigest({
    digest,
    privateKey: request.privateKey,
    publicKey: request.publicKey,
    parameterSet: request.parameterSet,
    metadata: request.metadata
  });

  return { digest, envelope, intent: normalizedIntent } satisfies IntentSigningResult;
}
