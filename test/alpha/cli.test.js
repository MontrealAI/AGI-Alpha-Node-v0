import { it, expect } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { Wallet } from 'ethers';
const execute = promisify(execFile);
it('sets up structured work and verifies exported JSON and CSV through the real CLI', async () => {
  const root = await mkdtemp(join(tmpdir(), 'alpha-work-cli-')),
    dir = join(root, 'node');
  const cli = (...args) =>
    execute(process.execPath, ['src/alpha/cli.js', '--home', dir, ...args]);
  try {
    const source = JSON.parse(
      await readFile('examples/alpha/work-invoices.json'),
    );
    source.observedAt = new Date().toISOString();
    await writeFile(join(root, 'source.json'), JSON.stringify(source));
    await cli(
      'setup',
      '--ens',
      'workcli.alpha.node.agi.eth',
      '--reviewer',
      Wallet.createRandom().address,
      '--work',
      join(root, 'source.json'),
    );
    const run = JSON.parse((await cli('operate')).stdout),
      id = run.discovery.missionId;
    const exported = JSON.parse(
      (await cli('export', id, '--out', join(root, 'out'))).stdout,
    );
    expect(
      JSON.parse(
        (
          await cli(
            'verify-work',
            join(root, 'source.json'),
            exported.workResult,
          )
        ).stdout,
      ).verified,
    ).toBe(true);
    expect(
      JSON.parse(
        (
          await cli(
            'verify-bundle',
            exported.evidence,
            '--work-dir',
            join(root, 'out'),
          )
        ).stdout,
      ).work.verified,
    ).toBe(true);
    await writeFile(exported.workResult, '{}');
    await expect(
      cli('verify-work', join(root, 'source.json'), exported.workResult),
    ).rejects.toThrow('recomputation');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 15000);
it('operates through the real CLI and stops the HTTP service cleanly on SIGTERM', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'alpha-cli-'));
  let server;
  const cli = (...args) =>
    execute(process.execPath, ['src/alpha/cli.js', '--home', dir, ...args]);
  try {
    expect((await cli('--version')).stdout.trim()).toBe('3.2.0');
    await cli(
      'init',
      '--ens',
      'cli.alpha.node.agi.eth',
      '--reviewer',
      Wallet.createRandom().address,
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
        period: 'Synthetic CLI test',
        services: [
          {
            id: 'model',
            name: 'Fixture',
            requests: 10,
            repeatedRequests: 8,
            costUsd: 500,
          },
        ],
      }),
    );
    expect(JSON.parse((await cli('cycle')).stdout).status).toBe(
      'awaiting-review',
    );
    expect(JSON.parse((await cli('status')).stdout).missions).toHaveLength(1);
    server = spawn(
      process.execPath,
      ['src/alpha/cli.js', '--home', dir, 'serve'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const url = await new Promise((resolve, reject) => {
      let output = '';
      server.on('error', reject);
      server.once('exit', (code) =>
        reject(new Error(`Early server exit ${code}`)),
      );
      server.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/#\w+/);
        if (match) resolve(match[0]);
      });
    });
    const parsed = new URL(url);
    const status = await fetch(`${parsed.origin}/api/status`, {
      headers: { Authorization: `Bearer ${parsed.hash.slice(1)}` },
    });
    expect((await status.json()).ledgerVerified).toBe(true);
    const exited = once(server, 'exit');
    server.kill('SIGTERM');
    expect((await exited)[0]).toBe(0);
    server = null;
    await cli('pause');
    await expect(cli('cycle')).rejects.toThrow('paused');
  } finally {
    if (server) {
      const exited = once(server, 'exit');
      server.kill('SIGKILL');
      await exited;
    }
    await rm(dir, { recursive: true, force: true });
  }
}, 15000);
it('sets up the runtime from validated observations and restores an encrypted CLI backup paused', async () => {
  const root = await mkdtemp(join(tmpdir(), 'alpha-setup-'));
  const dir = join(root, 'node'),
    restored = join(root, 'restored'),
    usage = join(root, 'usage.json'),
    backup = join(root, 'backup.json');
  const env = {
    ...process.env,
    ALPHA_BACKUP_PASSWORD: 'fixture recovery password with entropy',
  };
  const cli = (home, ...args) =>
    execute(process.execPath, ['src/alpha/cli.js', '--home', home, ...args], {
      env,
    });
  try {
    const reviewer = Wallet.createRandom().address;
    await writeFile(usage, '{}');
    await expect(
      cli(
        dir,
        'setup',
        '--ens',
        'setup.alpha.node.agi.eth',
        '--reviewer',
        reviewer,
        '--usage',
        usage,
      ),
    ).rejects.toThrow();
    await expect(readFile(join(dir, 'identity.key.json'))).rejects.toThrow();
    await writeFile(
      usage,
      JSON.stringify({
        schema: 1,
        observedAt: new Date().toISOString(),
        period: 'Synthetic setup check',
        services: [
          {
            id: 'model',
            name: 'Fixture',
            requests: 100,
            repeatedRequests: 80,
            costUsd: 500,
          },
        ],
      }),
    );
    expect(
      JSON.parse(
        (
          await cli(
            dir,
            'setup',
            '--ens',
            'setup.alpha.node.agi.eth',
            '--reviewer',
            reviewer,
            '--usage',
            usage,
          )
        ).stdout,
      ).transactionsEnabled,
    ).toBe(false);
    expect(
      JSON.parse((await cli(dir, 'operate')).stdout).discovery.status,
    ).toBe('awaiting-review');
    await cli(
      dir,
      'service-config',
      'macos',
      '--out',
      join(root, 'service.plist'),
    );
    expect(await readFile(join(root, 'service.plist'), 'utf8')).toContain(
      '<string>--runtime</string>',
    );
    await cli(dir, 'pause');
    const original = JSON.parse((await cli(dir, 'status')).stdout);
    await cli(dir, 'backup', backup);
    await cli(restored, 'restore', backup);
    const recovered = JSON.parse((await cli(restored, 'status')).stdout);
    expect(recovered.head).toBe(original.head);
    expect(recovered.paused).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 15000);
