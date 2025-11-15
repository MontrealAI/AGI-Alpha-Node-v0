import { describe, expect, it, vi, beforeEach, afterEach, afterAll } from 'vitest';

const nodeIdentityRecord = {
  ensName: '1.alpha.node.agi.eth',
  peerId: '12D3KooXidentity',
  pubkey: { x: '0x' + '1'.repeat(64), y: '0x' + '2'.repeat(64) },
  multiaddrs: ['/dns4/example.com/tcp/443/wss/p2p/12D3'],
  metadata: { 'node.role': 'validator', 'node.version': '1.0.0' }
};

const identityModuleMocks = vi.hoisted(() => ({
  loadNodeIdentityRecord: vi.fn(async () => ({ ...nodeIdentityRecord })),
  loadNodeKeypairFromSource: vi.fn(() => ({
    type: 'secp256k1',
    privateKey: '0x' + 'a'.repeat(64),
    publicKey: { x: '0x' + '1'.repeat(64), y: '0x' + '2'.repeat(64) }
  })),
  validateKeypairAgainstEnsRecord: vi.fn(() => true)
}));

vi.mock('../src/identity/bootstrap.js', () => identityModuleMocks);

vi.mock('../src/config/env.js', () => ({
  loadConfig: vi.fn()
}));

vi.mock('../src/orchestrator/nodeRuntime.js', () => ({
  runNodeDiagnostics: vi.fn(),
  bindExecutionLoopMetering: vi.fn(() => ({ detach: vi.fn() }))
}));

vi.mock('../src/orchestrator/monitorLoop.js', () => ({
  startMonitorLoop: vi.fn()
}));

vi.mock('../src/services/offlineSnapshot.js', () => ({
  loadOfflineSnapshot: vi.fn(() => ({ snapshot: true }))
}));

vi.mock('../src/orchestrator/stakeActivator.js', () => ({
  handleStakeActivation: vi.fn()
}));

vi.mock('../src/services/provider.js', () => ({
  createProvider: vi.fn(() => ({ rpc: true })),
  createWallet: vi.fn(() => ({ address: '0x00000000000000000000000000000000000000ff' }))
}));

const lifecycleMockFactory = () => ({
  discover: vi.fn(async () => []),
  watch: vi.fn(() => vi.fn()),
  stop: vi.fn(),
  getMetrics: vi.fn(() => ({ discovered: 0, lastJobProvider: 'agi-jobs' }))
});

vi.mock('../src/services/jobLifecycle.js', () => ({
  createJobLifecycle: vi.fn(() => lifecycleMockFactory())
}));

const apiInstanceFactory = () => ({
  server: { close: (cb) => cb && cb() },
  stop: vi.fn(async () => {}),
  getMetrics: vi.fn(() => ({ submitted: 0, completed: 0, failed: 0, tokensEarned: 0n })),
  setOwnerDirectives: vi.fn(),
  getOwnerDirectives: vi.fn(() => ({ priority: 'nominal', actions: [], notices: [] }))
});

vi.mock('../src/network/apiServer.js', () => ({
  startAgentApi: vi.fn(() => apiInstanceFactory())
}));

const verifierServerInstance = () => ({
  listenPromise: Promise.resolve({ port: 8787 }),
  stop: vi.fn(async () => {}),
  metrics: {},
  validator: { validate: vi.fn() },
  server: { close: (cb) => cb && cb() }
});

vi.mock('../src/network/verifierServer.js', () => ({
  startVerifierServer: vi.fn(() => verifierServerInstance())
}));

const lifecycleJournalMock = { append: vi.fn(), filePath: '/tmp/journal.ndjson' };

vi.mock('../src/services/lifecycleJournal.js', () => ({
  createLifecycleJournal: vi.fn(() => lifecycleJournalMock)
}));

import { bootstrapContainer } from '../src/orchestrator/bootstrap.js';
import { loadConfig } from '../src/config/env.js';
import { runNodeDiagnostics, bindExecutionLoopMetering } from '../src/orchestrator/nodeRuntime.js';
import { startMonitorLoop } from '../src/orchestrator/monitorLoop.js';
import { loadOfflineSnapshot } from '../src/services/offlineSnapshot.js';
import { handleStakeActivation } from '../src/orchestrator/stakeActivator.js';
import { createProvider, createWallet } from '../src/services/provider.js';
import { createJobLifecycle } from '../src/services/jobLifecycle.js';
import { startAgentApi } from '../src/network/apiServer.js';
import { startVerifierServer } from '../src/network/verifierServer.js';
import {
  loadNodeIdentityRecord,
  loadNodeKeypairFromSource,
  validateKeypairAgainstEnsRecord
} from '../src/identity/bootstrap.js';

const baseConfig = {
  RPC_URL: 'https://rpc.example',
  NODE_LABEL: '1',
  ENS_PARENT_DOMAIN: 'alpha.node.agi.eth',
  OPERATOR_ADDRESS: '0x0000000000000000000000000000000000000001',
  NODE_ROLE: 'orchestrator',
  STAKE_MANAGER_ADDRESS: undefined,
  PLATFORM_INCENTIVES_ADDRESS: undefined,
  SYSTEM_PAUSE_ADDRESS: undefined,
  DESIRED_MINIMUM_STAKE: undefined,
  AUTO_RESUME: false,
  METRICS_PORT: 9464,
  VERIFIER_PORT: 8787,
  VERIFIER_PUBLIC_BASE_URL: 'https://node.example',
  JOB_REGISTRY_PROFILE: 'v0',
  JOB_PROFILE_SPEC: null,
  LIFECYCLE_LOG_DIR: '.agi/lifecycle'
};

const diagnosticsMock = {
  verification: {
    nodeName: '1.alpha.node.agi.eth',
    expectedAddress: '0x0000000000000000000000000000000000000001',
    resolvedAddress: '0x0000000000000000000000000000000000000001',
    registryOwner: '0xregistry',
    wrapperOwner: '0xwrapper',
    success: true
  },
  stakeStatus: { operatorStake: 100n, minimumStake: 50n },
  stakeEvaluation: {
    meets: true,
    deficit: 0n,
    penaltyActive: false,
    heartbeatStale: false,
    recommendedAction: null
  },
  ownerDirectives: { actions: [], notices: [], priority: 'nominal' },
  performance: {
    throughputPerEpoch: 3,
    successRate: 0.95,
    averageReward: 1.5,
    tokenEarningsProjection: 1200n
  }
};

describe('bootstrapContainer', () => {
  const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
  const consoleTable = vi.spyOn(console, 'table').mockImplementation(() => {});
  let lifecycleInstance;
  let apiInstance;

  beforeEach(() => {
    loadConfig.mockReturnValue({ ...baseConfig });
    runNodeDiagnostics.mockResolvedValue(diagnosticsMock);
    startMonitorLoop.mockResolvedValue({
      loopPromise: Promise.resolve(),
      stop: vi.fn(async () => {}),
      getTelemetry: vi.fn(),
      getIterations: vi.fn()
    });
    loadOfflineSnapshot.mockClear();
    handleStakeActivation.mockClear();
    createProvider.mockClear();
    createWallet.mockClear();
    createJobLifecycle.mockReset();
    startAgentApi.mockClear();
    lifecycleJournalMock.append.mockClear();
    lifecycleInstance = lifecycleMockFactory();
    createJobLifecycle.mockReturnValue(lifecycleInstance);
    apiInstance = apiInstanceFactory();
    startAgentApi.mockReturnValue(apiInstance);
    startVerifierServer.mockClear();
    identityModuleMocks.loadNodeIdentityRecord.mockClear();
    identityModuleMocks.loadNodeKeypairFromSource.mockClear();
    identityModuleMocks.validateKeypairAgainstEnsRecord.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    consoleLog.mockRestore();
    consoleTable.mockRestore();
  });

  it('throws when mandatory configuration is missing', async () => {
    loadConfig.mockReturnValue({ ...baseConfig, NODE_LABEL: undefined });
    await expect(bootstrapContainer()).rejects.toThrow('NODE_LABEL must be configured for container bootstrap');
  });

  it('loads offline snapshot and skips monitor when requested', async () => {
    await bootstrapContainer({ skipMonitor: true, offlineSnapshotPath: '/tmp/offline.json' });

    expect(loadOfflineSnapshot).toHaveBeenCalledWith('/tmp/offline.json');
    expect(runNodeDiagnostics).toHaveBeenCalledWith(
      expect.objectContaining({ offlineSnapshot: expect.any(Object) })
    );
    expect(startMonitorLoop).not.toHaveBeenCalled();
    expect(handleStakeActivation).toHaveBeenCalled();
    expect(startAgentApi).toHaveBeenCalled();
    expect(startVerifierServer).toHaveBeenCalled();
    expect(apiInstance.setOwnerDirectives).toHaveBeenCalledWith(diagnosticsMock.ownerDirectives);
  });

  it('invokes monitor loop when not skipped', async () => {
    await bootstrapContainer({ intervalSeconds: 45, projectedRewards: '123.4', maxIterations: 1 });

    expect(startMonitorLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ NODE_LABEL: '1' }),
        intervalSeconds: 45,
        projectedRewards: '123.4',
        offlineSnapshotPath: null,
        maxIterations: 1,
        onDiagnostics: expect.any(Function)
      })
    );

    const args = startMonitorLoop.mock.calls[0][0];
    args.onDiagnostics({ ownerDirectives: { priority: 'critical', actions: [] } });
    expect(apiInstance.setOwnerDirectives).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 'critical' })
    );
  });

  it('initializes job lifecycle when registry address is provided', async () => {
    loadConfig.mockReturnValue({ ...baseConfig, JOB_REGISTRY_ADDRESS: '0x00000000000000000000000000000000000000aa' });
    lifecycleInstance = lifecycleMockFactory();
    createJobLifecycle.mockReturnValue(lifecycleInstance);

    await bootstrapContainer({ skipMonitor: true });

    expect(createJobLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ jobRegistryAddress: '0x00000000000000000000000000000000000000aa' })
    );
    expect(lifecycleInstance.discover).toHaveBeenCalled();
    expect(lifecycleInstance.watch).toHaveBeenCalled();
    expect(lifecycleInstance.stop).toHaveBeenCalled();
    expect(bindExecutionLoopMetering).toHaveBeenCalledWith(
      expect.objectContaining({ jobLifecycle: lifecycleInstance })
    );
  });

  it('hydrates node identity and validates keypair before diagnostics run', async () => {
    await bootstrapContainer({ skipMonitor: true });

    expect(loadNodeIdentityRecord).toHaveBeenCalledWith(
      '1.alpha.node.agi.eth',
      expect.objectContaining({ logger: expect.any(Object) })
    );
    expect(loadNodeKeypairFromSource).toHaveBeenCalledWith(expect.objectContaining({ logger: expect.any(Object) }));
    expect(validateKeypairAgainstEnsRecord).toHaveBeenCalledWith(
      expect.objectContaining({ ensName: '1.alpha.node.agi.eth' }),
      expect.objectContaining({ privateKey: expect.stringMatching(/^0x[a-f0-9]{64}$/) }),
      expect.objectContaining({ logger: expect.any(Object) })
    );
  });
});
