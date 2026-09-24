import { describe, it, expect } from 'vitest';
import { Wallet, Interface, keccak256 } from 'ethers';
import { observeSettlement } from '../../src/alpha/settlement.js';
import { AGIALPHA_TOKEN_ADDRESS } from '../../src/constants/token.js';
const node = Wallet.createRandom().address, reviewer = Wallet.createRandom().address, escrow = Wallet.createRandom().address;
const config = { mode: 'live', address: node, reviewer };
const hash = `0x${'12'.repeat(32)}`;
const run = { identity: { verified: true }, review: { decision: 'accepted' }, workId: hash, hash };
const abi = new Interface(['function TOKEN() view returns (address)', 'function missions(bytes32) view returns (address,address,address,uint256,uint256,bytes32,uint8)']);
const options = { escrow, codeHash: keccak256('0x6000'), rpcUrls: ['https://rpc-one.example', 'https://rpc-two.example'] };
function rpcFixture(change = () => undefined) {
  return async (url, request) => {
    const { method, params } = JSON.parse(request.body);
    let result;
    if (method === 'eth_chainId') result = '0x1';
    if (method === 'eth_getBlockByNumber') result = { number: '0x123', hash };
    if (method === 'eth_getCode') result = '0x6000';
    if (method === 'eth_call') result = params[0].data === abi.encodeFunctionData('TOKEN') ? abi.encodeFunctionResult('TOKEN', [AGIALPHA_TOKEN_ADDRESS]) : abi.encodeFunctionResult('missions', [node, reviewer, reviewer, 100n, 200n, hash, 5]);
    result = change({ url, method, params, result }) ?? result;
    return Response.json({ jsonrpc: '2.0', id: 1, result });
  };
}
describe('finalized settlement observation (RPC fixtures, not mainnet payment)', () => {
  it('requires agreement at a shared finalized canonical block and a bytecode pin', async () => {
    const calls = [];
    const result = await observeSettlement(config, run, options, { fetchImpl: rpcFixture(c => { calls.push(c); }) });
    expect(result.status).toBe('paid'); expect(result.rewardBaseUnits).toBe('100');
    expect(calls.filter(c => c.method === 'eth_call').every(c => c.params[1].blockHash === hash && c.params[1].requireCanonical)).toBe(true);
    expect(result.limitation).toContain('Does not independently verify');
  });
  it.each(['chain', 'block', 'code', 'token', 'evidence', 'state'])('fails closed on %s disagreement or mismatch', async failure => {
    const fetchImpl = rpcFixture(({ url, method, params, result }) => {
      if (failure === 'chain' && method === 'eth_chainId') return '0x2';
      if (failure === 'block' && method === 'eth_getBlockByNumber' && url.hostname === 'rpc-two.example') return { ...result, hash: `0x${'34'.repeat(32)}` };
      if (failure === 'code' && method === 'eth_getCode') return '0x6001';
      if (failure === 'token' && method === 'eth_call' && params[0].data === abi.encodeFunctionData('TOKEN')) return abi.encodeFunctionResult('TOKEN', [escrow]);
      if (method === 'eth_call' && params[0].data !== abi.encodeFunctionData('TOKEN')) {
        if (failure === 'evidence') return abi.encodeFunctionResult('missions', [node, reviewer, reviewer, 100, 200, `0x${'56'.repeat(32)}`, 5]);
        if (failure === 'state' && url.hostname === 'rpc-two.example') return abi.encodeFunctionResult('missions', [node, reviewer, reviewer, 101, 200, hash, 5]);
      }
    });
    await expect(observeSettlement(config, run, options, { fetchImpl })).rejects.toThrow();
  });
  it('rejects local runs, repeated origins and missing bytecode pins before network access', async () => {
    await expect(observeSettlement({ ...config, mode: 'local' }, run, options)).rejects.toThrow('live');
    await expect(observeSettlement(config, run, { ...options, rpcUrls: [options.rpcUrls[0], options.rpcUrls[0]] })).rejects.toThrow('distinct');
    await expect(observeSettlement(config, run, { ...options, codeHash: '' })).rejects.toThrow('Pin');
  });
});
