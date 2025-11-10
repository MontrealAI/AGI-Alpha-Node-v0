import { Contract, Interface, getAddress, hexlify, isHexString, toUtf8Bytes } from 'ethers';
import { EventEmitter } from 'node:events';
import pino from 'pino';
import { normalizeJobId, createJobProof } from './jobProof.js';

const JOB_REGISTRY_ABI = [
  'event JobCreated(bytes32 indexed jobId, address indexed client, uint256 reward, uint256 deadline, string uri, string tags)',
  'event JobApplied(bytes32 indexed jobId, address indexed worker)',
  'event JobAssigned(bytes32 indexed jobId, address indexed worker)',
  'event JobSubmitted(bytes32 indexed jobId, address indexed client, address indexed worker, bytes32 resultHash, string resultURI)',
  'event JobFinalized(bytes32 indexed jobId, address indexed client, address indexed worker)',
  'function getOpenJobs() view returns (tuple(bytes32 jobId,address client,uint256 reward,uint256 deadline,string uri,string tags)[])',
  'function jobCount() view returns (uint256)',
  'function jobs(bytes32 jobId) view returns (tuple(address client,address worker,uint8 status,uint256 reward,uint256 deadline,string uri,string tags))',
  'function applyForJob(bytes32 jobId,string subdomain,bytes proof)',
  'function apply(bytes32 jobId,string subdomain,bytes proof)',
  'function submit(bytes32 jobId,bytes32 resultHash,string resultURI,string subdomain,bytes proof)',
  'function submitProof(bytes32 jobId,bytes32 commitment,bytes32 resultHash,string resultURI,bytes metadata)',
  'function completeJob(bytes32 jobId,bytes32 resultHash,string resultURI)',
  'function finalize(bytes32 jobId)',
  'function finalizeJob(bytes32 jobId)'
];

const JOB_STATUS_MAP = {
  0: 'open',
  1: 'applied',
  2: 'assigned',
  3: 'submitted',
  4: 'validated',
  5: 'finalized',
  6: 'cancelled',
  7: 'failed'
};

const defaultContractFactory = (address, abi, providerOrSigner) => new Contract(address, abi, providerOrSigner);

function normalizeBytes(value) {
  if (value === undefined || value === null) {
    return '0x';
  }
  if (value instanceof Uint8Array) {
    return hexlify(value);
  }
  if (Array.isArray(value)) {
    return hexlify(Uint8Array.from(value));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return '0x';
    }
    if (trimmed.startsWith('0x')) {
      if (!isHexString(trimmed)) {
        throw new Error('Value must be a valid hex string');
      }
      return trimmed.toLowerCase();
    }
    return hexlify(toUtf8Bytes(trimmed));
  }
  throw new TypeError('Unsupported byte-like value; expected hex string, utf-8 string, array, or Uint8Array');
}

function parseTags(raw) {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((entry) => String(entry));
    }
  } catch {
    // fall through
  }
  return [trimmed];
}

function deriveStatus(value) {
  if (typeof value === 'string') {
    return value.toLowerCase();
  }
  if (typeof value === 'number') {
    return JOB_STATUS_MAP[value] ?? 'unknown';
  }
  if (typeof value === 'bigint') {
    const numeric = Number(value);
    return JOB_STATUS_MAP[numeric] ?? 'unknown';
  }
  return 'unknown';
}

function decodeJobTuple(tuple) {
  if (!tuple) return null;
  const [client, worker, statusRaw, rewardRaw, deadlineRaw, uri, tagsRaw] = tuple;
  return {
    client: client ?? null,
    worker: worker ?? null,
    status: deriveStatus(statusRaw),
    reward: typeof rewardRaw === 'bigint' ? rewardRaw : BigInt(rewardRaw ?? 0),
    deadline: typeof deadlineRaw === 'bigint' ? deadlineRaw : BigInt(deadlineRaw ?? 0),
    uri: uri ?? '',
    tags: parseTags(tagsRaw)
  };
}

function mergeJobRecord(existing, patch) {
  const now = new Date().toISOString();
  return {
    ...existing,
    ...patch,
    updatedAt: now,
    createdAt: existing?.createdAt ?? now
  };
}

function buildEventFilter(address, iface, eventName) {
  try {
    const fragment = iface.getEvent(eventName);
    const topic = fragment?.topicHash ?? (typeof iface.getEventTopic === 'function' ? iface.getEventTopic(eventName) : null);
    if (!topic) {
      return null;
    }
    return { address, topics: [topic] };
  } catch {
    return null;
  }
}

async function callFirstAvailable(contract, candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const { method, args, overrides } = candidate;
    const fn = contract?.[method];
    if (typeof fn === 'function') {
      const response = await fn.apply(contract, [...(args ?? []), ...(overrides ? [overrides] : [])]);
      return { method, response };
    }
  }
  throw new Error('No supported contract method available for this operation');
}

function normalizeJobMetadata(job) {
  if (!job) return null;
  return {
    jobId: job.jobId,
    client: job.client ?? null,
    worker: job.worker ?? null,
    reward: job.reward ?? 0n,
    deadline: job.deadline ?? 0n,
    uri: job.uri ?? '',
    tags: Array.isArray(job.tags) ? job.tags : [],
    status: job.status ?? 'unknown',
    lastEvent: job.lastEvent ?? null,
    commitment: job.commitment ?? null,
    resultHash: job.resultHash ?? null,
    resultUri: job.resultUri ?? null,
    subdomain: job.subdomain ?? null,
    proof: job.proof ?? null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
}

export function createJobLifecycle({
  provider = null,
  jobRegistryAddress = null,
  defaultSigner = null,
  defaultSubdomain = null,
  defaultProof = '0x',
  discoveryBlockRange = 4_800,
  offlineJobs = [],
  logger = pino({ level: 'info', name: 'job-lifecycle' }),
  contractFactory = defaultContractFactory
} = {}) {
  const emitter = new EventEmitter({ captureRejections: true });
  const jobs = new Map();
  const metrics = {
    discovered: 0,
    applied: 0,
    submissions: 0,
    finalizations: 0,
    lastAction: null,
    lastJobProvider: 'agi-jobs'
  };

  let registryAddress = jobRegistryAddress ? getAddress(jobRegistryAddress) : null;
  let contract = null;
  let watchers = [];

  const iface = new Interface(JOB_REGISTRY_ABI);

  function resetContract() {
    if (!registryAddress || (!provider && !defaultSigner)) {
      contract = null;
      return;
    }
    const connection = defaultSigner ?? provider;
    contract = contractFactory(registryAddress, JOB_REGISTRY_ABI, connection);
  }

  function setContract(newAddress) {
    registryAddress = newAddress ? getAddress(newAddress) : null;
    resetContract();
  }

  function getContract() {
    if (!contract) {
      throw new Error('Job registry contract not configured');
    }
    return contract;
  }

  function attachWatcher(filter, handler) {
    if (!filter || !provider) return;
    provider.on(filter, handler);
    watchers.push({ filter, handler });
  }

  function detachWatchers() {
    if (!provider) return;
    watchers.forEach(({ filter, handler }) => {
      try {
        provider.off(filter, handler);
      } catch (error) {
        logger?.warn?.(error, 'Failed to detach job lifecycle watcher');
      }
    });
    watchers = [];
  }

  function recordJob(jobId, patch) {
    if (!jobId) return null;
    const normalizedJobId = normalizeJobId(jobId);
    const existing = jobs.get(normalizedJobId) ?? { jobId: normalizedJobId };
    const merged = mergeJobRecord(existing, patch);
    jobs.set(normalizedJobId, merged);
    emitter.emit('job:update', normalizeJobMetadata(merged));
    metrics.discovered = jobs.size;
    return merged;
  }

  function recordAction(action) {
    metrics.lastAction = action?.type ?? null;
    emitter.emit('action', action);
  }

  function ingestOfflineJobs(entries) {
    if (!Array.isArray(entries)) return;
    entries.forEach((job) => {
      if (!job?.jobId) return;
      jobs.set(job.jobId, mergeJobRecord(job, {}));
    });
    metrics.discovered = jobs.size;
  }

  async function discover({ fromBlock, toBlock, maxJobs = 100 } = {}) {
    if (!registryAddress) {
      return Array.from(jobs.values()).map((job) => normalizeJobMetadata(job));
    }
    if (!provider) {
      logger?.warn?.('Provider not available – returning cached jobs only');
      return Array.from(jobs.values()).map((job) => normalizeJobMetadata(job));
    }

    const latestBlock = toBlock ?? (await provider.getBlockNumber());
    const range = Number.isFinite(discoveryBlockRange) ? discoveryBlockRange : 4_800;
    const startBlock = fromBlock ?? Math.max(latestBlock - range + 1, 0);
    const filter = buildEventFilter(registryAddress, iface, 'JobCreated');
    if (!filter) {
      logger?.warn?.('JobCreated event not available on registry interface');
      return Array.from(jobs.values()).map((job) => normalizeJobMetadata(job));
    }
    const logs = await provider.getLogs({
      ...filter,
      fromBlock: startBlock,
      toBlock: latestBlock
    });
    logs.slice(-maxJobs).forEach((log) => {
      try {
        const decoded = iface.decodeEventLog('JobCreated', log.data, log.topics);
        const [jobId, client, rewardRaw, deadlineRaw, uri, tags] = decoded;
        recordJob(jobId, {
          client: client ?? null,
          reward: typeof rewardRaw === 'bigint' ? rewardRaw : BigInt(rewardRaw ?? 0),
          deadline: typeof deadlineRaw === 'bigint' ? deadlineRaw : BigInt(deadlineRaw ?? 0),
          uri: uri ?? '',
          tags: parseTags(tags),
          status: 'open',
          lastEvent: {
            type: 'JobCreated',
            blockNumber: log.blockNumber ?? null,
            transactionHash: log.transactionHash ?? null
          }
        });
      } catch (error) {
        logger?.warn?.(error, 'Failed to decode JobCreated log');
      }
    });

    metrics.discovered = jobs.size;
    return Array.from(jobs.values()).map((job) => normalizeJobMetadata(job));
  }

  async function refreshJob(jobId) {
    try {
      const registry = getContract();
      if (typeof registry.jobs !== 'function') {
        return null;
      }
      const normalizedJobId = normalizeJobId(jobId);
      const tuple = await registry.jobs(normalizedJobId);
      const decoded = decodeJobTuple(tuple);
      if (!decoded) return null;
      recordJob(normalizedJobId, {
        client: decoded.client,
        worker: decoded.worker,
        status: decoded.status,
        reward: decoded.reward,
        deadline: decoded.deadline,
        uri: decoded.uri,
        tags: decoded.tags
      });
      return jobs.get(normalizedJobId);
    } catch (error) {
      logger?.warn?.(error, 'Failed to refresh job state');
      return null;
    }
  }

  async function apply(jobId, { subdomain = defaultSubdomain, proof = defaultProof, signer = null, overrides = null } = {}) {
    if (!subdomain) {
      throw new Error('subdomain is required to apply for a job');
    }
    const normalizedJobId = normalizeJobId(jobId);
    const registry = getContract();
    const connection = signer ? registry.connect(signer) : registry;
    const proofBytes = normalizeBytes(proof);
    const { method, response } = await callFirstAvailable(connection, [
      { method: 'applyForJob', args: [normalizedJobId, subdomain, proofBytes] },
      { method: 'apply', args: [normalizedJobId, subdomain, proofBytes] }
    ]);

    recordJob(normalizedJobId, {
      status: 'applied',
      subdomain,
      proof: proofBytes,
      lastEvent: {
        type: method,
        transactionHash: response.hash ?? null
      }
    });
    metrics.applied += 1;
    recordAction({ type: 'apply', method, jobId: normalizedJobId, transactionHash: response.hash ?? null });
    return { jobId: normalizedJobId, method, transactionHash: response.hash ?? null, response };
  }

  async function submit(jobId, {
    result,
    resultUri = '',
    metadata,
    subdomain = defaultSubdomain,
    proof = defaultProof,
    signer = null,
    timestamp,
    overrides = null
  } = {}) {
    if (result === undefined || result === null) {
      throw new Error('result is required to submit a job');
    }
    const normalizedJobId = normalizeJobId(jobId);
    const registry = getContract();
    const connection = signer ? registry.connect(signer) : registry;
    const proofBytes = normalizeBytes(proof);
    const proofPayload = createJobProof({
      jobId: normalizedJobId,
      result,
      operator: connection?.signer?.address ?? defaultSigner?.address ?? null,
      timestamp,
      metadata
    });

    const candidates = [
      {
        method: 'submitProof',
        args: [normalizedJobId, proofPayload.commitment, proofPayload.resultHash, resultUri ?? '', proofPayload.metadata],
        overrides
      },
      {
        method: 'submit',
        args: [normalizedJobId, proofPayload.resultHash, resultUri ?? '', subdomain ?? '', proofBytes],
        overrides
      },
      {
        method: 'completeJob',
        args: [normalizedJobId, proofPayload.resultHash, resultUri ?? ''],
        overrides
      }
    ];

    const { method, response } = await callFirstAvailable(connection, candidates);

    recordJob(normalizedJobId, {
      status: 'submitted',
      resultHash: proofPayload.resultHash,
      resultUri: resultUri ?? '',
      commitment: proofPayload.commitment,
      proof: proofBytes,
      lastEvent: {
        type: method,
        transactionHash: response.hash ?? null
      }
    });
    metrics.submissions += 1;
    recordAction({
      type: 'submit',
      method,
      jobId: normalizedJobId,
      transactionHash: response.hash ?? null,
      commitment: proofPayload.commitment,
      resultHash: proofPayload.resultHash
    });
    return {
      jobId: normalizedJobId,
      method,
      transactionHash: response.hash ?? null,
      commitment: proofPayload.commitment,
      resultHash: proofPayload.resultHash,
      response
    };
  }

  async function finalize(jobId, { signer = null, overrides = null } = {}) {
    const normalizedJobId = normalizeJobId(jobId);
    const registry = getContract();
    const connection = signer ? registry.connect(signer) : registry;
    const { method, response } = await callFirstAvailable(connection, [
      { method: 'finalize', args: [normalizedJobId], overrides },
      { method: 'finalizeJob', args: [normalizedJobId], overrides }
    ]);

    recordJob(normalizedJobId, {
      status: 'finalized',
      lastEvent: {
        type: method,
        transactionHash: response.hash ?? null
      }
    });
    metrics.finalizations += 1;
    recordAction({ type: 'finalize', method, jobId: normalizedJobId, transactionHash: response.hash ?? null });
    return { jobId: normalizedJobId, method, transactionHash: response.hash ?? null, response };
  }

  function listJobs() {
    return Array.from(jobs.values()).map((job) => normalizeJobMetadata(job));
  }

  function getJob(jobId) {
    if (!jobId) return null;
    const normalizedJobId = normalizeJobId(jobId);
    return normalizeJobMetadata(jobs.get(normalizedJobId));
  }

  function getMetrics() {
    return { ...metrics };
  }

  function on(eventName, handler) {
    emitter.on(eventName, handler);
    return () => emitter.off(eventName, handler);
  }

  function off(eventName, handler) {
    emitter.off(eventName, handler);
  }

  function watch() {
    if (!provider || !registryAddress) {
      return () => {};
    }
    detachWatchers();
    const createdFilter = buildEventFilter(registryAddress, iface, 'JobCreated');
    const appliedFilter = buildEventFilter(registryAddress, iface, 'JobApplied');
    const assignedFilter = buildEventFilter(registryAddress, iface, 'JobAssigned');
    const submittedFilter = buildEventFilter(registryAddress, iface, 'JobSubmitted');
    const finalizedFilter = buildEventFilter(registryAddress, iface, 'JobFinalized');

    attachWatcher(createdFilter, async (log) => {
      try {
        const decoded = iface.decodeEventLog('JobCreated', log.data, log.topics);
        const [jobId, client, rewardRaw, deadlineRaw, uri, tags] = decoded;
        recordJob(jobId, {
          client: client ?? null,
          reward: typeof rewardRaw === 'bigint' ? rewardRaw : BigInt(rewardRaw ?? 0),
          deadline: typeof deadlineRaw === 'bigint' ? deadlineRaw : BigInt(deadlineRaw ?? 0),
          uri: uri ?? '',
          tags: parseTags(tags),
          status: 'open',
          lastEvent: {
            type: 'JobCreated',
            blockNumber: log.blockNumber ?? null,
            transactionHash: log.transactionHash ?? null
          }
        });
      } catch (error) {
        logger?.warn?.(error, 'Failed to process JobCreated event');
      }
    });

    attachWatcher(appliedFilter, async (log) => {
      try {
        const decoded = iface.decodeEventLog('JobApplied', log.data, log.topics);
        const [jobId, worker] = decoded;
        recordJob(jobId, {
          worker: worker ?? null,
          status: 'applied',
          lastEvent: {
            type: 'JobApplied',
            blockNumber: log.blockNumber ?? null,
            transactionHash: log.transactionHash ?? null
          }
        });
      } catch (error) {
        logger?.warn?.(error, 'Failed to process JobApplied event');
      }
    });

    attachWatcher(assignedFilter, async (log) => {
      try {
        const decoded = iface.decodeEventLog('JobAssigned', log.data, log.topics);
        const [jobId, worker] = decoded;
        recordJob(jobId, {
          worker: worker ?? null,
          status: 'assigned',
          lastEvent: {
            type: 'JobAssigned',
            blockNumber: log.blockNumber ?? null,
            transactionHash: log.transactionHash ?? null
          }
        });
      } catch (error) {
        logger?.warn?.(error, 'Failed to process JobAssigned event');
      }
    });

    attachWatcher(submittedFilter, async (log) => {
      try {
        const decoded = iface.decodeEventLog('JobSubmitted', log.data, log.topics);
        const [jobId, client, worker, resultHash, resultUri] = decoded;
        recordJob(jobId, {
          client: client ?? null,
          worker: worker ?? null,
          status: 'submitted',
          resultHash,
          resultUri,
          lastEvent: {
            type: 'JobSubmitted',
            blockNumber: log.blockNumber ?? null,
            transactionHash: log.transactionHash ?? null
          }
        });
      } catch (error) {
        logger?.warn?.(error, 'Failed to process JobSubmitted event');
      }
    });

    attachWatcher(finalizedFilter, async (log) => {
      try {
        const decoded = iface.decodeEventLog('JobFinalized', log.data, log.topics);
        const [jobId, client, worker] = decoded;
        recordJob(jobId, {
          client: client ?? null,
          worker: worker ?? null,
          status: 'finalized',
          lastEvent: {
            type: 'JobFinalized',
            blockNumber: log.blockNumber ?? null,
            transactionHash: log.transactionHash ?? null
          }
        });
        metrics.finalizations += 1;
      } catch (error) {
        logger?.warn?.(error, 'Failed to process JobFinalized event');
      }
    });

    return () => {
      detachWatchers();
    };
  }

  function stop() {
    detachWatchers();
    emitter.removeAllListeners();
  }

  function updateConfig(partial = {}) {
    if (partial.jobRegistryAddress && partial.jobRegistryAddress !== registryAddress) {
      setContract(partial.jobRegistryAddress);
      detachWatchers();
    }
    if (partial.defaultSigner && partial.defaultSigner !== defaultSigner) {
      defaultSigner = partial.defaultSigner;
      resetContract();
    }
    if (partial.defaultSubdomain) {
      defaultSubdomain = partial.defaultSubdomain;
    }
    if (partial.defaultProof) {
      defaultProof = partial.defaultProof;
    }
    if (Number.isFinite(partial.discoveryBlockRange) && partial.discoveryBlockRange > 0) {
      discoveryBlockRange = partial.discoveryBlockRange;
    }
  }

  // initial setup
  resetContract();
  ingestOfflineJobs(offlineJobs);

  return {
    discover,
    refreshJob,
    apply,
    submit,
    finalize,
    listJobs,
    getJob,
    getMetrics,
    watch,
    stop,
    updateConfig,
    on,
    off,
    __getInternalState: () => ({ jobs, metrics })
  };
}

export { JOB_REGISTRY_ABI };
