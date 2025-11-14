import { z } from 'zod';

const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
const SIGNATURE_REGEX = /^0x[0-9a-fA-F]{130}$/;
const HASH_REGEX = /^0x[0-9a-fA-F]{64}$/;

export const ALPHA_WU_ROLES = ['executor', 'validator', 'orchestrator'];

const isoDateRefinement = (value) => {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
};

const positiveOrZeroNumber = z
  .number()
  .refine((value) => Number.isFinite(value) && value >= 0, {
    message: 'Must be a non-negative finite number'
  });

export const alphaWuZodSchema = z
  .object({
    job_id: z.string().min(1),
    wu_id: z.string().min(1),
    role: z.enum(ALPHA_WU_ROLES),
    alpha_wu_weight: positiveOrZeroNumber,
    model_runtime: z.object({
      name: z.string().min(1),
      version: z.string().min(1),
      runtime_type: z.string().min(1)
    }),
    inputs_hash: z.string().regex(HASH_REGEX),
    outputs_hash: z.string().regex(HASH_REGEX),
    wall_clock_ms: z.number().int().min(0),
    cpu_sec: positiveOrZeroNumber,
    gpu_sec: z.number().min(0).optional().nullable(),
    energy_kwh: z.number().min(0).optional().nullable(),
    node_ens_name: z.string().min(1).nullable(),
    attestor_address: z.string().regex(ADDRESS_REGEX),
    attestor_sig: z.string().regex(SIGNATURE_REGEX),
    created_at: z.string().refine(isoDateRefinement, { message: 'created_at must be ISO-8601 date string' })
  })
  .strict();

export function validateAlphaWu(value) {
  return alphaWuZodSchema.parse(value);
}

export function tryValidateAlphaWu(value) {
  const result = alphaWuZodSchema.safeParse(value);
  if (!result.success) {
    const error = new Error('Invalid α-WU payload');
    error.issues = result.error.issues;
    throw error;
  }
  return result.data;
}

export function canonicalizeAlphaWuForSigning(alphaWu) {
  const sanitized = { ...alphaWu };
  delete sanitized.attestor_sig;
  return sanitized;
}

export function cloneAlphaWu(alphaWu) {
  if (!alphaWu) return null;
  return JSON.parse(JSON.stringify(alphaWu));
}

export function compareAlphaWu(left, right) {
  if (!left || !right) return false;
  const normalizedLeft = JSON.stringify(canonicalizeAlphaWuForSigning(validateAlphaWu(left)));
  const normalizedRight = JSON.stringify(canonicalizeAlphaWuForSigning(validateAlphaWu(right)));
  return normalizedLeft === normalizedRight;
}
