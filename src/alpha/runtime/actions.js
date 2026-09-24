import {
  lstat,
  realpath,
  readFile,
  writeFile,
  mkdir,
  rename,
  open,
  unlink,
} from 'node:fs/promises';
import { join, resolve, relative, sep } from 'node:path';
import { z } from 'zod';
import { digest } from '../mission.js';
import { loadNode, recordRuntime } from '../node.js';

export const actionSchema = z
  .object({
    kind: z.literal('json-set'),
    root: z.string().min(1),
    file: z.string().min(1),
    pointer: z.array(z.string().min(1).max(100)).min(1).max(10),
    value: z.union([
      z.string().max(2000),
      z.number().finite(),
      z.boolean(),
      z.null(),
    ]),
    healthUrl: z.string().url(),
    healthField: z.string().min(1).max(100),
    healthValue: z.union([z.string(), z.number().finite(), z.boolean()]),
    timeoutMs: z.number().int().min(100).max(30000).default(5000),
  })
  .strict();
async function targetFor(action) {
  const root = await realpath(resolve(action.root));
  const target = resolve(root, action.file);
  const rel = relative(root, target);
  if (
    !rel ||
    rel === '..' ||
    rel.startsWith(`..${sep}`) ||
    resolve(action.file) === action.file
  )
    throw new Error(
      'Action target must be a relative file inside the authorized root',
    );
  const parts = rel.split(sep);
  let cursor = root;
  for (const part of parts) {
    cursor = join(cursor, part);
    if ((await lstat(cursor)).isSymbolicLink())
      throw new Error('Symlink action targets are forbidden');
  }
  const info = await lstat(target);
  if (!info.isFile() || info.size > 100000 || info.nlink !== 1)
    throw new Error('Action requires a small regular file without hard links');
  return { root, target, mode: info.mode & 0o777 };
}
function transform(raw, action) {
  const data = JSON.parse(raw);
  let cursor = data;
  for (const name of action.pointer)
    if (['__proto__', 'constructor', 'prototype'].includes(name))
      throw new Error('Unsafe JSON path');
  for (const name of action.pointer.slice(0, -1)) {
    if (
      !cursor ||
      typeof cursor !== 'object' ||
      Array.isArray(cursor) ||
      !Object.hasOwn(cursor, name)
    )
      throw new Error('JSON path must already exist');
    cursor = cursor[name];
  }
  const key = action.pointer.at(-1);
  if (
    !cursor ||
    typeof cursor !== 'object' ||
    Array.isArray(cursor) ||
    !Object.hasOwn(cursor, key)
  )
    throw new Error('JSON property must already exist');
  if (
    typeof cursor[key] !== typeof action.value ||
    (cursor[key] !== null && typeof cursor[key] === 'object')
  )
    throw new Error('JSON update must preserve scalar type');
  cursor[key] = action.value;
  return JSON.stringify(data, null, 2) + '\n';
}
async function replace(target, content, mode) {
  const temp = `${target}.alpha-${process.pid}.tmp`;
  const file = await open(temp, 'wx', mode);
  try {
    await file.writeFile(content);
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(temp, target);
  const directory = await open(resolve(target, '..'), 'r');
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}
export async function describeAction(input) {
  const action = actionSchema.parse(input);
  const location = await targetFor(action);
  const before = await readFile(location.target, 'utf8');
  const after = transform(before, action);
  const health = new URL(action.healthUrl);
  if (
    health.username ||
    health.password ||
    health.hash ||
    health.search ||
    (health.protocol !== 'https:' &&
      !(
        health.protocol === 'http:' &&
        ['127.0.0.1', '[::1]'].includes(health.hostname)
      ))
  )
    throw new Error(
      'Health URL must be HTTPS or explicit loopback HTTP without credentials, query or fragment',
    );
  const unchanged =
    action.pointer.reduce((value, key) => value[key], JSON.parse(before)) ===
    action.value;
  return {
    action,
    beforeHash: digest(before),
    afterHash: digest(after),
    target: location.target,
    mode: location.mode,
    unchanged,
  };
}
async function healthy(action) {
  const response = await fetch(action.healthUrl, {
    redirect: 'error',
    signal: AbortSignal.timeout(action.timeoutMs),
  });
  if (!response.ok) return false;
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > 20000) throw new Error('Health response exceeds limit');
    chunks.push(chunk);
  }
  const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  return (
    Object.hasOwn(result, action.healthField) &&
    result[action.healthField] === action.healthValue
  );
}
export async function executeAction(
  dir,
  missionId,
  descriptor,
  { maxDailyActions = 1 } = {},
) {
  if (
    !Number.isInteger(maxDailyActions) ||
    maxDailyActions < 1 ||
    maxDailyActions > 100
  )
    throw new Error('Explicit daily action cap required');
  const action = actionSchema.parse(descriptor.action);
  const lock = join(dir, 'action.lock');
  let handle;
  try {
    handle = await open(lock, 'wx', 0o600);
  } catch (e) {
    if (e.code === 'EEXIST')
      throw new Error(
        'Action busy or interrupted; recover only after stopping the previous worker',
      );
    throw e;
  }
  try {
    await handle.writeFile(String(process.pid));
    await handle.sync();
    const node = await loadNode(dir);
    const run = node.runs.get(missionId);
    if (node.paused || run?.review?.decision !== 'accepted')
      throw new Error(
        'Action requires an unpaused, independently accepted mission',
      );
    if (
      !run.mission.sources.some(
        (s) =>
          s.id === 'execution-policy' && s.text === JSON.stringify(descriptor),
      )
    )
      throw new Error('Action descriptor was not included in reviewed mission');
    const id = `action:${run.hash}`;
    const previous = node.runtime.get(`${id}:result`);
    if (previous) return previous.data;
    const location = await targetFor(action);
    if (location.target !== descriptor.target)
      throw new Error('Action target changed');
    const backupDir = join(dir, 'action-backups');
    await mkdir(backupDir, { recursive: true, mode: 0o700 });
    const backup = join(backupDir, `${run.hash}.json`);
    let before;
    const current = await readFile(location.target, 'utf8');
    const prepared = node.runtime.get(`${id}:prepared`);
    if (!prepared) {
      if (
        digest(current) !== descriptor.beforeHash ||
        digest(transform(current, action)) !== descriptor.afterHash
      )
        throw new Error(
          'Action precondition changed; obtain a new reviewed plan',
        );
      before = current;
      try {
        const saved = await open(backup, 'wx', 0o600);
        try {
          await saved.writeFile(before);
          await saved.sync();
        } finally {
          await saved.close();
        }
        const folder = await open(backupDir, 'r');
        try {
          await folder.sync();
        } finally {
          await folder.close();
        }
      } catch (e) {
        if (
          e.code !== 'EEXIST' ||
          digest(await readFile(backup, 'utf8')) !== descriptor.beforeHash
        )
          throw e;
      }
      await recordRuntime(
        dir,
        'action-prepared',
        `${id}:prepared`,
        { missionId, descriptor },
        (n) => {
          if (n.paused) throw new Error('Node paused');
          const day = new Date().toISOString().slice(0, 10);
          if (
            [...n.runtime.values()].filter(
              (e) => e.topic === 'action-prepared' && e.at.slice(0, 10) >= day,
            ).length >= maxDailyActions
          )
            throw new Error('Daily action budget exhausted');
        },
      );
    } else {
      if (digest(prepared.data.descriptor) !== digest(descriptor))
        throw new Error('Prepared action mismatch');
      before = await readFile(backup, 'utf8');
      if (digest(before) !== descriptor.beforeHash)
        throw new Error('Action backup integrity failure');
      if (
        ![descriptor.beforeHash, descriptor.afterHash].includes(digest(current))
      )
        throw new Error('External edit detected; refusing to overwrite');
    }
    let changed = false;
    try {
      if ((await loadNode(dir)).paused)
        throw new Error('Node paused before action');
      if (digest(current) === descriptor.beforeHash) {
        if (
          digest(await readFile(location.target, 'utf8')) !==
          descriptor.beforeHash
        )
          throw new Error('Action target changed before commit');
        await replace(
          location.target,
          transform(before, action),
          descriptor.mode,
        );
        changed = true;
      }
      if (!(await healthy(action)))
        throw new Error('Health check rejected action');
      if ((await loadNode(dir)).paused)
        throw new Error('Node paused during action');
      const result = {
        missionId,
        status: 'applied',
        beforeHash: descriptor.beforeHash,
        afterHash: descriptor.afterHash,
        recovered: !!prepared,
      };
      await recordRuntime(dir, 'action-result', `${id}:result`, result);
      return result;
    } catch (e) {
      const now = await readFile(location.target, 'utf8');
      if (digest(now) === descriptor.afterHash)
        await replace(location.target, before, descriptor.mode);
      else if (digest(now) !== descriptor.beforeHash)
        throw new Error(
          'Action failed and external edit prevents safe rollback; operator recovery required',
        );
      const result = {
        missionId,
        status: 'rolled-back',
        beforeHash: descriptor.beforeHash,
        attemptedAfterHash: descriptor.afterHash,
        reason: e.message,
        changed,
      };
      await recordRuntime(dir, 'action-result', `${id}:result`, result);
      return result;
    }
  } finally {
    await handle.close();
    await unlink(lock);
  }
}
