import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { keccak256, toUtf8Bytes } from 'ethers';

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const serialized = value.map((entry) => JSON.parse(stableStringify(entry)));
    return JSON.stringify(serialized);
  }
  const entries = Object.keys(value)
    .sort()
    .map((key) => [key, JSON.parse(stableStringify(value[key]))]);
  const object = {};
  for (const [key, serialized] of entries) {
    object[key] = serialized;
  }
  return JSON.stringify(object);
}

export function computeJobMetadataHash(job) {
  if (!job) {
    return keccak256(toUtf8Bytes('null'));
  }
  const normalized = {
    jobId: job.jobId ?? null,
    client: job.client ?? null,
    worker: job.worker ?? null,
    status: job.status ?? null,
    reward: typeof job.reward === 'bigint' ? job.reward.toString() : job.reward ?? null,
    deadline:
      typeof job.deadline === 'bigint'
        ? job.deadline.toString()
        : job.deadline !== undefined && job.deadline !== null
          ? String(job.deadline)
          : null,
    uri: job.uri ?? null,
    tags: Array.isArray(job.tags) ? job.tags.map((entry) => String(entry)) : [],
    commitment: job.commitment ?? null,
    resultHash: job.resultHash ?? null,
    resultUri: job.resultUri ?? null,
    subdomain: job.subdomain ?? null,
    proof: job.proof ?? null,
    createdAt: job.createdAt ?? null,
    updatedAt: job.updatedAt ?? null
  };
  return keccak256(toUtf8Bytes(stableStringify(normalized)));
}

export function createLifecycleJournal({
  directory = path.join(process.cwd(), '.agi', 'lifecycle'),
  fileName = 'actions.jsonl',
  fsModule = fs
} = {}) {
  const resolvedDir = path.isAbsolute(directory) ? directory : path.resolve(directory);
  fsModule.mkdirSync(resolvedDir, { recursive: true });
  const filePath = path.join(resolvedDir, fileName);
  function append(entry) {
    const record = {
      id: randomUUID(),
      recordedAt: new Date().toISOString(),
      ...entry
    };
    const serialized = JSON.stringify(record);
    fsModule.appendFileSync(filePath, serialized + '\n', { encoding: 'utf8' });
    return record;
  }
  return {
    append,
    filePath
  };
}

export function buildSnapshotEntry(profileId, jobs = []) {
  const snapshot = Array.isArray(jobs)
    ? jobs.map((job) => ({
        jobId: job.jobId ?? null,
        metadata: job,
        metadataHash: computeJobMetadataHash(job)
      }))
    : [];
  return {
    kind: 'snapshot',
    profileId,
    jobs: snapshot
  };
}

export function buildActionEntry(profileId, action, job) {
  return {
    kind: 'action',
    profileId,
    action,
    job: job ?? null,
    metadataHash: computeJobMetadataHash(job)
  };
}
