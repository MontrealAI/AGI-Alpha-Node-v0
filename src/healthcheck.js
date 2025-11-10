import http from 'node:http';

const port = Number.parseInt(process.env.METRICS_PORT ?? process.env.PORT ?? '9464', 10);
const timeoutMs = Number.parseInt(process.env.HEALTHCHECK_TIMEOUT ?? '5000', 10);

const request = http.request(
  {
    host: '127.0.0.1',
    port,
    path: '/metrics',
    method: 'GET',
    timeout: timeoutMs
  },
  (res) => {
    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
      res.resume();
      process.exit(0);
      return;
    }
    res.resume();
    process.exit(1);
  }
);

request.on('timeout', () => {
  request.destroy();
  process.exit(1);
});

request.on('error', () => {
  process.exit(1);
});

request.end();
