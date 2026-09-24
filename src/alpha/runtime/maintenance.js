import {
  readdir,
  readFile,
  writeFile,
  mkdir,
  lstat,
  rm,
  open,
} from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import {
  randomBytes,
  scrypt as derive,
  createCipheriv,
  createDecipheriv,
  createHash,
} from 'node:crypto';
import { promisify } from 'node:util';
import { loadNode, locked, readJson } from '../node.js';
const scrypt = promisify(derive);
const MAX = 64 * 1024 * 1024;
async function syncDirectory(path) {
  const handle = await open(path, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');
const locks = new Set([
  'writer.lock',
  'pipeline.lock',
  'engine.lock',
  'action.lock',
  'transaction.lock',
]);
function password(value) {
  if (typeof value !== 'string' || value.length < 16)
    throw new Error('Set ALPHA_BACKUP_PASSWORD to at least 16 characters');
  return value;
}
async function key(value, salt) {
  return scrypt(password(value), salt, 32, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 128 * 1024 * 1024,
  });
}
export async function backupNode(dir, output, secret) {
  const destination = resolve(output);
  if (
    destination === resolve(dir) ||
    destination.startsWith(resolve(dir) + sep)
  )
    throw new Error('Backup output must be outside node directory');
  return locked(dir, async () => {
    const node = await loadNode(dir);
    if (!node.paused) throw new Error('Pause and stop workers before backup');
    const files = [];
    let bytes = 0;
    async function walk(folder, prefix = '') {
      for (const entry of (await readdir(folder, { withFileTypes: true })).sort(
        (a, b) => a.name.localeCompare(b.name),
      )) {
        if (!prefix && locks.has(entry.name)) {
          if (entry.name !== 'writer.lock')
            throw new Error(
              'Stop workers and resolve stale locks before backup',
            );
          continue;
        }
        const name = prefix ? `${prefix}/${entry.name}` : entry.name;
        const full = join(folder, entry.name);
        const info = await lstat(full);
        if (info.isSymbolicLink()) throw new Error('Backups reject symlinks');
        if (info.isDirectory()) await walk(full, name);
        else if (info.isFile()) {
          bytes += info.size;
          if (bytes > MAX || files.length >= 4096)
            throw new Error(
              'Backup capacity exceeded; archive deliverables separately',
            );
          const data = await readFile(full);
          files.push({
            path: name,
            sha256: sha(data),
            content: data.toString('base64'),
          });
        } else throw new Error('Unsupported node file type');
      }
    }
    await walk(dir);
    const salt = randomBytes(32),
      iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', await key(secret, salt), iv);
    const ciphertext = Buffer.concat([
      cipher.update(
        JSON.stringify({
          schema: 1,
          address: node.config.address,
          head: node.head,
          files,
        }),
      ),
      cipher.final(),
    ]);
    const envelope = {
      schema: 1,
      algorithm: 'aes-256-gcm+scrypt-32768-8-1',
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      tag: cipher.getAuthTag().toString('hex'),
      ciphertext: ciphertext.toString('base64'),
    };
    const handle = await open(destination, 'wx', 0o600);
    try {
      await handle.writeFile(JSON.stringify(envelope));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await syncDirectory(resolve(destination, '..'));
    return {
      backup: destination,
      files: files.length,
      bytes,
      ledgerHead: node.head,
      encrypted: true,
    };
  });
}
export async function restoreNode(file, destination, secret) {
  const envelope = await readJson(file, 160 * 1024 * 1024);
  if (
    envelope.schema !== 1 ||
    envelope.algorithm !== 'aes-256-gcm+scrypt-32768-8-1' ||
    !/^[a-f0-9]{64}$/.test(envelope.salt) ||
    !/^[a-f0-9]{24}$/.test(envelope.iv) ||
    !/^[a-f0-9]{32}$/.test(envelope.tag)
  )
    throw new Error('Unsupported backup format');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    await key(secret, Buffer.from(envelope.salt, 'hex')),
    Buffer.from(envelope.iv, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]);
  const snapshot = JSON.parse(plain.toString('utf8'));
  if (
    snapshot.schema !== 1 ||
    !Array.isArray(snapshot.files) ||
    snapshot.files.length > 4096
  )
    throw new Error('Invalid backup manifest');
  const names = new Set();
  let bytes = 0;
  for (const f of snapshot.files) {
    if (
      typeof f.path !== 'string' ||
      f.path.includes('\\') ||
      f.path.split('/').some((s) => !s || s === '.' || s === '..') ||
      f.path.startsWith('/') ||
      names.has(f.path) ||
      locks.has(f.path)
    )
      throw new Error('Unsafe backup path');
    names.add(f.path);
    const data = Buffer.from(f.content, 'base64');
    bytes += data.length;
    if (bytes > MAX || sha(data) !== f.sha256)
      throw new Error('Backup integrity or capacity failure');
  }
  const dir = resolve(destination);
  await mkdir(dir, { mode: 0o700 });
  try {
    // A process interruption must never leave a restored signer active.
    const paused = await open(join(dir, 'PAUSED'), 'wx', 0o600);
    try {
      await paused.writeFile(new Date().toISOString());
      await paused.sync();
    } finally {
      await paused.close();
    }
    await syncDirectory(dir);
    const directories = new Set([dir]);
    for (const f of snapshot.files) {
      if (f.path === 'PAUSED') continue;
      const target = join(dir, f.path);
      await mkdir(resolve(target, '..'), { recursive: true, mode: 0o700 });
      let parent = resolve(target, '..');
      while (parent.startsWith(dir + sep)) {
        directories.add(parent);
        parent = resolve(parent, '..');
      }
      const restored = await open(target, 'wx', 0o600);
      try {
        await restored.writeFile(Buffer.from(f.content, 'base64'));
        await restored.sync();
      } finally {
        await restored.close();
      }
    }
    const node = await loadNode(dir);
    if (node.head !== snapshot.head || node.config.address !== snapshot.address)
      throw new Error('Restored ledger does not match backup manifest');
    for (const folder of [...directories].sort((a, b) => b.length - a.length))
      await syncDirectory(folder);
    await syncDirectory(resolve(dir, '..'));
    return {
      restored: dir,
      files: snapshot.files.length,
      ledgerHead: node.head,
      paused: true,
    };
  } catch (e) {
    await rm(dir, { recursive: true, force: true });
    throw e;
  }
}
export function serviceConfiguration(platform, { nodePath, cliPath, home }) {
  for (const p of [nodePath, cliPath, home])
    if (!p.startsWith('/') || /[\r\n\0]/.test(p))
      throw new Error(
        'Service paths must be absolute without control characters',
      );
  if (platform === 'macos') {
    const xml = (s) =>
      s
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>org.agialpha.node</string><key>ProgramArguments</key><array>${[nodePath, cliPath, '--home', home, 'autopilot', '--runtime', '--interval', '60'].map((s) => `<string>${xml(s)}</string>`).join('')}</array><key>RunAtLoad</key><true/><key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict><key>ThrottleInterval</key><integer>30</integer><key>Umask</key><integer>63</integer><key>StandardOutPath</key><string>${xml(join(home, 'service-output.log'))}</string><key>StandardErrorPath</key><string>${xml(join(home, 'service-error.log'))}</string></dict></plist>\n`;
  }
  if (platform === 'linux') {
    const unit = (s) =>
      '"' +
      s.replaceAll('%', '%%').replaceAll('\\', '\\\\').replaceAll('"', '\\"') +
      '"';
    return `[Unit]\nDescription=$AGIALPHA owner-controlled node\nAfter=network-online.target\n\n[Service]\nType=simple\nExecStart=${[nodePath, cliPath, '--home', home, 'autopilot', '--runtime', '--interval', '60'].map(unit).join(' ')}\nUMask=0077\nRestart=on-failure\nRestartSec=30\nNoNewPrivileges=true\nPrivateTmp=true\n\n[Install]\nWantedBy=default.target\n`;
  }
  throw new Error('Supported platforms: linux, macos');
}
