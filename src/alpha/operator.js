import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { outcomeSummary, loadNode, pauseNode, importDetachedReview } from './node.js';
import { operate } from './runtime/engine.js';
import { cycle, operationStatus } from './operations.js';

export async function operatorServer(dir, { port = 0 } = {}) {
  const token = randomBytes(32).toString('hex');
  let busy = false;
  const server = createServer(async (req, res) => {
    const origin = `http://127.0.0.1:${server.address().port}`;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    try {
      if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) return send(403, { error: 'Invalid host or origin' });
      const path = new URL(req.url, origin).pathname;
      const assets = { '/': ['operator.html', 'text/html'], '/operator.js': ['operator-ui.js', 'text/javascript'], '/operator.css': ['operator.css', 'text/css'] };
      if (req.method === 'GET' && assets[path]) {
        res.writeHead(200, { 'Content-Type': assets[path][1] });
        return res.end(await readFile(new URL(`./web/${assets[path][0]}`, import.meta.url)));
      }
      const supplied = Buffer.from(req.headers.authorization ?? ''); const expected = Buffer.from(`Bearer ${token}`);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return send(401, { error: 'Operator token required' });
      if (req.method === 'GET' && path === '/api/status') {
        const n = await loadNode(dir);
        return send(200, { mode: n.config.mode, ens: n.config.ensName, address: n.config.address, reviewer: n.config.reviewer,
          paused: n.paused, busy, head: n.head, ledgerVerified: true, operations: operationStatus(n), outcomes: outcomeSummary(n), runtime: [...n.runtime.values()].slice(-100).reverse().map(e => ({ id: e.id, topic: e.topic, at: e.at, status: e.data.status ?? e.data.plan?.status ?? 'recorded', transactionHash: e.data.transactionHash ?? e.data.hash ?? null, purpose: e.data.purpose ?? null })),
          missions: [...n.runs.values()].reverse().map(r => ({ id: r.mission.id, title: r.mission.title, decision: r.review?.decision ?? 'awaiting-review', recommendation: r.analysis.recommendation, hash: r.hash, report: r.report, reward: r.reward })) });
      }
      if (req.method === 'GET' && path === '/api/evidence') {
        const n = await loadNode(dir); const run = n.runs.get(new URL(req.url, origin).searchParams.get('id'));
        if (!run) return send(404, { error: 'Unknown mission' });
        return send(200, { schema: 2, ledgerHead: n.head, identity: { ensName: n.config.ensName, address: n.config.address, reviewer: n.config.reviewer }, run });
      }
      if (req.method !== 'POST') return send(404, { error: 'Unknown endpoint' });
      if (req.headers['content-type'] !== 'application/json') return send(415, { error: 'JSON required' });
      let raw = ''; let bytes = 0;
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 12000) { send(413, { error: 'Body too large' }); return; } raw += chunk; }
      const body = JSON.parse(raw || '{}');
      if (path === '/api/pause') return send(200, await pauseNode(dir, true));
      if (path === '/api/resume') return send(200, await pauseNode(dir, false));
      if (path === '/api/review') return send(200, await importDetachedReview(dir, body));
      if (path === '/api/cycle' || path === '/api/operate') {
        if (busy) return send(409, { error: 'Cycle already running' });
        busy = true; try { return send(200, path === '/api/operate' ? await operate(dir, { rpcUrls: [process.env.ALPHA_RPC_URL, process.env.ALPHA_SECOND_RPC_URL] }) : await cycle(dir)); } finally { busy = false; }
      }
      return send(404, { error: 'Unknown endpoint' });
    } catch (e) { return send(400, { error: e.message }); }
  });
  server.requestTimeout = 10000; server.headersTimeout = 10000; server.maxConnections = 32;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { server, token, url: `http://127.0.0.1:${server.address().port}/#${token}` };
}
