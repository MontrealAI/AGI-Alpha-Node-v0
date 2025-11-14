import { readFile } from 'node:fs/promises';

export function createFileAlphaWuSource({ path }) {
  if (!path) {
    throw new Error('path is required for file alpha WU source');
  }

  async function load() {
    const contents = await readFile(path, 'utf8');
    const parsed = JSON.parse(contents);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed === null || parsed === undefined) {
      return [];
    }
    return [parsed];
  }

  return {
    type: 'file',
    async *stream() {
      const entries = await load();
      for (const entry of entries) {
        yield entry;
      }
    },
    async close() {}
  };
}
