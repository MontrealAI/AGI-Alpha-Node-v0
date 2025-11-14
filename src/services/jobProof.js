import {
  Interface,
  getAddress,
  hexlify,
  isHexString,
  keccak256,
  solidityPacked,
  toUtf8Bytes,
  zeroPadValue
} from 'ethers';
import { getJobAlphaSummary, getJobAlphaWU } from './metering.js';

const JOB_REGISTRY_ABI = [
  'function submitProof(bytes32 jobId, bytes32 commitment, bytes32 resultHash, string resultURI, bytes metadata)'
];

const jobRegistryInterface = new Interface(JOB_REGISTRY_ABI);

function normalizeJobId(jobId) {
  if (!jobId) {
    throw new Error('jobId is required');
  }
  if (jobId instanceof Uint8Array) {
    return zeroPadValue(hexlify(jobId), 32);
  }
  if (typeof jobId === 'string') {
    const trimmed = jobId.trim();
    if (trimmed.length === 0) {
      throw new Error('jobId is required');
    }
    if (trimmed.startsWith('0x')) {
      if (!isHexString(trimmed)) {
        throw new Error('jobId must be a valid hex string');
      }
      return zeroPadValue(trimmed, 32);
    }
    const hashed = keccak256(toUtf8Bytes(trimmed));
    return zeroPadValue(hashed, 32);
  }
  throw new TypeError('Unsupported jobId type; expected hex string, utf-8 string, or Uint8Array');
}

function encodeMetadata(metadata) {
  if (metadata === undefined || metadata === null) {
    return '0x';
  }
  if (metadata instanceof Uint8Array) {
    return hexlify(metadata);
  }
  if (typeof metadata === 'string') {
    const trimmed = metadata.trim();
    if (trimmed.length === 0) {
      return '0x';
    }
    if (trimmed.startsWith('0x') && isHexString(trimmed)) {
      return trimmed.toLowerCase();
    }
    return hexlify(toUtf8Bytes(trimmed));
  }
  if (typeof metadata === 'object') {
    return hexlify(toUtf8Bytes(JSON.stringify(metadata)));
  }
  throw new TypeError('Unsupported metadata type; expected string, object, or Uint8Array');
}

function deriveResultHash(result) {
  if (result === undefined || result === null) {
    throw new Error('result is required to derive hash');
  }
  if (result instanceof Uint8Array) {
    return keccak256(result);
  }
  if (typeof result === 'string') {
    const trimmed = result.trim();
    if (trimmed.length === 0) {
      throw new Error('result cannot be empty');
    }
    if (trimmed.startsWith('0x') && isHexString(trimmed)) {
      return keccak256(trimmed);
    }
    return keccak256(toUtf8Bytes(trimmed));
  }
  if (typeof result === 'object') {
    return keccak256(toUtf8Bytes(JSON.stringify(result)));
  }
  throw new TypeError('Unsupported result type; expected string, object, or Uint8Array');
}

function normalizeCommitment(commitment) {
  if (!commitment) {
    throw new Error('commitment is required');
  }
  if (commitment instanceof Uint8Array) {
    if (commitment.length !== 32) {
      throw new Error('commitment Uint8Array must be exactly 32 bytes');
    }
    return hexlify(commitment);
  }
  if (typeof commitment === 'string') {
    const trimmed = commitment.trim();
    if (!isHexString(trimmed, 32)) {
      throw new Error('commitment must be a 32-byte hex string');
    }
    return trimmed.toLowerCase();
  }
  throw new TypeError('Unsupported commitment type; expected hex string or Uint8Array');
}

function normalizeResultHash(resultHash) {
  if (!resultHash) {
    throw new Error('resultHash is required');
  }
  if (resultHash instanceof Uint8Array) {
    if (resultHash.length !== 32) {
      throw new Error('resultHash Uint8Array must be exactly 32 bytes');
    }
    return hexlify(resultHash);
  }
  if (typeof resultHash === 'string') {
    const trimmed = resultHash.trim();
    if (!isHexString(trimmed, 32)) {
      throw new Error('resultHash must be a 32-byte hex string');
    }
    return trimmed.toLowerCase();
  }
  throw new TypeError('Unsupported resultHash type; expected hex string or Uint8Array');
}

function toNumber(value) {
  if (value === undefined || value === null) {
    return 0;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeAlphaSummary(jobId) {
  let total = 0;
  try {
    total = toNumber(getJobAlphaWU(jobId));
  } catch {
    total = 0;
  }
  let summary = null;
  try {
    summary = getJobAlphaSummary(jobId);
  } catch {
    summary = null;
  }
  const segments = Array.isArray(summary?.bySegment)
    ? summary.bySegment.map((segment) => ({
        segmentId: segment.segmentId ?? null,
        jobId: segment.jobId ?? null,
        modelClass: segment.modelClass ?? null,
        slaProfile: segment.slaProfile ?? null,
        deviceClass: segment.deviceClass ?? null,
        vramTier: segment.vramTier ?? null,
        gpuCount: segment.gpuCount ?? null,
        gpuMinutes: toNumber(segment.gpuMinutes),
        qualityMultiplier: toNumber(segment.qualityMultiplier),
        alphaWU: toNumber(segment.alphaWU),
        startedAt: segment.startedAt ?? null,
        endedAt: segment.endedAt ?? null
      }))
    : [];
  const normalizeBreakdown = (source = {}) =>
    Object.fromEntries(
      Object.entries(source)
        .map(([key, value]) => [key, toNumber(value)])
        .sort(([a], [b]) => a.localeCompare(b))
    );
  const modelClassBreakdown = normalizeBreakdown(summary?.modelClassBreakdown);
  const slaBreakdown = normalizeBreakdown(summary?.slaBreakdown);
  const quality = {
    modelClass: { ...modelClassBreakdown },
    sla: { ...slaBreakdown }
  };
  const breakdown = {
    modelClass: { ...quality.modelClass },
    sla: { ...quality.sla }
  };
  return {
    total,
    bySegment: segments,
    modelClassBreakdown,
    slaBreakdown,
    breakdown,
    quality,
    qualityBreakdown: {
      modelClass: { ...quality.modelClass },
      sla: { ...quality.sla }
    }
  };
}

export function createJobProof({ jobId, result, operator, timestamp, metadata, resultUri = '' }) {
  const normalizedJobId = normalizeJobId(jobId);
  const normalizedOperator = operator ? getAddress(operator) : '0x0000000000000000000000000000000000000000';
  let normalizedTimestamp;
  if (timestamp === undefined || timestamp === null) {
    normalizedTimestamp = BigInt(Math.floor(Date.now() / 1000));
  } else {
    if (typeof timestamp === 'string' && timestamp.trim().length > 0) {
      normalizedTimestamp = BigInt(timestamp.trim());
    } else if (typeof timestamp === 'number') {
      normalizedTimestamp = BigInt(timestamp);
    } else if (typeof timestamp === 'bigint') {
      normalizedTimestamp = timestamp;
    } else {
      throw new TypeError('timestamp must be a string, number, or bigint');
    }
    if (normalizedTimestamp < 0n) {
      throw new Error('timestamp cannot be negative');
    }
  }

  const encodedMetadata = encodeMetadata(metadata);
  const resultHash = deriveResultHash(result);
  const normalizedResultUri = resultUri ?? '';

  const commitment = keccak256(
    solidityPacked(
      ['bytes32', 'address', 'uint256', 'bytes32', 'bytes'],
      [normalizedJobId, normalizedOperator, normalizedTimestamp, resultHash, encodedMetadata]
    )
  );

  const alphaSummary = normalizeAlphaSummary(normalizedJobId);
  const alphaWU = {
    total: alphaSummary.total,
    bySegment: alphaSummary.bySegment,
    modelClassBreakdown: alphaSummary.modelClassBreakdown,
    slaBreakdown: alphaSummary.slaBreakdown
  };
  alphaWU.quality = {
    modelClass: { ...alphaWU.modelClassBreakdown },
    sla: { ...alphaWU.slaBreakdown }
  };
  alphaWU.breakdown = {
    modelClass: { ...alphaWU.modelClassBreakdown },
    sla: { ...alphaWU.slaBreakdown }
  };
  alphaWU.qualityBreakdown =
    alphaSummary.qualityBreakdown ?? {
      modelClass: { ...alphaWU.modelClassBreakdown },
      sla: { ...alphaWU.slaBreakdown }
    };

  return {
    jobId: normalizedJobId,
    operator: normalizedOperator,
    timestamp: normalizedTimestamp,
    resultHash,
    metadata: encodedMetadata,
    commitment,
    resultUri: normalizedResultUri,
    resultURI: normalizedResultUri,
    alphaWU
  };
}

export function buildProofSubmissionTx({
  jobRegistryAddress,
  jobId,
  commitment,
  resultHash,
  resultUri = '',
  metadata
}) {
  if (!jobRegistryAddress) {
    throw new Error('jobRegistryAddress is required');
  }
  const normalizedRegistry = getAddress(jobRegistryAddress);
  const normalizedJobId = normalizeJobId(jobId);
  const normalizedCommitment = normalizeCommitment(commitment);
  const normalizedResultHash = normalizeResultHash(resultHash);
  const encodedMetadata = encodeMetadata(metadata);

  const data = jobRegistryInterface.encodeFunctionData('submitProof', [
    normalizedJobId,
    normalizedCommitment,
    normalizedResultHash,
    resultUri ?? '',
    encodedMetadata
  ]);

  return {
    to: normalizedRegistry,
    data,
    jobId: normalizedJobId,
    commitment: normalizedCommitment,
    resultHash: normalizedResultHash,
    resultUri: resultUri ?? '',
    metadata: encodedMetadata
  };
}

export {
  JOB_REGISTRY_ABI,
  encodeMetadata as encodeProofMetadata,
  normalizeJobId,
  normalizeCommitment,
  normalizeResultHash,
  deriveResultHash
};
