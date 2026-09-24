import { it, expect } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { Wallet } from 'ethers';
const execute = promisify(execFile);
it('operates through the real CLI and stops the HTTP service cleanly on SIGTERM', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'alpha-cli-')); let server;
  const cli = (...args) => execute(process.execPath, ['src/alpha/cli.js', '--home', dir, ...args]);
  try {
    expect((await cli('--version')).stdout.trim()).toBe('2.1.0');
    await cli('init', '--ens', 'cli.alpha.node.agi.eth', '--reviewer', Wallet.createRandom().address);
    await writeFile(join(dir, 'pipeline.json'), await readFile('examples/alpha/pipeline.json'));
    await writeFile(join(dir, 'usage.json'), JSON.stringify({ schema: 1, observedAt: new Date().toISOString(), period: 'Synthetic CLI test', services: [{ id: 'model', name: 'Fixture', requests: 10, repeatedRequests: 8, costUsd: 500 }] }));
    expect(JSON.parse((await cli('cycle')).stdout).status).toBe('awaiting-review');
    expect(JSON.parse((await cli('status')).stdout).missions).toHaveLength(1);
    server = spawn(process.execPath, ['src/alpha/cli.js', '--home', dir, 'serve'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const url = await new Promise((resolve, reject) => {
      let output = ''; server.on('error', reject); server.once('exit', code => reject(new Error(`Early server exit ${code}`)));
      server.stdout.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/#\w+/); if (match) resolve(match[0]); });
    });
    const parsed = new URL(url); const status = await fetch(`${parsed.origin}/api/status`, { headers: { Authorization: `Bearer ${parsed.hash.slice(1)}` } });
    expect((await status.json()).ledgerVerified).toBe(true);
    const exited = once(server, 'exit'); server.kill('SIGTERM'); expect((await exited)[0]).toBe(0); server = null;
    await cli('pause'); await expect(cli('cycle')).rejects.toThrow('paused');
  } finally { if (server) { const exited = once(server, 'exit'); server.kill('SIGKILL'); await exited; } await rm(dir, { recursive: true, force: true }); }
}, 15000);
