#!/usr/bin/env node
import chalk from 'chalk';
import pino from 'pino';
import { Wallet } from 'ethers';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '../src/config/env.js';
import { createJobLifecycle } from '../src/services/jobLifecycle.js';
import { resolveJobProfile, createInterfaceFromProfile } from '../src/services/jobProfiles.js';
import { MODEL_CLASSES, VRAM_TIERS, SLA_PROFILES } from '../src/constants/workUnits.js';
import { startSegment, stopSegment, resetMetering } from '../src/services/metering.js';
import { startValidatorRuntime } from '../src/validator/runtime.js';
import { createQuorumEngine } from '../src/settlement/quorumEngine.js';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info', name: 'local-cluster' });

function createMemoryJournal() {
  const entries = [];
  return {
    entries,
    append(entry) {
      const normalised = JSON.parse(
        JSON.stringify(entry, (_, value) => (typeof value === 'bigint' ? value.toString() : value))
      );
      entries.push(normalised);
      return normalised;
    }
  };
}

export function ensureLocalKeys(config, log = logger) {
  const hydrated = { ...config };

  if (!hydrated.NODE_PRIVATE_KEY) {
    const operatorWallet = Wallet.createRandom();
    hydrated.NODE_PRIVATE_KEY = operatorWallet.privateKey;
    hydrated.OPERATOR_ADDRESS = operatorWallet.address;
    log?.warn({ operator: operatorWallet.address }, 'NODE_PRIVATE_KEY missing; generated ephemeral key for local demo');
  }

  if (!process.env.NODE_PRIVATE_KEY && hydrated.NODE_PRIVATE_KEY) {
    process.env.NODE_PRIVATE_KEY = hydrated.NODE_PRIVATE_KEY;
  }

  if (!hydrated.VALIDATOR_PRIVATE_KEY && !hydrated.OPERATOR_PRIVATE_KEY) {
    const validatorWallet = Wallet.createRandom();
    hydrated.VALIDATOR_PRIVATE_KEY = validatorWallet.privateKey;
    log?.warn({ validator: validatorWallet.address }, 'VALIDATOR_PRIVATE_KEY missing; generated ephemeral validator key');
  }

  if (!process.env.VALIDATOR_PRIVATE_KEY && hydrated.VALIDATOR_PRIVATE_KEY) {
    process.env.VALIDATOR_PRIVATE_KEY = hydrated.VALIDATOR_PRIVATE_KEY;
  }

  return hydrated;
}

function createOfflineJob(jobId, operatorAddress) {
  const now = new Date();
  return {
    jobId,
    status: 'open',
    client: operatorAddress,
    worker: null,
    reward: 250n,
    deadline: BigInt(Math.floor(now.getTime() / 1000) + 3600),
    uri: 'ipfs://alpha-demo/job',
    tags: ['model:demo-foundry', 'runtime:container', 'version:v1'],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function buildLocalContractFactory({ lifecycleLogger, interfaceAbi }) {
  return function contractFactory(_address, _abi, signerOrProvider) {
    const contractLogger = lifecycleLogger.child({ subsystem: 'registry-sim' });
    const jobSuffix = (jobId) => (typeof jobId === 'string' && jobId.startsWith('0x') ? jobId.slice(2, 10) : 'job');

    const respond = (kind, jobId) => {
      const hash = `0x${kind}${jobSuffix(jobId)}`.padEnd(66, '0');
      contractLogger.info({ jobId, tx: hash }, `Simulated registry call: ${kind}`);
      return { hash };
    };

    const contract = {
      target: '0x000000000000000000000000000000000000dEaD',
      interface: interfaceAbi,
      signer: signerOrProvider,
      async applyForJob(jobId, subdomain, proof) {
        contractLogger.info({ jobId, subdomain, proof }, 'Executor applied for job');
        return respond('apply', jobId);
      },
      async submitWithValidator(jobId, commitment, resultHash, resultUri, metadata, validator) {
        contractLogger.info(
          { jobId, commitment, resultHash, resultUri, validator, metadata },
          'Executor submitted result (with validator)'
        );
        return respond('submit', jobId);
      },
      async submitProof(jobId, commitment, resultHash, resultUri, metadata) {
        contractLogger.info(
          { jobId, commitment, resultHash, resultUri, metadata },
          'Executor submitted proof'
        );
        return respond('submit', jobId);
      },
      async submit(jobId, resultHash, resultUri, subdomain, proof) {
        contractLogger.info({ jobId, resultHash, resultUri, subdomain, proof }, 'Executor submitted payload');
        return respond('submit', jobId);
      },
      async finalizeWithValidator(jobId, validator) {
        contractLogger.info({ jobId, validator }, 'Orchestrator finalised job with validator quorum');
        return respond('finalize', jobId);
      },
      async finalize(jobId) {
        contractLogger.info({ jobId }, 'Orchestrator finalised job');
        return respond('finalize', jobId);
      },
      connect() {
        return this;
      }
    };

    return contract;
  };
}

async function runCluster() {
  logger.info('Bootstrapping local α-network (orchestrator + executor + validator)…');

  const config = ensureLocalKeys(loadConfig());
  const orchestratorLabel = config.NODE_LABEL ?? 'demo-core';

  const journal = createMemoryJournal();

  const lifecycleLogger = logger.child({ component: 'executor' });
  const profile = resolveJobProfile(config.JOB_REGISTRY_PROFILE ?? 'v0');
  const interfaceAbi = createInterfaceFromProfile(profile);
  const contractFactory = buildLocalContractFactory({ lifecycleLogger, interfaceAbi });

  const wallet = new Wallet(config.NODE_PRIVATE_KEY);

  const offlineJobId = `0x${'ab'.repeat(32)}`;
  const lifecycle = createJobLifecycle({
    jobRegistryAddress: '0x000000000000000000000000000000000000dEaD',
    defaultSigner: wallet,
    defaultSubdomain: orchestratorLabel,
    defaultProof: config.JOB_APPLICATION_PROOF ?? '0x',
    offlineJobs: [createOfflineJob(offlineJobId, config.OPERATOR_ADDRESS ?? wallet.address)],
    profile: profile.id,
    journal,
    logger: lifecycleLogger,
    contractFactory
  });

  const jobs = await lifecycle.discover();
  if (!jobs.length) {
    throw new Error('Local cluster bootstrap failed: no offline jobs registered');
  }

  const jobId = jobs[0].jobId;
  logger.info({ jobId }, 'Discovered offline orchestration job');

  resetMetering();
  await lifecycle.apply(jobId, { subdomain: orchestratorLabel, proof: config.JOB_APPLICATION_PROOF ?? '0x' });
  logger.info({ jobId }, 'Job submission acknowledged – entering execution window');

  const segment = startSegment({
    jobId,
    deviceInfo: { deviceClass: 'DGX-H100', vramTier: VRAM_TIERS.TIER_80, gpuCount: 1 },
    modelClass: MODEL_CLASSES.LLM_70B,
    slaProfile: SLA_PROFILES.LOW_LATENCY_ENCLAVE,
    startedAt: new Date().toISOString()
  });

  const segmentResult = stopSegment(segment.segmentId, {
    endedAt: new Date(Date.now() + 120_000).toISOString()
  });
  logger.info({ jobId, alphaWu: segmentResult.alphaWU }, 'Executor produced α-WU segment');

  const submission = await lifecycle.submitExecutorResult(jobId, {
    result: { ok: true, summary: 'demo α-WU minted' },
    metadata: { segmentCount: 1 },
    resultUri: 'ipfs://alpha-demo/result'
  });

  logger.info(
    { jobId, wuId: submission.alphaWu.wu_id, attestor: submission.alphaWu.attestor_address },
    'α-WU artifact signed and submitted'
  );

  const validatorConfig = {
    ...config,
    NODE_ROLE: 'validator',
    VALIDATOR_SOURCE_TYPE: 'memory',
    VALIDATOR_SINK_TYPE: 'memory'
  };

  const validatorRuntime = await startValidatorRuntime({
    config: validatorConfig,
    logger: logger.child({ component: 'validator' })
  });

  const quorum = createQuorumEngine({
    quorumNumerator: 1,
    quorumDenominator: 1,
    minimumVotes: Number(config.VALIDATION_MINIMUM_VOTES ?? 1),
    logger: logger.child({ component: 'quorum' })
  });

  quorum.registerWorkUnit({ wuId: submission.alphaWu.wu_id, jobId });

  const settledPromise = new Promise((resolve) => {
    quorum.on('settled', resolve);
  });

  const unsubscribe = validatorRuntime.sink.subscribe(({ result }) => {
    logger.info(
      { jobId, wuId: result.wu_id, isValid: result.is_valid, failure: result.failure_reason },
      'Validator attestation observed'
    );
    const stats = quorum.ingest(result);
    logger.info({ jobId, stats }, 'Quorum progress updated');
  });

  validatorRuntime.source.push(submission.alphaWu);
  const settlement = await settledPromise;

  logger.info({ jobId: settlement.jobId, status: settlement.status }, 'Validation quorum reached');

  await lifecycle.finalize(jobId);
  logger.info({ jobId }, 'Job finalised and settled');

  unsubscribe();
  await validatorRuntime.stop();

  logger.info(chalk.green('Local α-network demo complete.'));
}

const entrypoint = fileURLToPath(import.meta.url);
if (process.argv[1] === entrypoint) {
  runCluster().catch((error) => {
    logger.error(error, 'Local cluster demo failed');
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  });
}
