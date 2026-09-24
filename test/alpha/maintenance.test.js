import { it, expect } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Wallet } from 'ethers';
import {
  initializeNode,
  runMission,
  pauseNode,
  loadNode,
} from '../../src/alpha/node.js';
import {
  backupNode,
  restoreNode,
  serviceConfiguration,
} from '../../src/alpha/runtime/maintenance.js';
it('encrypts a paused node, restores its exact signed ledger and rejects tampered backup or wrong passwords', async () => {
  const root = await mkdtemp(join(tmpdir(), 'alpha-backup-'));
  const dir = join(root, 'node'),
    backup = join(root, 'backup.json'),
    restored = join(root, 'restored');
  try {
    await initializeNode(dir, {
      ensName: 'backup.alpha.node.agi.eth',
      reviewer: Wallet.createRandom().address,
    });
    const fixture = JSON.parse(
      await readFile('examples/alpha/opportunity-scan.json'),
    );
    await runMission(dir, fixture);
    await expect(
      backupNode(dir, backup, 'correct horse battery staple'),
    ).rejects.toThrow('Pause');
    await pauseNode(dir, true);
    const original = await loadNode(dir);
    await backupNode(dir, backup, 'correct horse battery staple');
    const raw = await readFile(backup, 'utf8');
    expect(raw).not.toContain('privateKey');
    await expect(
      restoreNode(backup, restored, 'different correct password'),
    ).rejects.toThrow();
    await restoreNode(backup, restored, 'correct horse battery staple');
    const recovered = await loadNode(restored);
    expect(recovered.head).toBe(original.head);
    expect(recovered.paused).toBe(true);
    expect(await readFile(join(restored, 'identity.key.json'), 'utf8')).toBe(
      await readFile(join(dir, 'identity.key.json'), 'utf8'),
    );
    await expect(
      restoreNode(backup, restored, 'correct horse battery staple'),
    ).rejects.toThrow();
    const modified = JSON.parse(raw);
    modified.tag = '00'.repeat(16);
    await writeFile(backup, JSON.stringify(modified));
    await expect(
      restoreNode(backup, join(root, 'bad'), 'correct horse battery staple'),
    ).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it('renders non-shell service arguments and escapes platform-specific metacharacters', () => {
  const args = {
    nodePath: '/opt/node',
    cliPath: '/path/with space/alpha.js',
    home: '/private/A&B%node',
  };
  const mac = serviceConfiguration('macos', args);
  expect(mac).toContain('A&amp;B%node');
  expect(mac).toContain('<string>--runtime</string>');
  const linux = serviceConfiguration('linux', args);
  expect(linux).toContain('A&B%%node');
  expect(linux).toContain('"/path/with space/alpha.js"');
  expect(() =>
    serviceConfiguration('linux', { ...args, home: '/path\nExecStart=bad' }),
  ).toThrow('control');
});
