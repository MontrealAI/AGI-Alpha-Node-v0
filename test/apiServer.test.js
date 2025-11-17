import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startAgentApi } from '../src/network/apiServer.js';
import { loadConfig } from '../src/config/env.js';
import { resetMetering, startSegment, stopSegment } from '../src/services/metering.js';
import { MODEL_CLASSES, SLA_PROFILES, VRAM_TIERS } from '../src/constants/workUnits.js';
import { initializeDatabase } from '../src/persistence/database.js';
import {
  ProviderRepository,
  EnergyReportRepository,
  QualityEvaluationRepository,
  TaskRunRepository,
  SyntheticLaborScoreRepository
} from '../src/persistence/repositories.js';
import { seedProviders, seedTaskTypes } from '../src/persistence/seeds.js';
import { TelemetryIngestionService } from '../src/services/telemetryIngestion.js';
import { createSyntheticLaborEngine } from '../src/services/syntheticLaborEngine.js';
import { createGlobalIndexEngine } from '../src/services/globalIndexEngine.js';

const noopLogger = { info: () => {}, warn: () => {}, error: () => {} };
const OWNER_TOKEN = 'test-owner-token';

function buildBaseUrl(server) {
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return `http://127.0.0.1:${port}`;
}

describe('agent API server', () => {
  let api;
  const jobsEmitter = new EventEmitter();
  let ledgerDir;

  beforeEach(() => {
    jobsEmitter.removeAllListeners();
    ledgerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-ledger-'));
    resetMetering();
    loadConfig({ NODE_LABEL: 'api-node' });
  });

  afterEach(async () => {
    if (api) {
      await api.stop();
      api = null;
    }
    if (ledgerDir) {
      fs.rmSync(ledgerDir, { recursive: true, force: true });
      ledgerDir = null;
    }
  });

  it('exposes lifecycle jobs and forwards apply/submit/finalize calls', async () => {
    const jobLifecycle = {
      listJobs: vi.fn(() => [
        {
          jobId: 'job-1',
          status: 'open',
          reward: 10n,
          uri: 'ipfs://job-1',
          tags: ['test']
        }
      ]),
      on: vi.fn((event, handler) => {
        jobsEmitter.on(event, handler);
        return () => jobsEmitter.off(event, handler);
      }),
      apply: vi.fn(async () => ({ jobId: 'job-1', method: 'applyForJob', transactionHash: '0xapply' })),
      submitExecutorResult: vi.fn(async () => ({
        jobId: 'job-1',
        method: 'submitProof',
        transactionHash: '0xsubmit',
        commitment: '0xcommit',
        resultHash: '0xhash',
        alphaWu: { wu_id: 'segment-1', attestor_sig: '0x' + 'aa'.repeat(65) }
      })),
      finalize: vi.fn(async () => ({ jobId: 'job-1', method: 'finalize', transactionHash: '0xfinal' })),
      getMetrics: vi.fn(() => ({ discovered: 1, lastJobProvider: 'agi-jobs' }))
    };

    api = startAgentApi({
      port: 0,
      jobLifecycle,
      logger: noopLogger,
      ownerToken: OWNER_TOKEN,
      ledgerRoot: ledgerDir
    });
    await new Promise((resolve) => setTimeout(resolve, 25));

    const baseUrl = buildBaseUrl(api.server);

    const listResponse = await fetch(`${baseUrl}/jobs`);
    expect(listResponse.status).toBe(200);
    const listPayload = await listResponse.json();
    expect(Array.isArray(listPayload.lifecycle)).toBe(true);
    expect(listPayload.lifecycle[0].jobId).toBe('job-1');

    jobsEmitter.emit('job:update', { jobId: 'job-2', status: 'open' });
    const refreshed = await fetch(`${baseUrl}/jobs`);
    const refreshedPayload = await refreshed.json();
    expect(refreshedPayload.lifecycle.some((job) => job.jobId === 'job-2')).toBe(true);

    const applyResponse = await fetch(`${baseUrl}/jobs/job-1/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subdomain: '1' })
    });
    expect(applyResponse.status).toBe(202);
    expect(jobLifecycle.apply).toHaveBeenCalledWith('job-1', expect.objectContaining({ subdomain: '1' }));

    const submitResponse = await fetch(`${baseUrl}/jobs/job-1/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result: '{"ok":true}' })
    });
    expect(submitResponse.status).toBe(202);
    expect(jobLifecycle.submitExecutorResult).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ result: expect.any(String) })
    );

    const finalizeResponse = await fetch(`${baseUrl}/jobs/job-1/finalize`, { method: 'POST' });
    expect(finalizeResponse.status).toBe(202);
    expect(jobLifecycle.finalize).toHaveBeenCalledWith('job-1');
  });

  it('returns informative error when lifecycle integration is missing', async () => {
    api = startAgentApi({ port: 0, logger: noopLogger, ownerToken: OWNER_TOKEN, ledgerRoot: ledgerDir });
    await new Promise((resolve) => setTimeout(resolve, 25));
    const baseUrl = buildBaseUrl(api.server);

    const response = await fetch(`${baseUrl}/jobs/abc/apply`, { method: 'POST' });
    expect(response.status).toBe(503);
    const payload = await response.json();
    expect(payload.error).toMatch(/not configured/i);
  });

  it('reports alpha work unit telemetry through status endpoints', async () => {
    api = startAgentApi({ port: 0, logger: noopLogger, ownerToken: OWNER_TOKEN, ledgerRoot: ledgerDir });
    await new Promise((resolve) => setTimeout(resolve, 25));
    const baseUrl = buildBaseUrl(api.server);

    const startedAt = new Date('2024-01-01T00:00:00.000Z');
    const endedAt = new Date(startedAt.getTime() + 10 * 60 * 1000);
    const { segmentId } = startSegment({
      jobId: 'job-telemetry',
      deviceInfo: { deviceClass: 'A100-80GB', gpuCount: 1 },
      modelClass: MODEL_CLASSES.LLM_8B,
      slaProfile: SLA_PROFILES.STANDARD,
      startedAt
    });
    stopSegment(segmentId, { endedAt });

    const statusResponse = await fetch(`${baseUrl}/status`);
    expect(statusResponse.status).toBe(200);
    const statusPayload = await statusResponse.json();
    expect(statusPayload.alphaWU).toBeDefined();
    expect(statusPayload.alphaWU.lifetimeAlphaWU).toBeGreaterThan(0);
    expect(statusPayload.alphaWU.lastEpoch).not.toBeNull();
    expect(statusPayload.alphaWU.lastEpoch.alphaWU).toBeGreaterThan(0);
    expect(statusPayload.alphaWU.lastEpoch.id).toMatch(/^epoch-/);

    const diagnosticsResponse = await fetch(`${baseUrl}/status/diagnostics`);
    expect(diagnosticsResponse.status).toBe(200);
    const diagnosticsPayload = await diagnosticsResponse.json();
    expect(Array.isArray(diagnosticsPayload.alphaWU.epochs)).toBe(true);
    expect(diagnosticsPayload.alphaWU.epochs.length).toBeGreaterThan(0);
    const epoch = diagnosticsPayload.alphaWU.epochs[0];
    expect(epoch.byJob['job-telemetry']).toBeGreaterThan(0);
    expect(epoch.byDeviceClass['A100-80GB']).toBeGreaterThan(0);
    expect(epoch.bySlaProfile[SLA_PROFILES.STANDARD]).toBeGreaterThan(0);
    expect(diagnosticsPayload.alphaWU.totals.byJob['job-telemetry']).toBeCloseTo(
      epoch.byJob['job-telemetry'],
      5
    );
    expect(diagnosticsPayload.alphaWU.totals.byDeviceClass['A100-80GB']).toBeCloseTo(
      epoch.byDeviceClass['A100-80GB'],
      5
    );
    expect(diagnosticsPayload.alphaWU.totals.bySlaProfile[SLA_PROFILES.STANDARD]).toBeCloseTo(
      epoch.bySlaProfile[SLA_PROFILES.STANDARD],
      5
    );
  });

  it('exposes consistent health responses on /health and /healthz', async () => {
    api = startAgentApi({ port: 0, logger: noopLogger, ownerToken: OWNER_TOKEN, ledgerRoot: ledgerDir });
    await new Promise((resolve) => setTimeout(resolve, 25));
    const baseUrl = buildBaseUrl(api.server);

    const [health, healthz] = await Promise.all([
      fetch(`${baseUrl}/health`).then(async (res) => ({ status: res.status, body: await res.json() })),
      fetch(`${baseUrl}/healthz`).then(async (res) => ({ status: res.status, body: await res.json() }))
    ]);

    expect(health.status).toBe(200);
    expect(healthz.status).toBe(200);
    expect(health.body.status).toBe('ok');
    expect(health.body.offlineMode).toBe(false);
    expect(health.body.healthGate).toBe(null);
    expect(health.body).toMatchObject({
      submitted: 0,
      completed: 0,
      failed: 0,
      lastJobProvider: 'local'
    });
    expect(health.body.status).toBe(healthz.body.status);
    expect(typeof health.body.uptimeSeconds).toBe('number');
  });

  it('ingests provider telemetry with schema validation and idempotency', async () => {
    const db = initializeDatabase({ filename: ':memory:' });
    seedTaskTypes(db);
    seedProviders(db);
    const telemetryService = new TelemetryIngestionService({ db, logger: noopLogger });
    const providers = new ProviderRepository(db);
    const provider = providers.list()[0];
    const apiKey = 'api-key-test-1';
    telemetryService.registerApiKey({ providerId: provider.id, apiKey, label: 'rest-ingest' });

    api = startAgentApi({
      port: 0,
      logger: noopLogger,
      ownerToken: OWNER_TOKEN,
      ledgerRoot: ledgerDir,
      telemetry: telemetryService
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    const baseUrl = buildBaseUrl(api.server);

    const taskPayload = {
      schema_version: 'v0',
      idempotency_key: 'task-telemetry-1',
      task_type: 'research-dossier',
      status: 'completed',
      external_id: 'ext-telemetry-1',
      timing: { started_at: '2024-01-01T00:00:00Z', completed_at: '2024-01-01T00:05:00Z' },
      metrics: { tokens_processed: 2048, quality_score: 0.93 },
      metadata: { device: 'gpu-a100' }
    };

    const taskResponse = await fetch(`${baseUrl}/ingest/task-runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(taskPayload)
    });
    expect(taskResponse.status).toBe(202);
    const taskBody = await taskResponse.json();
    expect(taskBody.task_run.schema_version).toBe('v0');
    expect(taskBody.task_run.idempotency_key).toBe(taskPayload.idempotency_key);

    const duplicate = await fetch(`${baseUrl}/ingest/task-runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(taskPayload)
    });
    expect(duplicate.status).toBe(409);

    const energyPayload = {
      schema_version: 'v0',
      task: { idempotency_key: taskPayload.idempotency_key },
      energy: { kwh: 1.25, region: 'na-east' }
    };
    const energyResponse = await fetch(`${baseUrl}/ingest/energy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(energyPayload)
    });
    expect(energyResponse.status).toBe(202);

    const qualityPayload = {
      schema_version: 'v0',
      task: { idempotency_key: taskPayload.idempotency_key },
      quality: { score: 0.91, evaluator: 'qa-suite' }
    };
    const qualityResponse = await fetch(`${baseUrl}/ingest/quality`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(qualityPayload)
    });
    expect(qualityResponse.status).toBe(202);

    const energyRepo = new EnergyReportRepository(db);
    const qualityRepo = new QualityEvaluationRepository(db);
    const runs = new TaskRunRepository(db);
    const ingestedRun = runs.findByIdempotencyKey(provider.id, taskPayload.idempotency_key);
    expect(ingestedRun).toBeDefined();
    expect(energyRepo.listForTaskRun(ingestedRun.id)).toHaveLength(1);
    expect(qualityRepo.listForTaskRun(ingestedRun.id)).toHaveLength(1);
  });

  it('exposes paginated read-only index + provider metrics with auth and CORS', async () => {
    const db = initializeDatabase({ filename: ':memory:', withSeed: true });
    const telemetryService = new TelemetryIngestionService({ db, logger: noopLogger });
    const providers = new ProviderRepository(db).list();
    const scores = new SyntheticLaborScoreRepository(db);

    scores.create({
      provider_id: providers[0].id,
      measurement_date: '2024-01-01',
      raw_throughput: 10,
      slu: 10,
      rationale: 'baseline-p1'
    });
    scores.create({
      provider_id: providers[0].id,
      measurement_date: '2024-01-02',
      raw_throughput: 20,
      slu: 20,
      rationale: 'growth-p1'
    });
    scores.create({
      provider_id: providers[1].id,
      measurement_date: '2024-01-02',
      raw_throughput: 8,
      slu: 8,
      rationale: 'baseline-p2'
    });
    scores.create({
      provider_id: providers[1].id,
      measurement_date: '2024-01-03',
      raw_throughput: 12,
      slu: 12,
      rationale: 'growth-p2'
    });

    const indexEngine = createGlobalIndexEngine({ db, logger: noopLogger });
    const weightSet = indexEngine.rebalance({ asOfDate: '2024-01-02', capPercent: 60, minimumSlu30d: 0 });
    indexEngine.computeIndexValue('2024-01-02', weightSet.id);
    const nextWeightSet = indexEngine.rebalance({ asOfDate: '2024-01-03', capPercent: 60, minimumSlu30d: 0 });
    indexEngine.computeIndexValue('2024-01-03', nextWeightSet.id);

    const PUBLIC_KEY = 'public-key-123';
    const DASHBOARD_ORIGIN = 'https://dash.example.com';
    api = startAgentApi({
      port: 0,
      logger: noopLogger,
      ownerToken: OWNER_TOKEN,
      ledgerRoot: ledgerDir,
      telemetry: telemetryService,
      publicApiKey: PUBLIC_KEY,
      corsOrigin: DASHBOARD_ORIGIN
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    const baseUrl = buildBaseUrl(api.server);

    const unauthLatest = await fetch(`${baseUrl}/index/latest`);
    expect(unauthLatest.status).toBe(401);

    const latestResponse = await fetch(`${baseUrl}/index/latest`, {
      headers: { 'x-api-key': PUBLIC_KEY, Origin: DASHBOARD_ORIGIN }
    });
    expect(latestResponse.status).toBe(200);
    expect(latestResponse.headers.get('access-control-allow-origin')).toBe(DASHBOARD_ORIGIN);
    const latestPayload = await latestResponse.json();
    expect(latestPayload.index.weight_set_id).toBe(nextWeightSet.id);
    expect(Array.isArray(latestPayload.constituents)).toBe(true);
    expect(latestPayload.constituents.length).toBeGreaterThan(0);
    expect(latestPayload.constituents[0].provider.name).toBeDefined();

    const historyResponse = await fetch(
      `${baseUrl}/index/history?from=2024-01-01&to=2024-01-03&limit=1&offset=0`,
      {
        headers: { 'x-api-key': PUBLIC_KEY }
      }
    );
    expect(historyResponse.status).toBe(200);
    const historyPayload = await historyResponse.json();
    expect(historyPayload.pagination.total).toBeGreaterThan(1);
    expect(historyPayload.pagination.nextOffset).toBe(1);
    expect(historyPayload.items[0].effective_date).toBe('2024-01-03');

    const providersResponse = await fetch(`${baseUrl}/providers?limit=1`, {
      headers: { 'x-api-key': PUBLIC_KEY }
    });
    expect(providersResponse.status).toBe(200);
    const providersPayload = await providersResponse.json();
    expect(providersPayload.pagination.total).toBeGreaterThan(1);
    expect(providersPayload.providers[0].latest_score.slu).toBeGreaterThan(0);

    const scoresResponse = await fetch(
      `${baseUrl}/providers/${providers[0].id}/scores?from=2024-01-01&to=2024-01-03&limit=2`,
      { headers: { 'x-api-key': PUBLIC_KEY } }
    );
    expect(scoresResponse.status).toBe(200);
    const scoresPayload = await scoresResponse.json();
    expect(scoresPayload.provider.id).toBe(providers[0].id);
    expect(scoresPayload.scores.length).toBeGreaterThan(0);
    expect(scoresPayload.pagination.nextOffset).toBeNull();
  });

  it('exposes governance directives and crafts owner payloads', async () => {
    api = startAgentApi({ port: 0, logger: noopLogger, ownerToken: OWNER_TOKEN, ledgerRoot: ledgerDir });
    await new Promise((resolve) => setTimeout(resolve, 25));
    const baseUrl = buildBaseUrl(api.server);

    api.setOwnerDirectives({
      priority: 'critical',
      actions: [{ type: 'pause', level: 'critical' }],
      notices: ['Stake deficit detected'],
      context: { meetsMinimum: false }
    });

    const ownerHeaders = {
      Authorization: `Bearer ${OWNER_TOKEN}`
    };
    const ownerJsonHeaders = {
      ...ownerHeaders,
      'Content-Type': 'application/json'
    };

    const directivesResponse = await fetch(`${baseUrl}/governance/directives`, {
      headers: ownerHeaders
    });
    expect(directivesResponse.status).toBe(200);
    const directivesPayload = await directivesResponse.json();
    expect(directivesPayload.directives.priority).toBe('critical');
    expect(Array.isArray(directivesPayload.directives.actions)).toBe(true);
    expect(directivesPayload.directives.actions[0].type).toBe('pause');
    expect(directivesPayload.directives.context.meetsMinimum).toBe(false);

    const pauseResponse = await fetch(`${baseUrl}/governance/pause`, {
      method: 'POST',
      headers: ownerJsonHeaders,
      body: JSON.stringify({ systemPauseAddress: '0x0000000000000000000000000000000000000001', action: 'pause' })
    });
    expect(pauseResponse.status).toBe(200);
    const pausePayload = await pauseResponse.json();
    expect(pausePayload.tx.to).toBe('0x0000000000000000000000000000000000000001');
    expect(typeof pausePayload.tx.data).toBe('string');
    expect(pausePayload.meta.contract).toBe('SystemPause');

    const minStakeResponse = await fetch(`${baseUrl}/governance/minimum-stake`, {
      method: 'POST',
      headers: ownerJsonHeaders,
      body: JSON.stringify({
        stakeManagerAddress: '0x0000000000000000000000000000000000000002',
        amount: '1000.5'
      })
    });
    expect(minStakeResponse.status).toBe(200);
    const minStakePayload = await minStakeResponse.json();
    expect(minStakePayload.tx.to).toBe('0x0000000000000000000000000000000000000002');
    expect(minStakePayload.details.amount).toBeDefined();

    const roleShareResponse = await fetch(`${baseUrl}/governance/role-share`, {
      method: 'POST',
      headers: ownerJsonHeaders,
      body: JSON.stringify({
        rewardEngineAddress: '0x0000000000000000000000000000000000000003',
        role: 'node',
        shareBps: 4200
      })
    });
    expect(roleShareResponse.status).toBe(200);
    const roleSharePayload = await roleShareResponse.json();
    expect(roleSharePayload.details.role).toBeDefined();
    expect(roleSharePayload.details.shareBps).toBe(4200);

    const globalSharesResponse = await fetch(`${baseUrl}/governance/global-shares`, {
      method: 'POST',
      headers: ownerJsonHeaders,
      body: JSON.stringify({
        rewardEngineAddress: '0x0000000000000000000000000000000000000004',
        operatorShareBps: 6000,
        validatorShareBps: 3000,
        treasuryShareBps: 1000
      })
    });
    expect(globalSharesResponse.status).toBe(200);
    const globalSharesPayload = await globalSharesResponse.json();
    expect(globalSharesPayload.details.shares.operatorShare).toBe(6000);

    const validatorThresholdResponse = await fetch(`${baseUrl}/governance/validator-threshold`, {
      method: 'POST',
      headers: ownerJsonHeaders,
      body: JSON.stringify({
        stakeManagerAddress: '0x0000000000000000000000000000000000000002',
        threshold: '7'
      })
    });
    expect(validatorThresholdResponse.status).toBe(200);
    const validatorThresholdPayload = await validatorThresholdResponse.json();
    expect(validatorThresholdPayload.meta.method).toBe('setValidatorThreshold');

    const registryUpgradeResponse = await fetch(`${baseUrl}/governance/registry-upgrade`, {
      method: 'POST',
      headers: ownerJsonHeaders,
      body: JSON.stringify({
        stakeManagerAddress: '0x0000000000000000000000000000000000000002',
        registryType: 'job',
        newAddress: '0x0000000000000000000000000000000000000006'
      })
    });
    expect(registryUpgradeResponse.status).toBe(200);
    const registryUpgradePayload = await registryUpgradeResponse.json();
    expect(registryUpgradePayload.meta.method).toBe('setJobRegistry');

    const jobModuleResponse = await fetch(`${baseUrl}/governance/job-module`, {
      method: 'POST',
      headers: ownerJsonHeaders,
      body: JSON.stringify({
        jobRegistryAddress: '0x0000000000000000000000000000000000000007',
        module: 'validation',
        newAddress: '0x0000000000000000000000000000000000000008'
      })
    });
    expect(jobModuleResponse.status).toBe(200);
    const jobModulePayload = await jobModuleResponse.json();
    expect(jobModulePayload.meta.contract).toBe('JobRegistry');

    const disputeResponse = await fetch(`${baseUrl}/governance/dispute`, {
      method: 'POST',
      headers: ownerJsonHeaders,
      body: JSON.stringify({
        jobRegistryAddress: '0x0000000000000000000000000000000000000007',
        jobId: '42',
        reason: 'test'
      })
    });
    expect(disputeResponse.status).toBe(200);
    const disputePayload = await disputeResponse.json();
    expect(disputePayload.meta.method).toBe('triggerDispute');

    const identityDelegateResponse = await fetch(`${baseUrl}/governance/identity-delegate`, {
      method: 'POST',
      headers: ownerJsonHeaders,
      body: JSON.stringify({
        identityRegistryAddress: '0x0000000000000000000000000000000000000009',
        operatorAddress: '0x0000000000000000000000000000000000000011',
        allowed: true
      })
    });
    expect(identityDelegateResponse.status).toBe(200);
    const identityDelegatePayload = await identityDelegateResponse.json();
    expect(identityDelegatePayload.meta.proposed.allowed).toBe(true);

    const emissionPerEpochResponse = await fetch(`${baseUrl}/governance/emission-per-epoch`, {
      method: 'POST',
      headers: ownerJsonHeaders,
      body: JSON.stringify({
        emissionManagerAddress: '0x0000000000000000000000000000000000000012',
        emissionPerEpoch: '123.45'
      })
    });
    expect(emissionPerEpochResponse.status).toBe(200);
    const emissionPerEpochPayload = await emissionPerEpochResponse.json();
    expect(emissionPerEpochPayload.meta.contract).toBe('EmissionManager');

    const emissionEpochLengthResponse = await fetch(
      `${baseUrl}/governance/emission-epoch-length`,
      {
        method: 'POST',
        headers: ownerJsonHeaders,
        body: JSON.stringify({
          emissionManagerAddress: '0x0000000000000000000000000000000000000012',
          epochLengthSeconds: '7200'
        })
      }
    );
    expect(emissionEpochLengthResponse.status).toBe(200);

    const emissionCapResponse = await fetch(`${baseUrl}/governance/emission-cap`, {
      method: 'POST',
      headers: ownerJsonHeaders,
      body: JSON.stringify({
        emissionManagerAddress: '0x0000000000000000000000000000000000000012',
        emissionCap: '1000000'
      })
    });
    expect(emissionCapResponse.status).toBe(200);

    const emissionMultiplierResponse = await fetch(`${baseUrl}/governance/emission-multiplier`, {
      method: 'POST',
      headers: ownerJsonHeaders,
      body: JSON.stringify({
        emissionManagerAddress: '0x0000000000000000000000000000000000000012',
        numerator: '2',
        denominator: '1'
      })
    });
    expect(emissionMultiplierResponse.status).toBe(200);

    const nodeRegisterResponse = await fetch(`${baseUrl}/governance/node/register`, {
      method: 'POST',
      headers: ownerJsonHeaders,
      body: JSON.stringify({
        nodeRegistryAddress: '0x0000000000000000000000000000000000000013',
        nodeId: 'alpha-node-1',
        operatorAddress: '0x0000000000000000000000000000000000000014',
        metadataUri: 'ipfs://node'
      })
    });
    expect(nodeRegisterResponse.status).toBe(200);
    const nodeRegisterPayload = await nodeRegisterResponse.json();
    expect(nodeRegisterPayload.meta.contract).toBe('NodeRegistry');

    const nodeMetadataResponse = await fetch(`${baseUrl}/governance/node/metadata`, {
      method: 'POST',
      headers: ownerJsonHeaders,
      body: JSON.stringify({
        nodeRegistryAddress: '0x0000000000000000000000000000000000000013',
        nodeId: 'alpha-node-1',
        metadataUri: 'ipfs://node-updated'
      })
    });
    expect(nodeMetadataResponse.status).toBe(200);

    const nodeStatusResponse = await fetch(`${baseUrl}/governance/node/status`, {
      method: 'POST',
      headers: ownerJsonHeaders,
      body: JSON.stringify({
        nodeRegistryAddress: '0x0000000000000000000000000000000000000013',
        nodeId: 'alpha-node-1',
        active: false
      })
    });
    expect(nodeStatusResponse.status).toBe(200);

    const nodeOperatorResponse = await fetch(`${baseUrl}/governance/node/operator`, {
      method: 'POST',
      headers: ownerJsonHeaders,
      body: JSON.stringify({
        nodeRegistryAddress: '0x0000000000000000000000000000000000000013',
        operatorAddress: '0x0000000000000000000000000000000000000014',
        allowed: false
      })
    });
    expect(nodeOperatorResponse.status).toBe(200);

    const nodeWorkMeterResponse = await fetch(`${baseUrl}/governance/node/work-meter`, {
      method: 'POST',
      headers: ownerJsonHeaders,
      body: JSON.stringify({
        nodeRegistryAddress: '0x0000000000000000000000000000000000000013',
        workMeterAddress: '0x0000000000000000000000000000000000000015'
      })
    });
    expect(nodeWorkMeterResponse.status).toBe(200);

    const workMeterValidatorResponse = await fetch(
      `${baseUrl}/governance/work-meter/validator`,
      {
        method: 'POST',
        headers: ownerJsonHeaders,
        body: JSON.stringify({
          workMeterAddress: '0x0000000000000000000000000000000000000015',
          validatorAddress: '0x0000000000000000000000000000000000000016',
          allowed: true
        })
      }
    );
    expect(workMeterValidatorResponse.status).toBe(200);

    const workMeterOracleResponse = await fetch(`${baseUrl}/governance/work-meter/oracle`, {
      method: 'POST',
      headers: ownerJsonHeaders,
      body: JSON.stringify({
        workMeterAddress: '0x0000000000000000000000000000000000000015',
        oracleAddress: '0x0000000000000000000000000000000000000019',
        allowed: true
      })
    });
    expect(workMeterOracleResponse.status).toBe(200);

    const workMeterWindowResponse = await fetch(`${baseUrl}/governance/work-meter/window`, {
      method: 'POST',
      headers: ownerJsonHeaders,
      body: JSON.stringify({
        workMeterAddress: '0x0000000000000000000000000000000000000015',
        submissionWindowSeconds: '3600'
      })
    });
    expect(workMeterWindowResponse.status).toBe(200);

    const workMeterProductivityResponse = await fetch(
      `${baseUrl}/governance/work-meter/productivity-index`,
      {
        method: 'POST',
        headers: ownerJsonHeaders,
        body: JSON.stringify({
          workMeterAddress: '0x0000000000000000000000000000000000000015',
          productivityIndexAddress: '0x0000000000000000000000000000000000000017'
        })
      }
    );
    expect(workMeterProductivityResponse.status).toBe(200);

    const workMeterUsageResponse = await fetch(
      `${baseUrl}/governance/work-meter/submit-usage`,
      {
        method: 'POST',
        headers: ownerJsonHeaders,
        body: JSON.stringify({
          workMeterAddress: '0x0000000000000000000000000000000000000015',
          reportId: 'usage-report-1',
          nodeId: 'alpha-node-1',
          gpuSeconds: '12.5',
          gflopsNorm: '1.0',
          modelTier: '1.3',
          sloPass: '0.95',
          quality: '0.9'
        })
      }
    );
    expect(workMeterUsageResponse.status).toBe(200);
    const workMeterUsagePayload = await workMeterUsageResponse.json();
    expect(workMeterUsagePayload.meta.contract).toBe('WorkMeter');

    const productivityRecordResponse = await fetch(
      `${baseUrl}/governance/productivity/record-epoch`,
      {
        method: 'POST',
        headers: ownerJsonHeaders,
        body: JSON.stringify({
          productivityIndexAddress: '0x0000000000000000000000000000000000000017',
          epoch: '1',
          alphaWu: '42.42',
          tokensEmitted: '10',
          tokensBurned: '2'
        })
      }
    );
    expect(productivityRecordResponse.status).toBe(200);
    const productivityRecordPayload = await productivityRecordResponse.json();
    expect(productivityRecordPayload.meta.contract).toBe('ProductivityIndex');

    const productivityEmissionResponse = await fetch(
      `${baseUrl}/governance/productivity/emission-manager`,
      {
        method: 'POST',
        headers: ownerJsonHeaders,
        body: JSON.stringify({
          productivityIndexAddress: '0x0000000000000000000000000000000000000017',
          emissionManagerAddress: '0x0000000000000000000000000000000000000012'
        })
      }
    );
    expect(productivityEmissionResponse.status).toBe(200);

    const productivityWorkMeterResponse = await fetch(
      `${baseUrl}/governance/productivity/work-meter`,
      {
        method: 'POST',
        headers: ownerJsonHeaders,
        body: JSON.stringify({
          productivityIndexAddress: '0x0000000000000000000000000000000000000017',
          workMeterAddress: '0x0000000000000000000000000000000000000015'
        })
      }
    );
    expect(productivityWorkMeterResponse.status).toBe(200);

    const productivityTreasuryResponse = await fetch(
      `${baseUrl}/governance/productivity/treasury`,
      {
        method: 'POST',
        headers: ownerJsonHeaders,
        body: JSON.stringify({
          productivityIndexAddress: '0x0000000000000000000000000000000000000017',
          treasuryAddress: '0x0000000000000000000000000000000000000020'
        })
      }
    );
    expect(productivityTreasuryResponse.status).toBe(200);

    const incentivesMinimumResponse = await fetch(
      `${baseUrl}/governance/incentives/minimum-stake`,
      {
        method: 'POST',
        headers: ownerJsonHeaders,
        body: JSON.stringify({
          incentivesAddress: '0x0000000000000000000000000000000000000018',
          amount: '750.25'
        })
      }
    );
    expect(incentivesMinimumResponse.status).toBe(200);
    const incentivesMinimumPayload = await incentivesMinimumResponse.json();
    expect(incentivesMinimumPayload.meta.contract).toBe('PlatformIncentives');

    const incentivesStakeManagerResponse = await fetch(
      `${baseUrl}/governance/incentives/stake-manager`,
      {
        method: 'POST',
        headers: ownerJsonHeaders,
        body: JSON.stringify({
          incentivesAddress: '0x0000000000000000000000000000000000000018',
          stakeManagerAddress: '0x0000000000000000000000000000000000000002'
        })
      }
    );
    expect(incentivesStakeManagerResponse.status).toBe(200);

    const incentivesHeartbeatResponse = await fetch(
      `${baseUrl}/governance/incentives/heartbeat-grace`,
      {
        method: 'POST',
        headers: ownerJsonHeaders,
        body: JSON.stringify({
          incentivesAddress: '0x0000000000000000000000000000000000000018',
          graceSeconds: '600'
        })
      }
    );
    expect(incentivesHeartbeatResponse.status).toBe(200);

    const incentivesActivationResponse = await fetch(
      `${baseUrl}/governance/incentives/activation-fee`,
      {
        method: 'POST',
        headers: ownerJsonHeaders,
        body: JSON.stringify({
          incentivesAddress: '0x0000000000000000000000000000000000000018',
          feeAmount: '25'
        })
      }
    );
    expect(incentivesActivationResponse.status).toBe(200);

    const incentivesTreasuryResponse = await fetch(
      `${baseUrl}/governance/incentives/treasury`,
      {
        method: 'POST',
        headers: ownerJsonHeaders,
        body: JSON.stringify({
          incentivesAddress: '0x0000000000000000000000000000000000000018',
          treasuryAddress: '0x0000000000000000000000000000000000000021'
        })
      }
    );
    expect(incentivesTreasuryResponse.status).toBe(200);

    const persistResponse = await fetch(`${baseUrl}/governance/minimum-stake`, {
      method: 'POST',
      headers: ownerJsonHeaders,
      body: JSON.stringify({
        stakeManagerAddress: '0x0000000000000000000000000000000000000002',
        amount: '500',
        dryRun: false,
        confirm: true,
        tags: ['test']
      })
    });
    expect(persistResponse.status).toBe(200);
    const persistPayload = await persistResponse.json();
    expect(persistPayload.ledgerEntry).toBeDefined();

    const stakeTopUpResponse = await fetch(`${baseUrl}/governance/stake-top-up`, {
      method: 'POST',
      headers: ownerJsonHeaders,
      body: JSON.stringify({
        incentivesAddress: '0x0000000000000000000000000000000000000005',
        amount: '250.75'
      })
    });
    expect(stakeTopUpResponse.status).toBe(200);
    const stakeTopUpPayload = await stakeTopUpResponse.json();
    expect(stakeTopUpPayload.tx.to).toBe('0x0000000000000000000000000000000000000005');

    const updateDirectivesResponse = await fetch(`${baseUrl}/governance/directives`, {
      method: 'POST',
      headers: ownerJsonHeaders,
      body: JSON.stringify({
        priority: 'warning',
        actions: [
          {
            type: 'resume',
            level: 'warning',
            reason: 'Stake posture nominal',
            tx: { to: '0x0000000000000000000000000000000000000010', method: 'resumeAll' }
          }
        ],
        notices: ['Operations can resume'],
        context: { meetsMinimum: true, deficit: '0' }
      })
    });
    expect(updateDirectivesResponse.status).toBe(200);
    const updateDirectivesPayload = await updateDirectivesResponse.json();
    expect(updateDirectivesPayload.directives.priority).toBe('warning');
    expect(updateDirectivesPayload.directives.actions[0].type).toBe('resume');
    expect(updateDirectivesPayload.directives.actions[0].level).toBe('warning');
    expect(updateDirectivesPayload.directives.context.meetsMinimum).toBe(true);

    const confirmDirectives = await fetch(`${baseUrl}/governance/directives`, {
      headers: ownerHeaders
    });
    const confirmPayload = await confirmDirectives.json();
    expect(confirmPayload.directives.priority).toBe('warning');
    expect(confirmPayload.directives.context.meetsMinimum).toBe(true);

    const metrics = api.getMetrics();
    expect(metrics.governance.directivesUpdates).toBeGreaterThanOrEqual(2);
    expect(metrics.governance.payloads).toBeGreaterThanOrEqual(30);
    expect(metrics.governance.ledgerEntries).toBeGreaterThanOrEqual(1);

    const invalidResponse = await fetch(`${baseUrl}/governance/minimum-stake`, {
      method: 'POST',
      headers: ownerJsonHeaders,
      body: JSON.stringify({ stakeManagerAddress: '0x0' })
    });
    expect(invalidResponse.status).toBe(400);

    const invalidDirectives = await fetch(`${baseUrl}/governance/directives`, {
      method: 'POST',
      headers: ownerJsonHeaders,
      body: JSON.stringify({ actions: { type: 'pause' } })
    });
    expect(invalidDirectives.status).toBe(400);
  });

  it('exports oracle epochs with governance token protection', async () => {
    const start = new Date('2024-01-01T00:00:00Z');
    const segment = startSegment({
      jobId: 'oracle-job',
      deviceInfo: { providerLabel: 'api-node', deviceClass: 'A100-80GB', vramTier: VRAM_TIERS.TIER_80, gpuCount: 1 },
      modelClass: MODEL_CLASSES.LLM_8B,
      slaProfile: SLA_PROFILES.STANDARD,
      startedAt: start
    });
    stopSegment(segment.segmentId, { endedAt: new Date('2024-01-01T00:10:00Z') });

    api = startAgentApi({ port: 0, logger: noopLogger, ownerToken: OWNER_TOKEN, ledgerRoot: ledgerDir });
    await new Promise((resolve) => setTimeout(resolve, 25));
    const baseUrl = buildBaseUrl(api.server);

    const unauthorized = await fetch(`${baseUrl}/oracle/epochs?from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(new Date('2024-01-01T00:15:00Z').toISOString())}`);
    expect(unauthorized.status).toBe(401);

    const authorized = await fetch(
      `${baseUrl}/oracle/epochs?from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(new Date('2024-01-01T00:15:00Z').toISOString())}&epochId=epoch-api-test`,
      {
        headers: { Authorization: `Bearer ${OWNER_TOKEN}` }
      }
    );
    expect(authorized.status).toBe(200);
    const payload = await authorized.json();
    expect(payload.epochId).toBe('epoch-api-test');
    expect(payload.nodeLabel).toBe('api-node');
    expect(payload.totals.alphaWU).toBeGreaterThan(0);
    expect(payload.breakdown.byJob['oracle-job'].gpuMinutes).toBeGreaterThan(0);
  });

  it('serves GSLI index and provider metrics with optional public API key and CORS', async () => {
    const db = initializeDatabase({ withSeed: true });
    const laborEngine = createSyntheticLaborEngine({ db, logger: noopLogger });
    const indexEngine = createGlobalIndexEngine({ db, logger: noopLogger });

    const taskType = laborEngine.taskTypes.list()[0] ??
      laborEngine.taskTypes.create({ name: 'api-test', description: 'api test', difficulty_coefficient: 1 });
    const provider = laborEngine.providers.list()[0];

    laborEngine.taskRuns.create({
      provider_id: provider.id,
      task_type_id: taskType.id,
      raw_throughput: 12,
      status: 'completed',
      started_at: '2024-01-01T00:00:00Z',
      completed_at: '2024-01-01T00:10:00Z'
    });
    laborEngine.taskRuns.create({
      provider_id: provider.id,
      task_type_id: taskType.id,
      raw_throughput: 14,
      status: 'completed',
      started_at: '2024-01-02T00:00:00Z',
      completed_at: '2024-01-02T00:10:00Z'
    });

    laborEngine.computeDailyScoreForProvider(provider.id, '2024-01-01');
    laborEngine.computeDailyScoreForProvider(provider.id, '2024-01-02');
    indexEngine.rebalance({
      asOfDate: '2024-01-01',
      capPercent: 50,
      lookbackDays: 1,
      minimumSlu30d: 0,
      baseDivisor: 1,
      divisorVersion: 'test'
    });
    indexEngine.computeIndexValue('2024-01-01');
    indexEngine.computeIndexValue('2024-01-02');

    const telemetry = new TelemetryIngestionService({ db, logger: noopLogger });
    api = startAgentApi({
      port: 0,
      logger: noopLogger,
      ownerToken: OWNER_TOKEN,
      ledgerRoot: ledgerDir,
      telemetry,
      publicApiKey: 'public-read',
      corsOrigin: 'http://dashboard.local'
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    const baseUrl = buildBaseUrl(api.server);

    const unauthorizedLatest = await fetch(`${baseUrl}/index/latest`);
    expect(unauthorizedLatest.status).toBe(401);

    const latest = await fetch(`${baseUrl}/index/latest`, { headers: { 'x-api-key': 'public-read' } });
    expect(latest.status).toBe(200);
    expect(latest.headers.get('access-control-allow-origin')).toBe('http://dashboard.local');
    const latestPayload = await latest.json();
    expect(latestPayload.index.effective_date).toBe('2024-01-02');
    expect(latestPayload.constituents.length).toBeGreaterThan(0);

    const history = await fetch(`${baseUrl}/index/history?from=2024-01-01&to=2024-01-02&limit=1`, {
      headers: { 'x-api-key': 'public-read' }
    });
    expect(history.status).toBe(200);
    const historyPayload = await history.json();
    expect(historyPayload.pagination.total).toBeGreaterThanOrEqual(2);
    expect(historyPayload.items.length).toBe(1);
    expect(historyPayload.pagination.nextOffset).toBe(1);

    const providersResponse = await fetch(`${baseUrl}/providers?limit=1`, {
      headers: { 'x-api-key': 'public-read' }
    });
    expect(providersResponse.status).toBe(200);
    const providersPayload = await providersResponse.json();
    expect(providersPayload.providers[0].latest_score).not.toBeNull();
    expect(providersPayload.pagination.total).toBeGreaterThan(0);

    const scoresResponse = await fetch(`${baseUrl}/providers/${provider.id}/scores?from=2024-01-01&to=2024-01-02&limit=1`, {
      headers: { 'x-api-key': 'public-read' }
    });
    expect(scoresResponse.status).toBe(200);
    const scoresPayload = await scoresResponse.json();
    expect(scoresPayload.pagination.total).toBeGreaterThanOrEqual(2);
    expect(scoresPayload.scores[0].provider_id).toBe(provider.id);
  });

  it('exposes telemetry task runs for dashboard debugging with optional provider filters', async () => {
    const db = initializeDatabase({ withSeed: true });
    const telemetry = new TelemetryIngestionService({ db, logger: noopLogger });
    const provider = telemetry.providers.list()[0];
    const apiKey = 'telemetry-secret';
    telemetry.registerApiKey({ providerId: provider.id, apiKey });

    const taskPayload = {
      schema_version: 'v0',
      idempotency_key: 'dash-run-1',
      task_type: 'dashboard-smoke',
      status: 'completed',
      external_id: 'dash-1',
      timing: { started_at: '2024-01-02T00:00:00Z', completed_at: '2024-01-02T00:04:00Z' },
      metrics: { tokens_processed: 420, tool_calls: 2, quality_score: 0.91 }
    };
    telemetry.ingestTaskRun({ payload: taskPayload, apiKey });
    telemetry.ingestEnergy({
      payload: { schema_version: 'v0', task: { idempotency_key: taskPayload.idempotency_key }, energy: { kwh: 1.3, region: 'na-east' } },
      apiKey
    });
    telemetry.ingestQuality({
      payload: { schema_version: 'v0', task: { idempotency_key: taskPayload.idempotency_key }, quality: { score: 0.95, evaluator: 'qa' } },
      apiKey
    });

    api = startAgentApi({
      port: 0,
      logger: noopLogger,
      ownerToken: OWNER_TOKEN,
      ledgerRoot: ledgerDir,
      telemetry,
      publicApiKey: 'public-read'
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    const baseUrl = buildBaseUrl(api.server);

    const today = new Date().toISOString().slice(0, 10);

    const response = await fetch(`${baseUrl}/telemetry/task-runs?from=${today}&to=${today}&limit=5`, {
      headers: { 'x-api-key': 'public-read' }
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.pagination.total).toBeGreaterThanOrEqual(1);
    expect(payload.task_runs[0].provider.id).toBe(provider.id);
    expect(payload.task_runs[0].energy_report.kwh).toBeCloseTo(1.3);
    expect(payload.task_runs[0].quality_evaluation.score).toBeCloseTo(0.95);

    const filtered = await fetch(`${baseUrl}/telemetry/task-runs?from=${today}&to=${today}&provider=${provider.id}`, {
      headers: { 'x-api-key': 'public-read' }
    });
    expect(filtered.status).toBe(200);
    const filteredPayload = await filtered.json();
    expect(filteredPayload.task_runs.every((run) => run.provider_id === provider.id)).toBe(true);
  });
});
