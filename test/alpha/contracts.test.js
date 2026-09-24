import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeNode, runMission, reviewMission, loadNode } from '../../src/alpha/node.js';
import { readFileSync } from 'node:fs';
import solc from 'solc';
import { Interface, AbiCoder, id, Wallet } from 'ethers';
import { createBlock } from '@ethereumjs/block';
import { createVM } from '@ethereumjs/vm';
import { Account, createAddressFromString, hexToBytes, bytesToHex } from '@ethereumjs/util';
const TOKEN = '0xa61a3b3a130a9c20768eebf97e21515a6046a1fa';
const actor = n => createAddressFromString('0x' + n.toString(16).padStart(40, '0'));
const owner = actor(1), node = actor(2), reviewer = actor(3), stranger = actor(4);
const tokenAddress = createAddressFromString(TOKEN);
const mock = `pragma solidity ^0.8.20; contract Token {
 mapping(address=>uint256) public balanceOf; mapping(address=>mapping(address=>uint256)) public allowance;
 function mint(address a,uint256 n) external {balanceOf[a]+=n;}
 function approve(address a,uint256 n) external returns(bool){allowance[msg.sender][a]=n;return true;}
 function transfer(address a,uint256 n) external returns(bool){require(balanceOf[msg.sender]>=n);balanceOf[msg.sender]-=n;balanceOf[a]+=n;return true;}
 function transferFrom(address a,address b,uint256 n) external returns(bool){require(allowance[a][msg.sender]>=n);allowance[a][msg.sender]-=n;require(balanceOf[a]>=n);balanceOf[a]-=n;balanceOf[b]+=n;return true;}
}`;
let artifacts, vm, escrow, manager, token, now;
beforeAll(() => {
 const paths = ['contracts/AlphaMissionEscrow.sol', 'contracts/AlphaNodeManager.sol', 'contracts/access/Ownable.sol', 'contracts/interfaces/IAlphaWorkUnitEvents.sol'];
 const sources = Object.fromEntries(paths.map(p => [p, { content: readFileSync(p, 'utf8') }])); sources['Token.sol'] = { content: mock };
 const out = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources, settings: { evmVersion: 'cancun', optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } } } })));
 const errors = out.errors?.filter(e => e.severity === 'error') ?? []; if (errors.length) throw new Error(errors.map(e => e.formattedMessage).join('\n')); artifacts = out.contracts;
});
async function call(c, who, fn, args = [], ok = true) {
 const r = await vm.evm.runCall({ caller: who, to: c.address, data: hexToBytes(c.iface.encodeFunctionData(fn, args)), gasLimit: 10_000_000n, block: createBlock({ header: { timestamp: now } }) });
 if (ok) { expect(r.execResult.exceptionError, bytesToHex(r.execResult.returnValue)).toBeUndefined(); return c.iface.decodeFunctionResult(fn, bytesToHex(r.execResult.returnValue)); }
 expect(r.execResult.exceptionError).toBeDefined(); return r;
}
async function deploy(path, name, args = [], types = []) {
 const a = artifacts[path][name]; const data = '0x' + a.evm.bytecode.object + AbiCoder.defaultAbiCoder().encode(types, args).slice(2);
 const r = await vm.evm.runCall({ caller: owner, data: hexToBytes(data), gasLimit: 20_000_000n }); expect(r.execResult.exceptionError).toBeUndefined();
 return { address: r.createdAddress, iface: new Interface(a.abi) };
}
beforeEach(async () => {
 now = 1000n; vm = await createVM(); for (const a of [owner,node,reviewer,stranger]) await vm.stateManager.putAccount(a, new Account(0n, 10n ** 22n));
 await vm.stateManager.putCode(tokenAddress, hexToBytes('0x' + artifacts['Token.sol'].Token.evm.deployedBytecode.object));
 token = { address: tokenAddress, iface: new Interface(artifacts['Token.sol'].Token.abi) };
 escrow = await deploy('contracts/AlphaMissionEscrow.sol','AlphaMissionEscrow');
 manager = await deploy('contracts/AlphaNodeManager.sol','AlphaNodeManager',[TOKEN],['address']);
 await call(token, owner, 'mint', [owner.toString(), 1000]); await call(token, owner, 'approve', [escrow.address.toString(), 1000]);
});
const wid = id('alpha-mission-test'), evidence = id('signed-evidence');
async function fund() { await call(escrow, owner, 'fund', [wid,node.toString(),reviewer.toString(),100, 9999999999]); }
async function accept() { await fund(); await call(escrow,node,'submit',[wid,evidence]); await call(escrow,reviewer,'review',[wid,evidence,true]); }

describe('funded $AGIALPHA mission lifecycle in local EVM', () => {
 it('settles the exact evidence hash of a real signed local analytical run', async () => {
  const dir = await mkdtemp(join(tmpdir(),'alpha-e2e-')); const reviewerWallet = Wallet.createRandom();
  try {
   const config = await initializeNode(dir,{ensName:'e2e.alpha.node.agi.eth',reviewer:reviewerWallet.address});
   const run = await runMission(dir,JSON.parse(readFileSync('examples/alpha/opportunity-scan.json','utf8')));
   await reviewMission(dir,run.mission.id,'accepted','Test-role review: recomputed synthetic example.',reviewerWallet.privateKey);
   expect((await loadNode(dir)).runs.get(run.mission.id).review.runHash).toBe(run.hash);
   const runtimeNode = createAddressFromString(config.address); const runtimeReviewer = createAddressFromString(reviewerWallet.address);
   for(const a of [runtimeNode,runtimeReviewer]) await vm.stateManager.putAccount(a,new Account(0n,10n**22n));
   await call(escrow,owner,'fund',[run.workId,config.address,reviewerWallet.address,100,2000]);
   await call(escrow,runtimeNode,'submit',[run.workId,run.hash]);
   await call(escrow,runtimeReviewer,'review',[run.workId,run.hash,true]);
   await call(escrow,runtimeNode,'claim',[run.workId]);
   expect((await call(token,owner,'balanceOf',[config.address]))[0]).toBe(100n);
   expect((await call(escrow,owner,'reserved'))[0]).toBe(0n);
  } finally {await rm(dir,{recursive:true,force:true});}
 });
 it('funds, submits, independently reviews, pays exactly once and closes the reserve', async () => {
  await accept(); await call(escrow,node,'claim',[wid]); expect((await call(token,owner,'balanceOf',[node.toString()]))[0]).toBe(100n); expect((await call(escrow,owner,'reserved'))[0]).toBe(0n); await call(escrow,node,'claim',[wid],false);
 });
 it('rejects unauthorized funding, duplicate IDs and self-review assignments', async () => {
  await call(escrow,stranger,'fund',[wid,node.toString(),reviewer.toString(),100,9999999999],false);
  await call(escrow,owner,'fund',[wid,node.toString(),node.toString(),100,9999999999],false);
  await fund(); await call(escrow,owner,'fund',[wid,node.toString(),reviewer.toString(),100,9999999999],false);
 });
 it('rejects outsider submission, self-review and evidence substitution', async () => {
  await fund(); await call(escrow,stranger,'submit',[wid,evidence],false); await call(escrow,node,'submit',[wid,evidence]);
  await call(escrow,node,'review',[wid,evidence,true],false); await call(escrow,reviewer,'review',[wid,id('other'),true],false); await call(escrow,node,'claim',[wid],false);
 });
 it('refunds rejection to the original funder exactly once', async () => {
  await fund(); await call(escrow,node,'submit',[wid,evidence]); await call(escrow,reviewer,'review',[wid,evidence,false]); await call(escrow,stranger,'refund',[wid]);
  expect((await call(token,owner,'balanceOf',[owner.toString()]))[0]).toBe(1000n); expect((await call(escrow,owner,'reserved'))[0]).toBe(0n); await call(escrow,owner,'refund',[wid],false);
 });
 it('cannot sweep funded obligations or refund accepted work', async () => {
  await accept(); await call(escrow,owner,'sweepSurplus',[owner.toString(),1],false); await call(escrow,owner,'refund',[wid],false);
 });
 it('refunds expired unaccepted missions and rejects late submission or review', async () => {
  await call(escrow,owner,'fund',[wid,node.toString(),reviewer.toString(),100,1010]);
  now = 1011n; await call(escrow,node,'submit',[wid,evidence],false); await call(escrow,stranger,'refund',[wid]);
  expect((await call(escrow,owner,'reserved'))[0]).toBe(0n);
  const next = id('expired-submitted'); now = 1000n; await call(escrow,owner,'fund',[next,node.toString(),reviewer.toString(),100,1010]);
  await call(escrow,node,'submit',[next,evidence]); now = 1011n; await call(escrow,reviewer,'review',[next,evidence,true],false); await call(escrow,stranger,'refund',[next]);
 });
 it('preserves an accepted claim beyond expiry and owner rotation', async () => {
  await accept(); now = 10000000000n; await call(escrow,owner,'transferOwnership',[stranger.toString()]); await call(escrow,stranger,'refund',[wid],false); await call(escrow,node,'claim',[wid]);
  expect((await call(token,owner,'balanceOf',[node.toString()]))[0]).toBe(100n);
 });
 it('pauses admission while preserving accepted claims and rejected refunds', async () => {
  await accept(); await call(escrow,owner,'setPaused',[true]); await call(escrow,owner,'fund',[id('next'),node.toString(),reviewer.toString(),10,9999999999],false); await call(escrow,node,'claim',[wid]);
 });
});

describe('stake conservation and identity routing', () => {
 async function stake() { await call(manager,owner,'registerIdentity',[id('node'),node.toString()]); await call(manager,owner,'setValidator',[node.toString(),true]); await call(token,owner,'mint',[node.toString(),100]); await call(token,node,'approve',[manager.address.toString(),100]); await call(manager,node,'stake',[100]); }
 it('debits deposited stake on withdrawal and slashing; only surplus can be swept', async () => {
  await stake(); await call(manager,owner,'withdrawStake',[node.toString(),30]); await call(manager,owner,'applySlash',[wid,node.toString(),20]);
  expect((await call(manager,owner,'stakedBalance',[node.toString()]))[0]).toBe(50n); expect((await call(manager,owner,'totalStaked'))[0]).toBe(50n);
  await call(manager,owner,'sweepSurplus',[owner.toString(),21],false); await call(manager,owner,'sweepSurplus',[owner.toString(),20]);
  expect((await call(token,owner,'balanceOf',[manager.address.toString()]))[0]).toBe(50n);
  await call(manager,node,'recordAlphaWUValidation',[wid,51,9000],false); await call(manager,owner,'withdrawStake',[node.toString(),51],false); await call(manager,owner,'applySlash',[wid,node.toString(),51],false);
 });
 it('supports explicit owner-directed debit and forbids unauthorized custody changes', async () => {
  await stake(); await call(manager,stranger,'withdrawStake',[node.toString(),10],false); await call(manager,owner,'withdrawStakeFor',[node.toString(),reviewer.toString(),40]); expect((await call(manager,owner,'totalStaked'))[0]).toBe(60n);
 });
 it('clears a previous ENS route when a controller is reassigned', async () => {
  await call(manager,owner,'registerIdentity',[id('old'),node.toString()]); await call(manager,owner,'registerIdentity',[id('new'),node.toString()]); expect((await call(manager,owner,'ensNodeController',[id('old')]))[0]).toBe('0x0000000000000000000000000000000000000000');
  await call(manager,owner,'revokeIdentity',[id('old')],false); expect((await call(manager,owner,'isIdentityActive',[node.toString()]))[0]).toBe(true);
 });
});
