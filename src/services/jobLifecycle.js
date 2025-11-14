import { Contract, getAddress, hexlify, isHexString, toUtf8Bytes } from 'ethers';
import { EventEmitter } from 'node:events';
import pino from 'pino';
import { normalizeJobId, createJobProof } from './jobProof.js';
import { getJobAlphaSummary, getJobAlphaWU } from './metering.js';
import { resolveJobProfile, createInterfaceFromProfile } from './jobProfiles.js';
import { buildActionEntry, buildSnapshotEntry } from './lifecycleJournal.js';
import { createAlphaWorkUnitRegistry, DEFAULT_WINDOWS as DEFAULT_ALPHA_WINDOWS } from './alphaWorkUnits.js';

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

const ALPHA_WORK_UNIT_WINDOWS = DEFAULT_ALPHA_WINDOWS.map((entry) => ({ ...entry }));
const COMPLETION_STATUSES = new Set(['submitted', 'validated', 'finalized', 'failed']);

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

function cloneTags(tagsRaw) {
  if (Array.isArray(tagsRaw)) {
    return tagsRaw.map((entry) => String(entry));
  }
  if (typeof tagsRaw === 'string') {
    return parseTags(tagsRaw);
  }
  return [];
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

async function callFirstAvailable(contract, candidates, { operation = 'operation', onUnavailable } = {}) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const { method, args, overrides } = candidate;
    const fn = contract?.[method];
    if (typeof fn === 'function') {
      const invocationArgs = [...(args ?? [])];
      if (overrides !== undefined && overrides !== null) {
        invocationArgs.push(overrides);
      }
      const response = await fn.apply(contract, invocationArgs);
      return { method, response };
    }
  }
  if (onUnavailable) {
    onUnavailable({
      operation,
      candidates: candidates.map((candidate) => candidate?.method).filter(Boolean)
    });
  }
  throw new Error(`No supported contract method available for ${operation}`);
}

function decodeOpenJobEntry(entry) {
  if (!entry) return null;
  if (Array.isArray(entry)) {
    const [jobId, client, rewardRaw, deadlineRaw, uri, tags] = entry;
    return {
      jobId,
      client: client ?? null,
      rewardRaw,
      deadlineRaw,
      uri: uri ?? '',
      tags
    };
  }
  if (typeof entry === 'object') {
    return {
      jobId: entry.jobId ?? entry.id ?? null,
      client: entry.client ?? null,
      rewardRaw: entry.reward ?? entry.bounty ?? entry.rewardRaw ?? 0,
      deadlineRaw: entry.deadline ?? entry.deadlineRaw ?? 0,
      uri: entry.uri ?? entry.metadataUri ?? '',
      tags: entry.tags ?? []
    };
  }
  return null;
}

function buildMethodCandidates(methodSpecs = [], context = {}) {
  return methodSpecs
    .map((spec) => {
      if (!spec) return null;
      const args = typeof spec.buildArgs === 'function' ? spec.buildArgs(context) ?? [] : [];
      const candidate = {
        method: spec.name,
        args: Array.isArray(args) ? args : []
      };
      if (candidate.args.some((arg) => arg === undefined)) {
        return null;
      }
      if (spec.includeOverrides !== false && context.overrides !== undefined && context.overrides !== null) {
        candidate.overrides = context.overrides;
      }
      return candidate;
    })
    .filter(Boolean);
}

function toNumber(value) {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'bigint') return Number(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cloneAlphaSummary(summary) {
  if (!summary) {
    return null;
  }
  const bySegment = Array.isArray(summary.bySegment)
    ? summary.bySegment.map((segment) => ({
        segmentId: segment.segmentId ?? null,
        jobId: segment.jobId ?? null,
        modelClass: segment.modelClass ?? null,
        slaProfile: segment.slaProfile ?? null,
        deviceClass: segment.deviceClass ?? null,
        vramTier: segment.vramTier ?? null,
        gpuCount: segment.gpuCount ?? null,
        startedAt: segment.startedAt ?? null,
        endedAt: segment.endedAt ?? null,
        gpuMinutes: toNumber(segment.gpuMinutes),
        qualityMultiplier: toNumber(segment.qualityMultiplier),
        alphaWU: toNumber(segment.alphaWU)
      }))
    : [];
  const normalizeBreakdown = (source = {}) =>
    Object.fromEntries(
      Object.entries(source)
        .map(([key, value]) => [key, toNumber(value)])
        .sort(([a], [b]) => a.localeCompare(b))
    );
  const modelClassBreakdown = normalizeBreakdown(summary.modelClassBreakdown);
  const slaBreakdown = normalizeBreakdown(summary.slaBreakdown);
  const quality = {
    modelClass: { ...modelClassBreakdown },
    sla: { ...slaBreakdown }
  };
  const breakdown = {
    modelClass: { ...quality.modelClass },
    sla: { ...quality.sla }
  };
  return {
    total: toNumber(summary.total),
    bySegment,
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

function safeGetJobAlphaTotal(jobId, logger = null) {
  try {
    return toNumber(getJobAlphaWU(jobId));
  } catch (error) {
    logger?.warn?.(error, 'Failed to resolve α-WU total for job');
    return 0;
  }
}

function buildJobAlphaSummary(jobId, logger = null, { totalOverride } = {}) {
  const total = totalOverride !== undefined ? toNumber(totalOverride) : safeGetJobAlphaTotal(jobId, logger);
  let summary = null;
  try {
    summary = getJobAlphaSummary(jobId);
  } catch (error) {
    logger?.warn?.(error, 'Failed to compute α-WU breakdown for job');
  }
  const base = {
    total,
    bySegment: summary?.bySegment ?? [],
    modelClassBreakdown: summary?.modelClassBreakdown ?? {},
    slaBreakdown: summary?.slaBreakdown ?? {}
  };
  return cloneAlphaSummary(base);
}

function resolveAlphaSummary(jobId, logger = null, { totalOverride } = {}) {
  const total = totalOverride !== undefined ? toNumber(totalOverride) : safeGetJobAlphaTotal(jobId, logger);
  return buildJobAlphaSummary(jobId, logger, { totalOverride: total });
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
    updatedAt: job.updatedAt,
    alphaWU: cloneAlphaSummary(job.alphaWU)
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
  profile: profileInput = 'v0',
  profileOverrides = null,
  journal = null,
  logger = pino({ level: 'info', name: 'job-lifecycle' }),
  contractFactory = defaultContractFactory,
  healthGate = null
} = {}) {
  const profile = resolveJobProfile(profileInput, profileOverrides);
  const iface = createInterfaceFromProfile(profile);
  const emitter = new EventEmitter({ captureRejections: true });
  const jobs = new Map();
  const alphaWorkUnits = createAlphaWorkUnitRegistry();
  const metrics = {
    discovered: 0,
    applied: 0,
    submissions: 0,
    finalizations: 0,
    validatorNotifications: 0,
    lastAction: null,
    lastJobProvider: 'agi-jobs',
    activeProfile: profile.id,
    compatibilityWarnings: [],
    alphaWorkUnits: alphaWorkUnits.getMetrics({ windows: ALPHA_WORK_UNIT_WINDOWS }),
    alphaGate: { suppressed: 0 }
  };

  let registryAddress = jobRegistryAddress ? getAddress(jobRegistryAddress) : null;
  let contract = null;
  let watchers = [];

  const compatibilityWarnings = new Map();

  function refreshAlphaWorkUnitMetrics(windowOverrides = null) {
    const windowsToUse = windowOverrides && windowOverrides.length ? windowOverrides : ALPHA_WORK_UNIT_WINDOWS;
    metrics.alphaWorkUnits = alphaWorkUnits.getMetrics({ windows: windowsToUse });
  }

  function recordAlphaWorkUnitEvent(type, payload = {}, options = {}) {
    if (!type || typeof type !== 'string') {
      throw new Error('Alpha work unit event type is required');
    }
    const normalizedType = type.trim().toLowerCase();
    let result;
    switch (normalizedType) {
      case 'mint':
      case 'minted':
        result = alphaWorkUnits.recordMint(payload);
        break;
      case 'validate':
      case 'validated':
        result = alphaWorkUnits.recordValidation(payload);
        break;
      case 'accept':
      case 'accepted':
        result = alphaWorkUnits.recordAcceptance(payload);
        break;
      case 'slash':
      case 'slashed':
        result = alphaWorkUnits.recordSlash(payload);
        break;
      default:
        throw new Error(`Unknown alpha work unit event type: ${type}`);
    }

    refreshAlphaWorkUnitMetrics(options.windows ?? null);

    const gateAllows = healthGate?.shouldEmitAlphaEvent?.({ type: normalizedType, payload }) ?? true;
    if (options.emit !== false && gateAllows) {
      emitter.emit('alpha-wu:event', {
        type: normalizedType,
        unit: result,
        raw: { ...payload }
      });
    } else if (!gateAllows) {
      metrics.alphaGate.suppressed = (metrics.alphaGate.suppressed ?? 0) + 1;
    }

    return result;
  }

  function emitCompatibilityWarning(reason, details = {}) {
    const key = `${reason}:${JSON.stringify(details)}`;
    if (compatibilityWarnings.has(key)) {
      return;
    }
    const warning = { reason, details, at: new Date().toISOString() };
    compatibilityWarnings.set(key, warning);
    metrics.compatibilityWarnings = Array.from(compatibilityWarnings.values());
    emitter.emit('compatibility-warning', { profileId: profile.id, ...warning });
    logger?.warn?.({ profile: profile.id, reason, details }, 'Job registry compatibility warning detected');
  }

  function resetContract() {
    if (!registryAddress || (!provider && !defaultSigner)) {
      contract = null;
      return;
    }
    const connection = defaultSigner ?? provider;
    contract = contractFactory(registryAddress, profile.abi, connection);
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
    const sanitizedPatch = patch ? { ...patch } : {};
    const normalizedStatus =
      typeof sanitizedPatch.status === 'string' && sanitizedPatch.status
        ? sanitizedPatch.status.toLowerCase()
        : existing.status?.toLowerCase?.() ?? null;

    if (sanitizedPatch && Object.prototype.hasOwnProperty.call(sanitizedPatch, 'alphaWU')) {
      sanitizedPatch.alphaWU = cloneAlphaSummary(sanitizedPatch.alphaWU);
    }

    if (COMPLETION_STATUSES.has(normalizedStatus)) {
      let totalOverride;
      try {
        totalOverride = getJobAlphaWU(normalizedJobId);
      } catch (error) {
        logger?.warn?.(error, 'Failed to resolve α-WU total during job completion');
        totalOverride = undefined;
      }
      sanitizedPatch.alphaWU = resolveAlphaSummary(normalizedJobId, logger, {
        totalOverride
      });
    }

    const merged = mergeJobRecord(existing, sanitizedPatch);
    jobs.set(normalizedJobId, merged);
    emitter.emit('job:update', normalizeJobMetadata(merged));
    metrics.discovered = jobs.size;
    return merged;
  }

  function recordAction(action, jobState = null) {
    metrics.lastAction = action?.type ?? null;
    const extendedAction =
      jobState?.alphaWU && typeof jobState.alphaWU === 'object'
        ? { ...action, alphaWU: cloneAlphaSummary(jobState.alphaWU) }
        : action;
    emitter.emit('action', extendedAction);
    if (journal?.append) {
      const normalizedJob = jobState ? normalizeJobMetadata(jobState) : null;
      try {
        journal.append(buildActionEntry(profile.id, extendedAction, normalizedJob));
      } catch (error) {
        logger?.warn?.(error, 'Failed to append lifecycle action entry');
      }
    }
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

    const contract = (() => {
      try {
        return getContract();
      } catch (error) {
        logger?.warn?.(error, 'Job registry contract unavailable for discovery');
        return null;
      }
    })();

    const latestBlock = toBlock ?? (await provider.getBlockNumber());
    const range = Number.isFinite(discoveryBlockRange) ? discoveryBlockRange : 4_800;
    const startBlock = fromBlock ?? Math.max(latestBlock - range + 1, 0);
    const createdEvent = profile.events?.created ?? 'JobCreated';
    const filter = createdEvent ? buildEventFilter(registryAddress, iface, createdEvent) : null;
    let logs = [];
    if (!filter) {
      emitCompatibilityWarning('missing-event', { event: createdEvent, phase: 'discover' });
    } else {
      logs = await provider.getLogs({
        ...filter,
        fromBlock: startBlock,
        toBlock: latestBlock
      });
      logs.slice(-maxJobs).forEach((log) => {
        try {
          const decoded = iface.decodeEventLog(createdEvent, log.data, log.topics);
          const [jobId, client, rewardRaw, deadlineRaw, uri, tags] = decoded;
          recordJob(jobId, {
            client: client ?? null,
            reward: typeof rewardRaw === 'bigint' ? rewardRaw : BigInt(rewardRaw ?? 0),
            deadline: typeof deadlineRaw === 'bigint' ? deadlineRaw : BigInt(deadlineRaw ?? 0),
            uri: uri ?? '',
            tags: parseTags(tags),
            status: 'open',
            lastEvent: {
              type: createdEvent,
              blockNumber: log.blockNumber ?? null,
              transactionHash: log.transactionHash ?? null
            }
          });
        } catch (error) {
          logger?.warn?.(error, `Failed to decode ${createdEvent} log`);
        }
      });
    }

    if (contract && typeof contract.getOpenJobs === 'function') {
      try {
        const openJobs = await contract.getOpenJobs();
        if (Array.isArray(openJobs)) {
          const limit = Number.isFinite(maxJobs) && maxJobs > 0 ? maxJobs : 100;
          openJobs.slice(0, limit).forEach((entry) => {
            const decoded = decodeOpenJobEntry(entry);
            if (!decoded?.jobId) {
              return;
            }
            let normalizedJobId;
            try {
              normalizedJobId = normalizeJobId(decoded.jobId);
            } catch (error) {
              logger?.warn?.(error, 'Failed to normalize job id from getOpenJobs');
              return;
            }
            const existing = jobs.get(normalizedJobId);
            const reward = typeof decoded.rewardRaw === 'bigint' ? decoded.rewardRaw : BigInt(decoded.rewardRaw ?? 0);
            const deadline =
              typeof decoded.deadlineRaw === 'bigint'
                ? decoded.deadlineRaw
                : BigInt(decoded.deadlineRaw ?? 0);
            const patch = {
              client: decoded.client ?? existing?.client ?? null,
              reward,
              deadline,
              uri: decoded.uri ?? existing?.uri ?? '',
              tags: cloneTags(decoded.tags)
            };
            if (!existing?.status || existing.status === 'unknown') {
              patch.status = 'open';
            }
            patch.lastEvent = {
              type: 'getOpenJobs',
              blockNumber: null,
              transactionHash: null
            };
            recordJob(normalizedJobId, patch);
          });
        }
      } catch (error) {
        logger?.warn?.(error, 'Failed to fetch open jobs from registry');
      }
    }

    metrics.discovered = jobs.size;
    const normalizedJobs = Array.from(jobs.values()).map((job) => normalizeJobMetadata(job));
    if (journal?.append) {
      try {
        journal.append(buildSnapshotEntry(profile.id, normalizedJobs));
      } catch (error) {
        logger?.warn?.(error, 'Failed to append discovery snapshot');
      }
    }
    return normalizedJobs;
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

  const methodUnavailable = ({ operation, candidates }) => {
    emitCompatibilityWarning('missing-method', { operation, candidates });
  };

  async function apply(jobId, { subdomain = defaultSubdomain, proof = defaultProof, signer = null, overrides = null } = {}) {
    if (!subdomain) {
      throw new Error('subdomain is required to apply for a job');
    }
    const normalizedJobId = normalizeJobId(jobId);
    const registry = getContract();
    const connection = signer ? registry.connect(signer) : registry;
    const proofBytes = normalizeBytes(proof);
    const context = {
      jobId: normalizedJobId,
      subdomain: subdomain ?? '',
      proof: proofBytes,
      overrides
    };
    const candidates = buildMethodCandidates(profile.methods.apply ?? [], context);
    const { method, response } = await callFirstAvailable(connection, candidates, {
      operation: 'apply',
      onUnavailable: methodUnavailable
    });

    const updated = recordJob(normalizedJobId, {
      status: 'applied',
      subdomain,
      proof: proofBytes,
      lastEvent: {
        type: method,
        transactionHash: response.hash ?? null
      }
    });
    metrics.applied += 1;
    recordAction({ type: 'apply', method, jobId: normalizedJobId, transactionHash: response.hash ?? null }, updated);
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
    overrides = null,
    validator = null
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
      metadata,
      resultUri: resultUri ?? ''
    });

    const context = {
      jobId: normalizedJobId,
      subdomain: subdomain ?? '',
      proof: proofBytes,
      resultUri: resultUri ?? '',
      overrides,
      commitment: proofPayload.commitment,
      resultHash: proofPayload.resultHash,
      metadata: proofPayload.metadata,
      validator: validator ?? null,
      result,
      timestamp,
      operator: connection?.signer?.address ?? defaultSigner?.address ?? null
    };

    const candidates = buildMethodCandidates(profile.methods.submit ?? [], context);

    const { method, response } = await callFirstAvailable(connection, candidates, {
      operation: 'submit',
      onUnavailable: methodUnavailable
    });

    const updated = recordJob(normalizedJobId, {
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
      resultHash: proofPayload.resultHash,
      validator: context.validator ?? null
    }, updated);
    return {
      jobId: normalizedJobId,
      method,
      transactionHash: response.hash ?? null,
      commitment: proofPayload.commitment,
      resultHash: proofPayload.resultHash,
      validator: context.validator ?? null,
      response
    };
  }

  async function finalize(jobId, { signer = null, overrides = null, validator = null } = {}) {
    const normalizedJobId = normalizeJobId(jobId);
    const registry = getContract();
    const connection = signer ? registry.connect(signer) : registry;
    const context = {
      jobId: normalizedJobId,
      overrides,
      validator: validator ?? null
    };
    const candidates = buildMethodCandidates(profile.methods.finalize ?? [], context);
    const { method, response } = await callFirstAvailable(connection, candidates, {
      operation: 'finalize',
      onUnavailable: methodUnavailable
    });

    const updated = recordJob(normalizedJobId, {
      status: 'finalized',
      lastEvent: {
        type: method,
        transactionHash: response.hash ?? null
      }
    });
    metrics.finalizations += 1;
    recordAction(
      {
        type: 'finalize',
        method,
        jobId: normalizedJobId,
        transactionHash: response.hash ?? null,
        validator: context.validator ?? null
      },
      updated
    );
    return {
      jobId: normalizedJobId,
      method,
      transactionHash: response.hash ?? null,
      validator: context.validator ?? null,
      response
    };
  }

  async function notifyValidator(jobId, validatorAddress, { signer = null, overrides = null } = {}) {
    if (!profile.methods?.notifyValidator?.length) {
      throw new Error('Validator notification not supported by active job registry profile');
    }
    if (!validatorAddress) {
      throw new Error('validator address is required to notify validator');
    }
    let normalizedValidator;
    try {
      normalizedValidator = getAddress(validatorAddress);
    } catch (error) {
      throw new Error(`Invalid validator address: ${error.message}`);
    }
    const normalizedJobId = normalizeJobId(jobId);
    const registry = getContract();
    const connection = signer ? registry.connect(signer) : registry;
    const context = {
      jobId: normalizedJobId,
      validator: normalizedValidator,
      overrides
    };
    const candidates = buildMethodCandidates(profile.methods.notifyValidator ?? [], context);
    const { method, response } = await callFirstAvailable(connection, candidates, {
      operation: 'notifyValidator',
      onUnavailable: methodUnavailable
    });
    metrics.validatorNotifications += 1;
    const updated = recordJob(normalizedJobId, {
      lastEvent: {
        type: method,
        transactionHash: response.hash ?? null
      }
    });
    recordAction(
      {
        type: 'notifyValidator',
        method,
        jobId: normalizedJobId,
        validator: normalizedValidator,
        transactionHash: response.hash ?? null
      },
      updated
    );
    return {
      jobId: normalizedJobId,
      method,
      transactionHash: response.hash ?? null,
      validator: normalizedValidator,
      response
    };
  }

  function listJobs() {
    return Array.from(jobs.values()).map((job) => normalizeJobMetadata(job));
  }

  function getJob(jobId) {
    if (!jobId) return null;
    const normalizedJobId = normalizeJobId(jobId);
    return normalizeJobMetadata(jobs.get(normalizedJobId));
  }

  function getMetrics({ alphaWindows = null } = {}) {
    refreshAlphaWorkUnitMetrics(alphaWindows ?? null);
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
    const createdEvent = profile.events?.created ?? 'JobCreated';
    const appliedEvent = profile.events?.applied ?? 'JobApplied';
    const assignedEvent = profile.events?.assigned ?? 'JobAssigned';
    const submittedEvent = profile.events?.submitted ?? 'JobSubmitted';
    const finalizedEvent = profile.events?.finalized ?? 'JobFinalized';
    const validatedEvent = profile.events?.validated ?? null;

    const createdFilter = createdEvent ? buildEventFilter(registryAddress, iface, createdEvent) : null;
    const appliedFilter = appliedEvent ? buildEventFilter(registryAddress, iface, appliedEvent) : null;
    const assignedFilter = assignedEvent ? buildEventFilter(registryAddress, iface, assignedEvent) : null;
    const submittedFilter = submittedEvent ? buildEventFilter(registryAddress, iface, submittedEvent) : null;
    const finalizedFilter = finalizedEvent ? buildEventFilter(registryAddress, iface, finalizedEvent) : null;
    const validatedFilter = validatedEvent ? buildEventFilter(registryAddress, iface, validatedEvent) : null;

    if (createdEvent && !createdFilter) emitCompatibilityWarning('missing-event', { event: createdEvent, phase: 'watch' });
    if (appliedEvent && !appliedFilter) emitCompatibilityWarning('missing-event', { event: appliedEvent, phase: 'watch' });
    if (assignedEvent && !assignedFilter) emitCompatibilityWarning('missing-event', { event: assignedEvent, phase: 'watch' });
    if (submittedEvent && !submittedFilter) emitCompatibilityWarning('missing-event', { event: submittedEvent, phase: 'watch' });
    if (finalizedEvent && !finalizedFilter) emitCompatibilityWarning('missing-event', { event: finalizedEvent, phase: 'watch' });
    if (validatedEvent && !validatedFilter) emitCompatibilityWarning('missing-event', { event: validatedEvent, phase: 'watch' });

    attachWatcher(createdFilter, async (log) => {
      try {
        const decoded = iface.decodeEventLog(createdEvent, log.data, log.topics);
        const [jobId, client, rewardRaw, deadlineRaw, uri, tags] = decoded;
        recordJob(jobId, {
          client: client ?? null,
          reward: typeof rewardRaw === 'bigint' ? rewardRaw : BigInt(rewardRaw ?? 0),
          deadline: typeof deadlineRaw === 'bigint' ? deadlineRaw : BigInt(deadlineRaw ?? 0),
          uri: uri ?? '',
          tags: parseTags(tags),
          status: 'open',
          lastEvent: {
            type: createdEvent,
            blockNumber: log.blockNumber ?? null,
            transactionHash: log.transactionHash ?? null
          }
        });
      } catch (error) {
        logger?.warn?.(error, `Failed to process ${createdEvent} event`);
      }
    });

    attachWatcher(appliedFilter, async (log) => {
      try {
        const decoded = iface.decodeEventLog(appliedEvent, log.data, log.topics);
        const [jobId, worker] = decoded;
        recordJob(jobId, {
          worker: worker ?? null,
          status: 'applied',
          lastEvent: {
            type: appliedEvent,
            blockNumber: log.blockNumber ?? null,
            transactionHash: log.transactionHash ?? null
          }
        });
      } catch (error) {
        logger?.warn?.(error, `Failed to process ${appliedEvent} event`);
      }
    });

    attachWatcher(assignedFilter, async (log) => {
      try {
        const decoded = iface.decodeEventLog(assignedEvent, log.data, log.topics);
        const [jobId, worker] = decoded;
        recordJob(jobId, {
          worker: worker ?? null,
          status: 'assigned',
          lastEvent: {
            type: assignedEvent,
            blockNumber: log.blockNumber ?? null,
            transactionHash: log.transactionHash ?? null
          }
        });
      } catch (error) {
        logger?.warn?.(error, `Failed to process ${assignedEvent} event`);
      }
    });

    attachWatcher(submittedFilter, async (log) => {
      try {
        const decoded = iface.decodeEventLog(submittedEvent, log.data, log.topics);
        const [jobId, client, worker, resultHash, resultUri] = decoded;
        const normalizedJobId = normalizeJobId(jobId);
        recordJob(normalizedJobId, {
          client: client ?? null,
          worker: worker ?? null,
          status: 'submitted',
          resultHash,
          resultUri,
          lastEvent: {
            type: submittedEvent,
            blockNumber: log.blockNumber ?? null,
            transactionHash: log.transactionHash ?? null
          }
        });
      } catch (error) {
        logger?.warn?.(error, `Failed to process ${submittedEvent} event`);
      }
    });

    attachWatcher(finalizedFilter, async (log) => {
      try {
        const decoded = iface.decodeEventLog(finalizedEvent, log.data, log.topics);
        const [jobId, client, worker] = decoded;
        const normalizedJobId = normalizeJobId(jobId);
        const updated = recordJob(normalizedJobId, {
          client: client ?? null,
          worker: worker ?? null,
          status: 'finalized',
          lastEvent: {
            type: finalizedEvent,
            blockNumber: log.blockNumber ?? null,
            transactionHash: log.transactionHash ?? null
          }
        });
        metrics.finalizations += 1;
        if (journal?.append) {
          try {
            journal.append(
              buildActionEntry(profile.id, {
                type: 'finalized-event',
                jobId: updated?.jobId ?? null,
                event: finalizedEvent,
                blockNumber: log.blockNumber ?? null,
                transactionHash: log.transactionHash ?? null
              }, normalizeJobMetadata(updated))
            );
          } catch (error) {
            logger?.warn?.(error, 'Failed to append finalized event entry');
          }
        }
      } catch (error) {
        logger?.warn?.(error, `Failed to process ${finalizedEvent} event`);
      }
    });

    attachWatcher(validatedFilter, async (log) => {
      try {
        const decoded = iface.decodeEventLog(validatedEvent, log.data, log.topics);
        const [jobId, validator, accepted] = decoded;
        const updated = recordJob(jobId, {
          status: accepted ? 'validated' : 'submitted',
          lastEvent: {
            type: validatedEvent,
            blockNumber: log.blockNumber ?? null,
            transactionHash: log.transactionHash ?? null
          }
        });
        metrics.validatorNotifications += 1;
        recordAction(
          {
            type: 'validation',
            jobId: updated?.jobId ?? null,
            validator: validator ?? null,
            accepted: Boolean(accepted),
            event: validatedEvent,
            blockNumber: log.blockNumber ?? null,
            transactionHash: log.transactionHash ?? null
          },
          updated
        );
      } catch (error) {
        logger?.warn?.(error, `Failed to process ${validatedEvent} event`);
      }
    });

    const alphaMintedEvent = profile.events?.alphaWUMinted ?? null;
    const alphaValidatedEvent = profile.events?.alphaWUValidated ?? null;
    const alphaAcceptedEvent = profile.events?.alphaWUAccepted ?? null;
    const slashAppliedEvent = profile.events?.slashApplied ?? null;

    const alphaMintedFilter = alphaMintedEvent ? buildEventFilter(registryAddress, iface, alphaMintedEvent) : null;
    const alphaValidatedFilter = alphaValidatedEvent ? buildEventFilter(registryAddress, iface, alphaValidatedEvent) : null;
    const alphaAcceptedFilter = alphaAcceptedEvent ? buildEventFilter(registryAddress, iface, alphaAcceptedEvent) : null;
    const slashAppliedFilter = slashAppliedEvent ? buildEventFilter(registryAddress, iface, slashAppliedEvent) : null;

    if (alphaMintedEvent && !alphaMintedFilter) {
      emitCompatibilityWarning('missing-event', { event: alphaMintedEvent, phase: 'watch' });
    }
    if (alphaValidatedEvent && !alphaValidatedFilter) {
      emitCompatibilityWarning('missing-event', { event: alphaValidatedEvent, phase: 'watch' });
    }
    if (alphaAcceptedEvent && !alphaAcceptedFilter) {
      emitCompatibilityWarning('missing-event', { event: alphaAcceptedEvent, phase: 'watch' });
    }
    if (slashAppliedEvent && !slashAppliedFilter) {
      emitCompatibilityWarning('missing-event', { event: slashAppliedEvent, phase: 'watch' });
    }

    attachWatcher(alphaMintedFilter, async (log) => {
      if (!alphaMintedEvent) return;
      try {
        const decoded = iface.decodeEventLog(alphaMintedEvent, log.data, log.topics);
        const [unitId, agent, node, timestamp] = decoded;
        recordAlphaWorkUnitEvent('minted', {
          id: unitId,
          agent,
          node,
          timestamp
        });
      } catch (error) {
        logger?.warn?.(error, `Failed to process ${alphaMintedEvent} event`);
      }
    });

    attachWatcher(alphaValidatedFilter, async (log) => {
      if (!alphaValidatedEvent) return;
      try {
        const decoded = iface.decodeEventLog(alphaValidatedEvent, log.data, log.topics);
        const [unitId, validator, stake, score, timestamp] = decoded;
        recordAlphaWorkUnitEvent('validated', {
          id: unitId,
          validator,
          stake,
          score,
          timestamp
        });
      } catch (error) {
        logger?.warn?.(error, `Failed to process ${alphaValidatedEvent} event`);
      }
    });

    attachWatcher(alphaAcceptedFilter, async (log) => {
      if (!alphaAcceptedEvent) return;
      try {
        const decoded = iface.decodeEventLog(alphaAcceptedEvent, log.data, log.topics);
        const [unitId, timestamp] = decoded;
        recordAlphaWorkUnitEvent('accepted', {
          id: unitId,
          timestamp
        });
      } catch (error) {
        logger?.warn?.(error, `Failed to process ${alphaAcceptedEvent} event`);
      }
    });

    attachWatcher(slashAppliedFilter, async (log) => {
      if (!slashAppliedEvent) return;
      try {
        const decoded = iface.decodeEventLog(slashAppliedEvent, log.data, log.topics);
        const [unitId, validator, amount, timestamp] = decoded;
        recordAlphaWorkUnitEvent('slashed', {
          id: unitId,
          validator,
          amount,
          timestamp
        });
      } catch (error) {
        logger?.warn?.(error, `Failed to process ${slashAppliedEvent} event`);
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
    notifyValidator,
    listJobs,
    getJob,
    getMetrics,
    recordAlphaWorkUnitEvent,
    getAlphaWorkUnitMetrics: (options = {}) => alphaWorkUnits.getMetrics(options),
    watch,
    stop,
    updateConfig,
    on,
    off,
    __getInternalState: () => ({ jobs, metrics, alphaWorkUnits: alphaWorkUnits.exportState() })
  };
}
