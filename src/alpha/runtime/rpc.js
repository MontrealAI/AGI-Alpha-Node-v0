import { getAddress, keccak256 } from 'ethers';
import { digest } from '../mission.js';
export function rpcQuorum(rpcUrls, { fetchImpl = fetch } = {}) {
  if (!Array.isArray(rpcUrls) || rpcUrls.length !== 2)
    throw new Error('Two independent RPC endpoints required');
  const urls = rpcUrls.map((value) => {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.hash)
      throw new Error('HTTPS RPC endpoints required');
    return u;
  });
  if (urls[0].origin === urls[1].origin)
    throw new Error('Distinct RPC origins required');
  async function one(index, method, params) {
    const response = await fetchImpl(urls[index], {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 1_000_000) throw new Error('RPC response exceeds limit');
      chunks.push(chunk);
    }
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (result.error || result.result === undefined)
      throw new Error(`RPC ${method} rejected`);
    return result.result;
  }
  async function both(method, params) {
    return Promise.all([one(0, method, params), one(1, method, params)]);
  }
  async function agree(method, params) {
    const values = await both(method, params);
    if (digest(values[0]) !== digest(values[1]))
      throw new Error(`RPC disagreement: ${method}`);
    return values[0];
  }
  async function snapshot() {
    if ((await both('eth_chainId', [])).some((x) => BigInt(x) !== 1n))
      throw new Error('Ethereum mainnet required');
    const heads = await both('eth_getBlockByNumber', ['finalized', false]);
    if (heads.some((h) => !h?.hash || !h?.number))
      throw new Error('Finalized block unavailable');
    const number = `0x${(BigInt(heads[0].number) < BigInt(heads[1].number) ? BigInt(heads[0].number) : BigInt(heads[1].number)).toString(16)}`;
    const blocks = await both('eth_getBlockByNumber', [number, false]);
    if (
      blocks.some((b) => !b?.hash || BigInt(b.number) !== BigInt(number)) ||
      blocks[0].hash !== blocks[1].hash
    )
      throw new Error('Finalized block disagreement');
    return {
      number,
      hash: blocks[0].hash,
      selector: { blockHash: blocks[0].hash, requireCanonical: true },
    };
  }
  async function pin(contract, hash, snapshot) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash))
      throw new Error('Verified runtime bytecode hash required');
    const code = await agree('eth_getCode', [
      getAddress(contract),
      snapshot.selector,
    ]);
    if (code === '0x' || keccak256(code).toLowerCase() !== hash.toLowerCase())
      throw new Error('Bytecode pin mismatch');
  }
  return {
    one,
    both,
    agree,
    snapshot,
    pin,
    origins: urls.map((u) => u.origin),
  };
}
