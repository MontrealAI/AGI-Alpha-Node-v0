import http from 'node:http';

// Keep legacy container liveness probes available without collecting telemetry.
// An empty /metrics response is a valid Prometheus exposition with no samples.
export async function startHealthServer({ port, logger }) {
  const server = http.createServer((req, res) => {
    if (req.url === '/metrics') {
      res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
      res.end();
    } else if (req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"status":"ok"}');
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      server.off('error', reject);
      resolve();
    });
  });
  logger?.info?.({ port: server.address().port }, 'Health checks listening; telemetry disabled');
  return server;
}
