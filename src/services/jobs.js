import { Interface, getAddress, hexlify, isHexString, toUtf8Bytes, zeroPadValue, keccak256 } from 'ethers';

const JOB_REGISTRY_ABI = [
  'function applyForJob(uint256 jobId, bytes metadata) external',
  'function completeJob(uint256 jobId, bytes32 resultHash, string resultURI) external',
  'function releasePayment(uint256 jobId) external',
  'function acknowledgeWork(uint256 jobId, bytes32 workHash) external',
  'function recordHeartbeat(uint256 jobId) external'
];

const JOB_STATUS_ABI = ['function getJob(uint256 jobId) view returns (tuple(uint8 status, address worker, uint256 expiresAt))'];

const interfaces = {
  registry: new Interface(JOB_REGISTRY_ABI),
  status: new Interface(JOB_STATUS_ABI)
};

function normalizeJobId(jobId) {
  if (jobId === undefined || jobId === null) {
    throw new Error('jobId is required');
  }
  const bigint = typeof jobId === 'bigint' ? jobId : BigInt(jobId);
  if (bigint < 0n) {
    throw new Error('jobId must be a non-negative integer');
  }
  return bigint;
}

function normalizeBytesMetadata(metadata) {
  if (metadata === undefined || metadata === null) {
    return '0x';
  }
  if (isHexString(metadata)) {
    return metadata;
  }
  if (typeof metadata === 'string') {
    return hexlify(toUtf8Bytes(metadata));
  }
  if (metadata instanceof Uint8Array) {
    return hexlify(metadata);
  }
  throw new Error('metadata must be a hex string, UTF-8 string, or Uint8Array');
}

function normalizeResultHash({ resultHash, resultData }) {
  if (resultHash) {
    if (!isHexString(resultHash, 32)) {
      throw new Error('resultHash must be a 32-byte hex value');
    }
    return resultHash;
  }
  if (resultData) {
    const bytes =
      typeof resultData === 'string' && !isHexString(resultData)
        ? toUtf8Bytes(resultData)
        : resultData;
    if (!(bytes instanceof Uint8Array)) {
      throw new Error('resultData must be a hex string, UTF-8 string, or Uint8Array');
    }
    return keccak256(bytes);
  }
  throw new Error('Either resultHash or resultData must be provided');
}

export function buildApplyForJobTx({ jobRegistryAddress, jobId, metadata }) {
  if (!jobRegistryAddress) {
    throw new Error('jobRegistryAddress is required');
  }
  const to = getAddress(jobRegistryAddress);
  const normalizedJobId = normalizeJobId(jobId);
  const normalizedMetadata = normalizeBytesMetadata(metadata);
  const data = interfaces.registry.encodeFunctionData('applyForJob', [normalizedJobId, normalizedMetadata]);
  return { to, data, jobId: normalizedJobId, metadata: normalizedMetadata };
}

export function buildCompleteJobTx({ jobRegistryAddress, jobId, resultHash, resultData, resultURI }) {
  if (!jobRegistryAddress) {
    throw new Error('jobRegistryAddress is required');
  }
  const to = getAddress(jobRegistryAddress);
  const normalizedJobId = normalizeJobId(jobId);
  const hash = normalizeResultHash({ resultHash, resultData });
  const uri = resultURI ?? '';
  const data = interfaces.registry.encodeFunctionData('completeJob', [normalizedJobId, hash, uri]);
  return { to, data, jobId: normalizedJobId, resultHash: hash, resultURI: uri };
}

export function buildReleasePaymentTx({ jobRegistryAddress, jobId }) {
  if (!jobRegistryAddress) {
    throw new Error('jobRegistryAddress is required');
  }
  const to = getAddress(jobRegistryAddress);
  const normalizedJobId = normalizeJobId(jobId);
  const data = interfaces.registry.encodeFunctionData('releasePayment', [normalizedJobId]);
  return { to, data, jobId: normalizedJobId };
}

export function buildAcknowledgeWorkTx({ jobRegistryAddress, jobId, workHash }) {
  if (!jobRegistryAddress) {
    throw new Error('jobRegistryAddress is required');
  }
  if (!workHash) {
    throw new Error('workHash is required');
  }
  if (!isHexString(workHash)) {
    throw new Error('workHash must be a hex string');
  }
  const to = getAddress(jobRegistryAddress);
  const normalizedJobId = normalizeJobId(jobId);
  const paddedHash = isHexString(workHash, 32) ? workHash : zeroPadValue(workHash, 32);
  const data = interfaces.registry.encodeFunctionData('acknowledgeWork', [normalizedJobId, paddedHash]);
  return { to, data, jobId: normalizedJobId, workHash: paddedHash };
}

export function buildRecordHeartbeatTx({ jobRegistryAddress, jobId }) {
  if (!jobRegistryAddress) {
    throw new Error('jobRegistryAddress is required');
  }
  const to = getAddress(jobRegistryAddress);
  const normalizedJobId = normalizeJobId(jobId);
  const data = interfaces.registry.encodeFunctionData('recordHeartbeat', [normalizedJobId]);
  return { to, data, jobId: normalizedJobId };
}

export function encodeGetJobCall({ jobId }) {
  const normalizedJobId = normalizeJobId(jobId);
  return interfaces.status.encodeFunctionData('getJob', [normalizedJobId]);
}

export function decodeJobStatus({ data }) {
  if (!data) {
    throw new Error('data is required');
  }
  const [job] = interfaces.status.decodeFunctionResult('getJob', data);
  const [status, worker, expiresAt] = Array.isArray(job) ? job : [job.status, job.worker, job.expiresAt];
  return {
    status: Number(status),
    worker: getAddress(worker),
    expiresAt: BigInt(expiresAt)
  };
}

export { JOB_REGISTRY_ABI };
