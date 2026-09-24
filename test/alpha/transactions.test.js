import { createServer } from 'node:http';
import { operate } from '../../src/alpha/runtime/engine.js';
import { specialistServer } from '../../src/alpha/runtime/specialists.js';
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import solc from 'solc';
import {
  Interface,
  AbiCoder,
  Wallet,
  Transaction,
  id,
  keccak256,
} from 'ethers';
import { createBlock } from '@ethereumjs/block';
import { createVM } from '@ethereumjs/vm';
import {
  Account,
  createAddressFromString,
  hexToBytes,
  bytesToHex,
} from '@ethereumjs/util';
import {
  initializeNode,
  loadNode,
  runMission,
  exportMission,
  signDetachedReview,
  importDetachedReview,
  signOutcome,
  importOutcome,
  outcomeSummary,
} from '../../src/alpha/node.js';
import { settleAndReinvest } from '../../src/alpha/runtime/transactions.js';
import { rpcQuorum } from '../../src/alpha/runtime/rpc.js';
const TOKEN = '0xa61a3b3a130a9c20768eebf97e21515a6046a1fa';
const fixture = JSON.parse(
  readFileSync('examples/alpha/opportunity-scan.json', 'utf8'),
);
const mock = `pragma solidity ^0.8.20; contract Token {
 mapping(address=>uint256) public balanceOf; mapping(address=>mapping(address=>uint256)) public allowance;
 event Transfer(address indexed from,address indexed to,uint256 value);
 function decimals() external pure returns(uint8){return 18;}
 function mint(address a,uint256 n) external {balanceOf[a]+=n;}
 function approve(address a,uint256 n) external returns(bool){allowance[msg.sender][a]=n;return true;}
 function transfer(address a,uint256 n) external returns(bool){require(balanceOf[msg.sender]>=n);balanceOf[msg.sender]-=n;balanceOf[a]+=n;emit Transfer(msg.sender,a,n);return true;}
 function transferFrom(address a,address b,uint256 n) external returns(bool){require(allowance[a][msg.sender]>=n);allowance[a][msg.sender]-=n;require(balanceOf[a]>=n);balanceOf[a]-=n;balanceOf[b]+=n;emit Transfer(a,b,n);return true;}
}`;
let artifacts,
  dir,
  vm,
  owner,
  nodeWallet,
  reviewer,
  escrow,
  manager,
  token,
  now,
  height,
  nonces,
  receipts,
  sent,
  policy,
  provider,
  rpc,
  mission;
beforeAll(() => {
  const paths = [
    'contracts/AlphaMissionEscrow.sol',
    'contracts/AlphaNodeManager.sol',
    'contracts/access/Ownable.sol',
    'contracts/interfaces/IAlphaWorkUnitEvents.sol',
  ];
  const sources = Object.fromEntries(
    paths.map((p) => [p, { content: readFileSync(p, 'utf8') }]),
  );
  sources['Token.sol'] = { content: mock };
  const result = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: 'Solidity',
        sources,
        settings: {
          evmVersion: 'cancun',
          optimizer: { enabled: true, runs: 200 },
          outputSelection: {
            '*': {
              '*': [
                'abi',
                'evm.bytecode.object',
                'evm.deployedBytecode.object',
              ],
            },
          },
        },
      }),
    ),
  );
  const errors = result.errors?.filter((e) => e.severity === 'error') ?? [];
  if (errors.length)
    throw new Error(errors.map((e) => e.formattedMessage).join('\n'));
  artifacts = result.contracts;
});
async function call(contract, signer, fn, args = []) {
  const result = await vm.evm.runCall({
    caller: createAddressFromString(signer),
    to: createAddressFromString(contract.address),
    data: hexToBytes(contract.iface.encodeFunctionData(fn, args)),
    gasLimit: 10000000n,
    block: createBlock({ header: { timestamp: now } }),
  });
  if (result.execResult.exceptionError)
    throw new Error(`${fn}: ${bytesToHex(result.execResult.returnValue)}`);
  return contract.iface.decodeFunctionResult(
    fn,
    bytesToHex(result.execResult.returnValue),
  );
}
async function deploy(path, name, args = [], types = []) {
  const a = artifacts[path][name];
  const result = await vm.evm.runCall({
    caller: createAddressFromString(owner.address),
    data: hexToBytes(
      '0x' +
        a.evm.bytecode.object +
        AbiCoder.defaultAbiCoder().encode(types, args).slice(2),
    ),
    gasLimit: 20000000n,
  });
  if (result.execResult.exceptionError) throw result.execResult.exceptionError;
  return {
    address: result.createdAddress.toString(),
    iface: new Interface(a.abi),
  };
}
const hex = (n) => '0x' + BigInt(n).toString(16);
async function fakeRpc(method, params) {
  if (method === 'eth_chainId') return '0x1';
  if (method === 'eth_getBlockByNumber') {
    const number =
      params[0] === 'finalized' || params[0] === 'latest'
        ? height
        : Number(BigInt(params[0]));
    return { number: hex(number), hash: id(`block-${number}`) };
  }
  if (method === 'eth_getCode')
    return bytesToHex(
      await vm.stateManager.getCode(createAddressFromString(params[0])),
    );
  if (method === 'eth_getBalance') return hex(10n ** 22n);
  if (method === 'eth_getTransactionCount')
    return hex(nonces.get(params[0].toLowerCase()) ?? 0);
  if (method === 'eth_getTransactionReceipt')
    return receipts.get(params[0]) ?? null;
  if (method === 'eth_call' || method === 'eth_estimateGas') {
    const tx = params[0];
    await vm.stateManager.checkpoint();
    try {
      const result = await vm.evm.runCall({
        caller: createAddressFromString(tx.from ?? owner.address),
        to: createAddressFromString(tx.to),
        data: hexToBytes(tx.data),
        gasLimit: 10000000n,
        block: createBlock({ header: { timestamp: now } }),
      });
      if (result.execResult.exceptionError) throw new Error('VM call reverted');
      return method === 'eth_call'
        ? bytesToHex(result.execResult.returnValue)
        : hex(result.execResult.executionGasUsed + 21000n);
    } finally {
      await vm.stateManager.revert();
    }
  }
  if (method === 'eth_sendRawTransaction') {
    const tx = Transaction.from(params[0]);
    if (tx.chainId !== 1n || !tx.signature)
      throw new Error('Invalid signed transaction');
    if (receipts.has(tx.hash)) return tx.hash;
    if (tx.nonce !== (nonces.get(tx.from.toLowerCase()) ?? 0))
      throw new Error('Nonce mismatch');
    sent.push(tx);
    height++;
    nonces.set(tx.from.toLowerCase(), tx.nonce + 1);
    const result = await vm.evm.runCall({
      caller: createAddressFromString(tx.from),
      to: createAddressFromString(tx.to),
      data: hexToBytes(tx.data),
      gasLimit: tx.gasLimit,
      block: createBlock({ header: { timestamp: now } }),
    });
    const logs = (result.execResult.logs ?? []).map(
      ([address, topics, data], i) => ({
        address: bytesToHex(address),
        topics: topics.map(bytesToHex),
        data: bytesToHex(data),
        logIndex: hex(i),
        removed: false,
      }),
    );
    receipts.set(tx.hash, {
      transactionHash: tx.hash,
      blockHash: id(`block-${height}`),
      blockNumber: hex(height),
      status: result.execResult.exceptionError ? '0x0' : '0x1',
      from: tx.from,
      to: tx.to,
      logs,
    });
    return tx.hash;
  }
  throw new Error(`Unsupported fixture RPC ${method}`);
}
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'alpha-tx-'));
  vm = await createVM();
  owner = Wallet.createRandom();
  nodeWallet = Wallet.createRandom();
  reviewer = Wallet.createRandom();
  now = BigInt(Math.floor(Date.now() / 1000));
  height = 1;
  nonces = new Map();
  receipts = new Map();
  sent = [];
  for (const w of [owner, nodeWallet, reviewer])
    await vm.stateManager.putAccount(
      createAddressFromString(w.address),
      new Account(0n, 10n ** 22n),
    );
  await vm.stateManager.putCode(
    createAddressFromString(TOKEN),
    hexToBytes('0x' + artifacts['Token.sol'].Token.evm.deployedBytecode.object),
  );
  token = {
    address: TOKEN,
    iface: new Interface(artifacts['Token.sol'].Token.abi),
  };
  escrow = await deploy(
    'contracts/AlphaMissionEscrow.sol',
    'AlphaMissionEscrow',
  );
  manager = await deploy(
    'contracts/AlphaNodeManager.sol',
    'AlphaNodeManager',
    [TOKEN],
    ['address'],
  );
  await initializeNode(dir, {
    ensName: 'tx.alpha.node.agi.eth',
    reviewer: reviewer.address,
    privateKey: nodeWallet.privateKey,
  });
  const config = JSON.parse(await readFile(join(dir, 'config.json')));
  config.mode = 'live';
  config.rpcUrl = 'https://fixture-one.example';
  await writeFile(join(dir, 'config.json'), JSON.stringify(config));
  // A fixture ENS provider, explicitly not a live mainnet identity assertion.
  provider = {
    getNetwork: async () => ({ chainId: 1n }),
    resolveName: async () => nodeWallet.address,
    getCode: async (a) => fakeRpc('eth_getCode', [a]),
    call: async (tx) => fakeRpc('eth_call', [tx]),
  };
  mission = await runMission(dir, fixture, { identityProvider: provider });
  const exported = await exportMission(dir, fixture.id, join(dir, 'out'));
  const bundle = JSON.parse(await readFile(exported.evidence));
  await importDetachedReview(
    dir,
    await signDetachedReview(
      bundle,
      'accepted',
      'Synthetic VM qualification with a separate reviewer key',
      reviewer.privateKey,
      { escrow: escrow.address, expiresAt: Number(now) + 3600 },
    ),
  );
  await call(token, owner.address, 'mint', [owner.address, 1000]);
  await call(token, owner.address, 'approve', [escrow.address, 1000]);
  await call(escrow, owner.address, 'fund', [
    mission.workId,
    nodeWallet.address,
    reviewer.address,
    100,
    now + 3600n,
  ]);
  await call(manager, owner.address, 'registerIdentity', [
    id('fixture ENS'),
    nodeWallet.address,
  ]);
  policy = {
    enabled: true,
    escrow: {
      address: escrow.address,
      codeHash: keccak256(await fakeRpc('eth_getCode', [escrow.address])),
    },
    tokenCodeHash: keccak256(await fakeRpc('eth_getCode', [TOKEN])),
    manager: {
      address: manager.address,
      codeHash: keccak256(await fakeRpc('eth_getCode', [manager.address])),
    },
    maxGasLimit: '500000',
    maxFeePerGasWei: '1000000000',
    priorityFeePerGasWei: '100000000',
    maxDailyGasWei: '10000000000000000',
    reinvestBps: 5000,
    maxReinvestPerMission: '40',
    minLiquidBalance: '20',
  };
  rpc = rpcQuorum(
    ['https://fixture-one.example', 'https://fixture-two.example'],
    {
      fetchImpl: async (_, request) => {
        const { method, params } = JSON.parse(request.body);
        try {
          return Response.json({ result: await fakeRpc(method, params) });
        } catch {
          return Response.json({
            error: { code: -32000, message: 'fixture rejection' },
          });
        }
      },
    },
  );
});
afterEach(async () => rm(dir, { recursive: true, force: true }));
const step = () =>
  settleAndReinvest(dir, fixture.id, policy, null, {
    rpc,
    identityProvider: provider,
  });
describe('signed transactions over RPC into actual local EVM bytecode', () => {
  it('submits, relays independent review, verifies token payment and reinvests only the capped amount exactly once', async () => {
    const phases = [];
    for (let i = 0; i < 12; i++) phases.push(await step());
    expect(
      phases.some((x) => x.phase === 'review' && x.status === 'confirmed'),
    ).toBe(true);
    expect(
      phases.some((x) => x.phase === 'claim' && x.status === 'confirmed'),
    ).toBe(true);
    expect(
      (await call(token, owner.address, 'balanceOf', [nodeWallet.address]))[0],
    ).toBe(60n);
    expect(
      (
        await call(manager, owner.address, 'stakedBalance', [
          nodeWallet.address,
        ])
      )[0],
    ).toBe(40n);
    expect((await call(escrow, owner.address, 'reserved'))[0]).toBe(0n);
    expect(sent).toHaveLength(5);
    expect(new Set(sent.map((t) => t.nonce)).size).toBe(5);
    await step();
    expect(sent).toHaveLength(5);
  }, 15000);
  it.each(['usage', 'work'])(
    'closes the integrated %s-to-action-to-payment-to-outcome loop',
    async (sourceKind) => {
      const health = createServer((req, res) =>
        res.end(JSON.stringify({ healthy: true })),
      );
      await new Promise((r) => health.listen(0, '127.0.0.1', r));
      const peerDir = join(dir, 'peer');
      const peerConfig = await initializeNode(peerDir, {
        ensName: 'specialist.alpha.node.agi.eth',
      });
      const peer = await specialistServer(peerDir, {
        allowedCallers: [nodeWallet.address],
        capabilities: ['risk-review'],
        priceMicroUsd: 10,
        maxDailyRequests: 3,
      });
      try {
        await writeFile(
          join(dir, 'service.json'),
          JSON.stringify({ cacheEnabled: false }),
        );
        await writeFile(
          join(dir, 'pipeline.json'),
          await readFile('examples/alpha/pipeline.json'),
        );
        await writeFile(
          join(dir, 'usage.json'),
          JSON.stringify({
            schema: 1,
            observedAt: new Date().toISOString(),
            period: 'Synthetic end-to-end qualification',
            services: [
              {
                id: 'inference',
                name: 'Qualification service',
                requests: 1000,
                repeatedRequests: 600,
                costUsd: 500,
              },
            ],
          }),
        );
        if (sourceKind === 'work') {
          const p = JSON.parse(await readFile('examples/alpha/pipeline.json'));
          p.sourceKind = 'work';
          p.source = 'work-source.json';
          p.policy.minExpectedNet = 0;
          await writeFile(join(dir, 'pipeline.json'), JSON.stringify(p));
          const source = JSON.parse(
            await readFile('examples/alpha/work-quality.json'),
          );
          source.observedAt = new Date().toISOString();
          await writeFile(
            join(dir, 'work-source.json'),
            JSON.stringify(source),
          );
        }
        await writeFile(
          join(dir, 'engine.json'),
          JSON.stringify({
            schema: 1,
            adaptive: { enabled: true },
            peers: [{ address: peerConfig.address, url: peer.url }],
            specialistCapabilities: ['risk-review'],
            maxSpecialistPriceMicroUsd: 10,
            maxDailyActions: 2,
            actions: {
              [sourceKind === 'work' ? 'verified-analysis' : 'cache-inference']:
                {
                  kind: 'json-set',
                  root: dir,
                  file: 'service.json',
                  pointer: ['cacheEnabled'],
                  value: true,
                  healthUrl: `http://127.0.0.1:${health.address().port}/health`,
                  healthField: 'healthy',
                  healthValue: true,
                  timeoutMs: 1000,
                },
            },
            transactions: policy,
          }),
        );
        const dependencies = {
          identityProvider: provider,
          transactionDependencies: { rpc, identityProvider: provider },
        };
        const first = await operate(dir, dependencies);
        const missionId = first.discovery.missionId;
        const run = (await loadNode(dir)).runs.get(missionId);
        expect(run.runtimeContext.specialists).toHaveLength(1);
        await call(escrow, owner.address, 'fund', [
          run.workId,
          nodeWallet.address,
          reviewer.address,
          100,
          now + 3600n,
        ]);
        let exported = await exportMission(
          dir,
          missionId,
          join(dir, 'integrated-output'),
        );
        let bundle = JSON.parse(await readFile(exported.evidence));
        await importDetachedReview(
          dir,
          await signDetachedReview(
            bundle,
            'accepted',
            'Reviewed exact action and specialist report in the synthetic qualification',
            reviewer.privateKey,
            { escrow: escrow.address, expiresAt: Number(now) + 3600 },
          ),
        );
        const progress = [];
        for (let i = 0; i < 11; i++)
          progress.push(await operate(dir, dependencies));
        expect(
          JSON.parse(await readFile(join(dir, 'service.json'))).cacheEnabled,
        ).toBe(true);
        expect(
          (
            await call(manager, owner.address, 'stakedBalance', [
              nodeWallet.address,
            ])
          )[0],
        ).toBe(40n);
        expect(
          (
            await call(token, owner.address, 'balanceOf', [nodeWallet.address])
          )[0],
        ).toBe(60n);
        exported = await exportMission(
          dir,
          missionId,
          join(dir, 'integrated-output'),
        );
        bundle = JSON.parse(await readFile(exported.evidence));
        await importOutcome(
          dir,
          await signOutcome(
            bundle,
            {
              measuredBenefitUsd: 100,
              measuredCostUsd: 30,
              observedAt: new Date().toISOString(),
              evidence:
                'Synthetic economic measurements for the integrated local VM qualification; file execution and token state transitions were real local computations.',
            },
            reviewer.privateKey,
          ),
        );
        const final = await loadNode(dir);
        expect(outcomeSummary(final).reviewerReportedNetUsd).toBe(70);
        expect(
          [...final.runtime.values()].filter(
            (e) =>
              e.topic === 'transaction-result' && e.data.status === 'confirmed',
          ),
        ).toHaveLength(5);
        expect(sent).toHaveLength(5);
        if (process.env.ALPHA_QUALIFICATION_OUTPUT) {
          const output = join(
            process.env.ALPHA_QUALIFICATION_OUTPUT,
            sourceKind,
          );
          await exportMission(dir, missionId, output);
          await writeFile(
            join(output, 'closed-loop.json'),
            JSON.stringify(
              {
                fixture: true,
                sourceKind,
                workResult: final.runs.get(missionId).analysis.work ?? null,
                actualLocalOperations: [
                  'HTTP specialist exchange',
                  'signed review',
                  'file change and health check',
                  'signed raw transactions',
                  'EVM escrow/token/stake execution',
                  'signed outcome',
                ],
                notLive: [
                  'ENS provider',
                  'RPC consensus providers',
                  'token balances',
                  'economic outcome measurements',
                  'reviewer human independence',
                ],
                first,
                progress,
                outcomes: outcomeSummary(final),
                transactionHashes: sent.map((t) => t.hash),
                stakedBaseUnits: '40',
                liquidBaseUnits: '60',
              },
              null,
              2,
            ) + '\n',
          );
        }
      } finally {
        health.closeAllConnections();
        peer.server.closeAllConnections();
        await Promise.all([
          new Promise((r) => health.close(r)),
          new Promise((r) => peer.server.close(r)),
        ]);
      }
    },
    30000,
  );
  it('retains a prepared transaction across a lost broadcast response and reconciles without duplicate sends', async () => {
    const original = rpc.one;
    let lose = true;
    rpc.one = async (...args) => {
      const result = await original(...args);
      if (args[1] === 'eth_sendRawTransaction' && lose) {
        lose = false;
        throw new Error('Lost response');
      }
      return result;
    };
    expect((await step()).status).toBe('pending');
    expect(sent).toHaveLength(1);
    expect((await step()).status).toBe('confirmed');
    expect(sent).toHaveLength(1);
    expect(
      [...(await loadNode(dir)).runtime.values()].filter(
        (e) => e.topic === 'transaction-prepared',
      ),
    ).toHaveLength(1);
  });
  it('blocks foreign pending nonces, excessive gas, insufficient ETH and loss of ENS authority before signing', async () => {
    const agree = rpc.agree;
    rpc.agree = async (method, params) =>
      method === 'eth_getTransactionCount' && params[1] === 'pending'
        ? '0x1'
        : agree(method, params);
    await expect(step()).rejects.toThrow('pending nonce');
    rpc.agree = agree;
    policy.maxGasLimit = '21000';
    await expect(step()).rejects.toThrow('Gas estimate');
    policy.maxGasLimit = '500000';
    rpc.agree = async (method, params) =>
      method === 'eth_getBalance' ? '0x0' : agree(method, params);
    await expect(step()).rejects.toThrow('native balance');
    rpc.agree = agree;
    provider.resolveName = async () => reviewer.address;
    await expect(step()).rejects.toThrow('ENS address');
    expect(sent).toHaveLength(0);
  });
  it('waits for finality and rejects inconsistent or substituted transaction receipts', async () => {
    await step();
    const receipt = receipts.get(sent[0].hash),
      snapshot = rpc.snapshot,
      both = rpc.both,
      agree = rpc.agree;
    rpc.snapshot = async () => ({ ...(await snapshot()), number: '0x1' });
    expect((await step()).status).toBe('pending-finality');
    rpc.snapshot = snapshot;
    rpc.both = async (method, params) =>
      method === 'eth_getTransactionReceipt'
        ? [receipt, { ...receipt, status: '0x0' }]
        : both(method, params);
    await expect(step()).rejects.toThrow('disagreement');
    rpc.both = both;
    rpc.agree = async (method, params) =>
      method === 'eth_getBlockByNumber'
        ? { number: receipt.blockNumber, hash: id('fork') }
        : agree(method, params);
    await expect(step()).rejects.toThrow('canonical');
    rpc.agree = agree;
    const from = receipt.from;
    receipt.from = reviewer.address;
    await expect(step()).rejects.toThrow('binding');
    receipt.from = from;
    expect((await step()).status).toBe('confirmed');
    expect(sent).toHaveLength(1);
  });
  it('preserves the liquid reserve and refuses an unrelated pre-existing allowance', async () => {
    for (let i = 0; i < 6; i++) await step();
    policy.minLiquidBalance = '100';
    await expect(step()).rejects.toThrow('liquid reserve');
    policy.minLiquidBalance = '20';
    await call(token, nodeWallet.address, 'approve', [manager.address, 1]);
    await expect(step()).rejects.toThrow('Unexpected token allowance');
    expect(
      (
        await call(manager, owner.address, 'stakedBalance', [
          nodeWallet.address,
        ])
      )[0],
    ).toBe(0n);
    policy.reinvestBps = 0;
    expect((await step()).reinvestedBaseUnits).toBe('0');
    expect(sent).toHaveLength(3);
  });
  it('fails closed on insufficient gas budgets, code mismatch and disabled authority', async () => {
    policy.maxDailyGasWei = '1';
    await expect(step()).rejects.toThrow('reservation exhausted');
    expect(sent).toHaveLength(0);
    policy.maxDailyGasWei = '10000000000000000';
    policy.escrow.codeHash = id('wrong');
    await expect(step()).rejects.toThrow('pin');
    policy.enabled = false;
    await expect(step()).rejects.toThrow('not enabled');
  });
  it.each(['domain', 'work', 'evidence', 'expiry', 'signer', 'malleability'])(
    'rejects a %s attack on relayed review signatures',
    async (attack) => {
      await step();
      await step();
      const domain = {
        name: 'AGIALPHA Mission Escrow',
        version: '1',
        chainId: attack === 'domain' ? 2 : 1,
        verifyingContract: escrow.address,
      };
      const types = {
        Review: [
          { name: 'workId', type: 'bytes32' },
          { name: 'evidenceHash', type: 'bytes32' },
          { name: 'accepted', type: 'bool' },
          { name: 'expiresAt', type: 'uint256' },
        ],
      };
      const value = {
        workId: attack === 'work' ? id('wrong') : mission.workId,
        evidenceHash: attack === 'evidence' ? id('wrong') : mission.hash,
        accepted: true,
        expiresAt: attack === 'expiry' ? Number(now) - 1 : Number(now) + 3600,
      };
      let signature = await (
        attack === 'signer' ? nodeWallet : reviewer
      ).signTypedData(domain, types, value);
      if (attack === 'malleability') {
        const order = BigInt(
          '0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141',
        );
        const highS = (order - BigInt('0x' + signature.slice(66, 130)))
          .toString(16)
          .padStart(64, '0');
        const v = parseInt(signature.slice(130), 16) === 27 ? '1c' : '1b';
        signature = signature.slice(0, 66) + highS + v;
      }
      await expect(
        call(escrow, nodeWallet.address, 'reviewWithSignature', [
          value.workId,
          value.evidenceHash,
          true,
          value.expiresAt,
          signature,
        ]),
      ).rejects.toThrow();
      expect(
        (await call(escrow, owner.address, 'missions', [mission.workId]))
          .status,
      ).toBe(2n);
    },
  );
  it('does not accept a replayed reviewer authorization after final acceptance', async () => {
    for (let i = 0; i < 4; i++) await step();
    const approval = (await loadNode(dir)).runs.get(fixture.id).review
      .settlementApproval;
    await expect(
      call(escrow, nodeWallet.address, 'reviewWithSignature', [
        mission.workId,
        mission.hash,
        true,
        approval.expiresAt,
        approval.signature,
      ]),
    ).rejects.toThrow();
  });
  it('refuses reinvestment when canonical-token transfer evidence is absent', async () => {
    for (let i = 0; i < 4; i++) await step(); // submit and review, broadcast + reconcile
    await step(); // claim broadcast
    const claim = sent.at(-1);
    const receipt = receipts.get(claim.hash);
    receipt.logs = receipt.logs.filter(
      (l) => l.address.toLowerCase() !== TOKEN,
    );
    await expect(step()).rejects.toThrow('transfer receipts');
    expect(
      (
        await call(manager, owner.address, 'stakedBalance', [
          nodeWallet.address,
        ])
      )[0],
    ).toBe(0n);
  });
});
