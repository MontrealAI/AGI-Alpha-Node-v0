// Qualify the two compatibility-sensitive security overrides used by graph-cli.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { createJsonRpcClient } from '../subgraph/node_modules/@graphprotocol/graph-cli/dist/command-helpers/jsonrpc.js';
const require = createRequire(new URL('../subgraph/node_modules/@graphprotocol/graph-cli/package.json', import.meta.url));
const { default: decompress } = await import(pathToFileURL(require.resolve('decompress')));

function tar(name, type = '0', target = '') {
  const header = Buffer.alloc(512);
  const field = (value, offset, length) => header.write(value, offset, length, 'ascii');
  field(name, 0, 100); field('0000644\0', 100, 8); field('0000000\0', 108, 8); field('0000000\0', 116, 8);
  field((type === '0' ? 2 : 0).toString(8).padStart(11, '0') + '\0', 124, 12);
  field('00000000000\0', 136, 12); header.fill(32, 148, 156); field(type, 156, 1); field(target, 157, 100);
  field('ustar\0', 257, 6); field('00', 263, 2);
  field([...header].reduce((a, b) => a + b, 0).toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return Buffer.concat([header, ...(type === '0' ? [Buffer.from('ok'), Buffer.alloc(510)] : []), Buffer.alloc(1024)]);
}
const directory = await mkdtemp(join(tmpdir(), 'alpha-subgraph-toolchain-'));
let server;
try {
  await decompress(tar('safe.txt'), join(directory, 'safe'));
  assert.equal(await readFile(join(directory, 'safe', 'safe.txt'), 'utf8'), 'ok');
  for (const [name, type, target] of [['../escaped', '0', ''], ['link', '2', '../escaped'], ['link', '1', '../escaped']]) {
    await assert.rejects(() => decompress(tar(name, type, target), join(directory, 'unsafe')));
  }
  await assert.rejects(() => stat(join(directory, 'escaped')));
  server = createServer(async (request, response) => {
    let raw = ''; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw); assert.equal(body.method, 'subgraph_status');
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { healthy: true } }));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const client = createJsonRpcClient(new URL(`http://127.0.0.1:${server.address().port}/`));
  const result = await new Promise((resolve, reject) => client.request('subgraph_status', [], (error, response) => error ? reject(error) : resolve(response)));
  assert.deepEqual(result.result, { healthy: true });
  console.log('Subgraph toolchain: normal extraction, three traversal/link rejections, and graph-cli HTTP JSON-RPC compatibility passed.');
} finally {
  if (server) { server.closeAllConnections(); await new Promise(r => server.close(r)); }
  await rm(directory, { recursive: true, force: true });
}
