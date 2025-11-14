export function createHttpAlphaWuSource({ url, fetchImpl = globalThis.fetch }) {
  if (!url) {
    throw new Error('url is required for http alpha WU source');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch implementation must be provided for http alpha WU source');
  }

  async function requestEntries() {
    const response = await fetchImpl(url, { headers: { accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(`Failed to load α-WUs from ${url}: ${response.status}`);
    }
    const parsed = await response.json();
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed === null || parsed === undefined) {
      return [];
    }
    return [parsed];
  }

  return {
    type: 'http',
    async *stream() {
      const entries = await requestEntries();
      for (const entry of entries) {
        yield entry;
      }
    },
    async close() {}
  };
}
