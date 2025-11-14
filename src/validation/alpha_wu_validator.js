import { Wallet, getAddress, verifyMessage } from 'ethers';
import { z } from 'zod';
import { alphaWuZodSchema } from '../types/alphaWu.js';
import { verifyAlphaWu } from '../crypto/signing.js';
import { canonicalizeForSigning } from '../utils/canonicalize.js';

const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
const SIGNATURE_REGEX = /^0x[0-9a-fA-F]{130}$/;

const isoDateTime = z
  .string()
  .refine((value) => {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp);
  }, { message: 'created_at must be an ISO-8601 string' });

export const validationResultSchema = z
  .object({
    wu_id: z.string().min(1),
    job_id: z.string().min(1).optional(),
    is_valid: z.boolean(),
    failure_reason: z.string().min(1).optional().nullable(),
    validator_address: z.string().regex(ADDRESS_REGEX),
    validator_sig: z.string().regex(SIGNATURE_REGEX),
    created_at: isoDateTime
  })
  .strict();

function buildSigner({ privateKey, env = process.env } = {}) {
  const key = privateKey ?? env.VALIDATOR_PRIVATE_KEY ?? env.NODE_PRIVATE_KEY;
  if (!key) {
    throw new Error('Validator private key not configured');
  }
  try {
    return new Wallet(key);
  } catch (error) {
    const wrapped = new Error('Failed to initialize validator signer');
    wrapped.cause = error;
    throw wrapped;
  }
}

function canonicalValidationPayload(result) {
  return canonicalizeForSigning(result, ['validator_sig']);
}

export function verifyValidationResult(result, { expectedAddress = null } = {}) {
  const parsed = validationResultSchema.parse(result);
  const payload = canonicalValidationPayload(parsed);
  let recovered;
  try {
    recovered = verifyMessage(payload, parsed.validator_sig);
  } catch (error) {
    const wrapped = new Error('Failed to verify validation result signature');
    wrapped.cause = error;
    throw wrapped;
  }
  const recoveredAddress = getAddress(recovered);
  const validatorAddress = getAddress(parsed.validator_address);
  if (recoveredAddress !== validatorAddress) {
    return false;
  }
  if (expectedAddress) {
    return recoveredAddress === getAddress(expectedAddress);
  }
  return true;
}

export function createAlphaWorkUnitValidator({
  privateKey = null,
  signer = null,
  expectedAttestor = null,
  clock = () => Date.now(),
  maxFutureDriftMs = 5 * 60 * 1000,
  logger = null
} = {}) {
  const resolvedSigner = signer ?? buildSigner({ privateKey });
  const validatorAddress = getAddress(resolvedSigner.address);
  const threshold = Number.isFinite(maxFutureDriftMs) && maxFutureDriftMs > 0 ? maxFutureDriftMs : 0;

  async function validate(rawAlphaWu) {
    const evaluationErrors = [];
    let parsedAlphaWu = null;

    try {
      parsedAlphaWu = alphaWuZodSchema.parse(rawAlphaWu);
    } catch (error) {
      const issues = error?.issues ?? [];
      if (Array.isArray(issues) && issues.length) {
        evaluationErrors.push(
          `Schema validation failed: ${issues
            .map((issue) => `${issue.path?.join('.') ?? 'field'} ${issue.message}`)
            .join('; ')}`
        );
      } else {
        evaluationErrors.push(error.message ?? 'Schema validation failed');
      }
    }

    if (parsedAlphaWu) {
      const signatureValid = (() => {
        try {
          return verifyAlphaWu(parsedAlphaWu, { expectedAddress: expectedAttestor });
        } catch (error) {
          evaluationErrors.push(error.message ?? 'Signature verification threw');
          return false;
        }
      })();
      if (!signatureValid) {
        evaluationErrors.push('Signature verification failed');
      }

      if (parsedAlphaWu.wall_clock_ms < 0 || !Number.isFinite(parsedAlphaWu.wall_clock_ms)) {
        evaluationErrors.push('wall_clock_ms must be a non-negative integer');
      }
      if (parsedAlphaWu.cpu_sec < 0 || !Number.isFinite(parsedAlphaWu.cpu_sec)) {
        evaluationErrors.push('cpu_sec must be non-negative');
      }
      if (parsedAlphaWu.gpu_sec !== null && parsedAlphaWu.gpu_sec !== undefined) {
        if (parsedAlphaWu.gpu_sec < 0 || !Number.isFinite(parsedAlphaWu.gpu_sec)) {
          evaluationErrors.push('gpu_sec must be null or non-negative');
        }
      }
      if (parsedAlphaWu.energy_kwh !== null && parsedAlphaWu.energy_kwh !== undefined) {
        if (parsedAlphaWu.energy_kwh < 0 || !Number.isFinite(parsedAlphaWu.energy_kwh)) {
          evaluationErrors.push('energy_kwh must be null or non-negative');
        }
      }

      const createdAt = Date.parse(parsedAlphaWu.created_at);
      if (!Number.isFinite(createdAt)) {
        evaluationErrors.push('created_at must be a valid ISO date');
      } else if (threshold > 0 && createdAt - clock() > threshold) {
        evaluationErrors.push('created_at is too far in the future');
      }
    }

    const isValid = evaluationErrors.length === 0;
    const wuId = parsedAlphaWu?.wu_id ?? (rawAlphaWu?.wu_id ? String(rawAlphaWu.wu_id) : 'unknown');
    const jobId = parsedAlphaWu?.job_id ?? (rawAlphaWu?.job_id ? String(rawAlphaWu.job_id) : undefined);
    const createdAtIso = new Date(clock()).toISOString();

    const baseResult = {
      wu_id: wuId,
      job_id: jobId,
      is_valid: isValid,
      failure_reason: isValid ? null : evaluationErrors.join(' | '),
      validator_address: validatorAddress,
      validator_sig: '0x',
      created_at: createdAtIso
    };

    let signature;
    try {
      const payload = canonicalValidationPayload(baseResult);
      signature = await resolvedSigner.signMessage(payload);
    } catch (error) {
      const wrapped = new Error('Failed to sign validation result');
      wrapped.cause = error;
      throw wrapped;
    }

    const finalized = {
      ...baseResult,
      validator_sig: signature
    };

    let parsedResult;
    try {
      parsedResult = validationResultSchema.parse(finalized);
    } catch (error) {
      if (logger?.error) {
        logger.error(error, 'Validator emitted invalid ValidationResult');
      }
      throw error;
    }

    return parsedResult;
  }

  return {
    validatorAddress,
    validate
  };
}

export function createAlphaWorkUnitValidatorFromSigner(options = {}) {
  return createAlphaWorkUnitValidator({ ...options, signer: options.signer });
}
