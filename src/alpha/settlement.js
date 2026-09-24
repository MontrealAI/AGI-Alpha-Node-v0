import { Interface, getAddress, keccak256 } from 'ethers';
import { AGIALPHA_TOKEN_ADDRESS } from '../constants/token.js';
const abi = new Interface(['function TOKEN() view returns (address)', 'function missions(bytes32) view returns (address node,address reviewer,address funder,uint256 reward,uint256 deadline,bytes32 evidenceHash,uint8 status)']);
const sameAddress = (a, b) => getAddress(a) === getAddress(b);
// Read-only. Two distinct endpoints are a consistency check, not proof of independent operators.
export async function observeSettlement(config, run, options, { fetchImpl = fetch } = {}) {
  if (config.mode !== 'live' || !run.identity.verified || run.review?.decision !== 'accepted') throw new Error('Accepted live identity-verified mission required');
  const escrow = getAddress(options.escrow);
  if (!/^0x[0-9a-fA-F]{64}$/.test(options.codeHash)) throw new Error('Pin the independently verified deployed escrow bytecode hash');
  if (!Array.isArray(options.rpcUrls) || options.rpcUrls.length !== 2) throw new Error('Two RPC endpoints required');
  const urls = options.rpcUrls.map(value => {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.hash) throw new Error('RPC endpoints require HTTPS without embedded credentials or fragments');
    return u;
  });
  if (urls[0].origin === urls[1].origin) throw new Error('Use distinct RPC origins');
  async function rpc(url, method, params) {
    const response = await fetchImpl(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
    let size = 0; const chunks = [];
    for await (const chunk of response.body) { size += chunk.length; if (size > 1_000_000) throw new Error('RPC response too large'); chunks.push(chunk); }
    const data = JSON.parse(Buffer.concat(chunks).toString());
    if (data.error || data.result === undefined) throw new Error('RPC returned an error or missing result');
    return data.result;
  }
  const chains = await Promise.all(urls.map(u => rpc(u, 'eth_chainId', [])));
  if (chains.some(c => BigInt(c) !== 1n)) throw new Error('Ethereum mainnet required');
  const heads = await Promise.all(urls.map(u => rpc(u, 'eth_getBlockByNumber', ['finalized', false])));
  if (heads.some(h => !h?.number || !h?.hash)) throw new Error('Finalized block unavailable');
  const height = BigInt(heads[0].number) < BigInt(heads[1].number) ? heads[0].number : heads[1].number;
  const blocks = await Promise.all(urls.map(u => rpc(u, 'eth_getBlockByNumber', [height, false])));
  if (blocks.some(b => !b?.hash || b.number !== height) || blocks[0].hash !== blocks[1].hash) throw new Error('Finalized block disagreement');
  const block = { blockHash: blocks[0].hash, requireCanonical: true };
  const results = await Promise.all(urls.map(async u => {
    const code = await rpc(u, 'eth_getCode', [escrow, block]);
    if (code === '0x' || keccak256(code).toLowerCase() !== options.codeHash.toLowerCase()) throw new Error('Escrow bytecode pin mismatch');
    const token = abi.decodeFunctionResult('TOKEN', await rpc(u, 'eth_call', [{ to: escrow, data: abi.encodeFunctionData('TOKEN') }, block]))[0];
    if (!sameAddress(token, AGIALPHA_TOKEN_ADDRESS)) throw new Error('Wrong settlement token');
    const encoded = await rpc(u, 'eth_call', [{ to: escrow, data: abi.encodeFunctionData('missions', [run.workId]) }, block]);
    return encoded;
  }));
  if (results[0].toLowerCase() !== results[1].toLowerCase()) throw new Error('RPC mission state disagreement');
  const mission = abi.decodeFunctionResult('missions', results[0]);
  if (!sameAddress(mission.node, config.address) || !sameAddress(mission.reviewer, config.reviewer) || mission.reward === 0n) throw new Error('Funded mission identity or reward mismatch');
  if (mission.status >= 2n && mission.evidenceHash.toLowerCase() !== run.hash.toLowerCase()) throw new Error('On-chain evidence hash mismatch');
  const statuses = ['none', 'funded', 'submitted', 'accepted', 'rejected', 'paid', 'refunded'];
  if (!statuses[Number(mission.status)]) throw new Error('Unknown escrow state');
  return { kind: 'finalized-escrow-observation', chainId: 1, escrow, codeHash: options.codeHash, blockNumber: height, blockHash: block.blockHash,
    workId: run.workId, evidenceHash: mission.evidenceHash, token: AGIALPHA_TOKEN_ADDRESS, rewardBaseUnits: String(mission.reward), status: statuses[Number(mission.status)],
    rpcOrigins: urls.map(u => u.origin), observedAt: new Date().toISOString(), limitation: 'Read-only agreement from two configured RPC origins and owner-pinned code. Does not independently verify a transfer receipt, RPC operator independence, or bytecode correctness.' };
}
