import { EventEmitter } from 'node:events';
import { validationResultSchema } from '../validation/alpha_wu_validator.js';

function deriveJobIdFromWorkUnit(wuId) {
  if (!wuId || typeof wuId !== 'string') {
    return null;
  }
  const delimiterIndex = wuId.indexOf(':');
  if (delimiterIndex === -1) {
    return wuId;
  }
  return wuId.slice(0, delimiterIndex);
}

export function createQuorumEngine({
  quorumNumerator = 2,
  quorumDenominator = 3,
  minimumVotes = 3,
  clock = () => Date.now(),
  logger = null
} = {}) {
  if (!Number.isFinite(quorumNumerator) || quorumNumerator <= 0) {
    throw new Error('quorumNumerator must be positive');
  }
  if (!Number.isFinite(quorumDenominator) || quorumDenominator <= 0) {
    throw new Error('quorumDenominator must be positive');
  }
  if (!Number.isFinite(minimumVotes) || minimumVotes <= 0) {
    throw new Error('minimumVotes must be positive');
  }

  const emitter = new EventEmitter({ captureRejections: true });
  const records = new Map();
  const jobs = new Map();
  const threshold = quorumNumerator / quorumDenominator;

  function ensureRecord(wuId) {
    if (!records.has(wuId)) {
      records.set(wuId, {
        wuId,
        jobId: deriveJobIdFromWorkUnit(wuId),
        validators: new Map(),
        finalized: false,
        status: 'pending',
        finalizedAt: null
      });
    }
    return records.get(wuId);
  }

  function ensureJob(jobId) {
    if (!jobId) {
      return null;
    }
    if (!jobs.has(jobId)) {
      jobs.set(jobId, {
        jobId,
        units: new Map(),
        status: 'pending',
        finalizedAt: null
      });
    }
    return jobs.get(jobId);
  }

  function computeStats(record) {
    const validators = Array.from(record.validators.values());
    const valid = validators.filter((entry) => entry.is_valid).length;
    const invalid = validators.length - valid;
    return {
      total: validators.length,
      valid,
      invalid
    };
  }

  function finalizeRecord(record, status) {
    if (record.finalized) {
      return;
    }
    record.finalized = true;
    record.status = status;
    record.finalizedAt = new Date(clock()).toISOString();
    const job = ensureJob(record.jobId);
    if (job) {
      job.units.set(record.wuId, status);
      const unitStatuses = Array.from(job.units.values());
      if (status === 'rejected') {
        job.status = 'rejected';
        job.finalizedAt = record.finalizedAt;
        emitter.emit('job-rejected', { jobId: job.jobId, reason: 'quorum-rejected', unit: record.wuId });
      } else if (unitStatuses.length && unitStatuses.every((value) => value === 'accepted')) {
        job.status = 'accepted';
        job.finalizedAt = record.finalizedAt;
        emitter.emit('job-accepted', { jobId: job.jobId });
      }
      emitter.emit('job-updated', {
        jobId: job.jobId,
        status: job.status,
        units: Array.from(job.units.entries())
      });
    }
    emitter.emit('settled', {
      wuId: record.wuId,
      jobId: record.jobId,
      status,
      finalizedAt: record.finalizedAt
    });
  }

  function ingest(rawResult) {
    const parsed = validationResultSchema.parse(rawResult);
    const record = ensureRecord(parsed.wu_id);
    const existing = record.validators.get(parsed.validator_address);
    if (existing && existing.validator_sig === parsed.validator_sig) {
      return computeStats(record);
    }
    record.validators.set(parsed.validator_address, parsed);
    const stats = computeStats(record);
    const ratio = stats.total > 0 ? stats.valid / stats.total : 0;

    if (!record.finalized && stats.total >= minimumVotes) {
      if (ratio >= threshold) {
        finalizeRecord(record, 'accepted');
      } else {
        finalizeRecord(record, 'rejected');
      }
    }

    return stats;
  }

  function registerWorkUnit({ wuId, jobId }) {
    if (!wuId) {
      throw new Error('wuId is required to register a work unit');
    }
    const record = ensureRecord(wuId);
    if (jobId && !record.jobId) {
      record.jobId = jobId;
    }
    ensureJob(record.jobId ?? jobId ?? deriveJobIdFromWorkUnit(wuId));
    return record;
  }

  function getRecord(wuId) {
    return records.get(wuId) ?? null;
  }

  function getJob(jobId) {
    return jobs.get(jobId) ?? null;
  }

  return {
    ingest,
    registerWorkUnit,
    getRecord,
    getJob,
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter)
  };
}
