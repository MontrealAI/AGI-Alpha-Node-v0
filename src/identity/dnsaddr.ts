const DNSADDR_PREFIX = 'dnsaddr=';

function sanitizeRecord(record: string): string[] {
  const trimmed = record.trim();
  if (!trimmed) {
    return [];
  }

  const unquoted = trimmed.replace(/^['\"]+|['\"]+$/g, '');
  return unquoted
    .split(/\s+/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function normalizeMultiaddr(value: string): string | null {
  if (!value.toLowerCase().startsWith(DNSADDR_PREFIX)) {
    return null;
  }

  const multiaddr = value.slice(DNSADDR_PREFIX.length).trim();
  if (!multiaddr) {
    return null;
  }

  return multiaddr;
}

export function parseDnsaddr(records: readonly string[]): string[] {
  const discovered = new Set<string>();

  for (const candidate of records) {
    if (!candidate || typeof candidate !== 'string') {
      continue;
    }

    const fragments = sanitizeRecord(candidate);
    for (const fragment of fragments) {
      const normalized = normalizeMultiaddr(fragment);
      if (normalized) {
        discovered.add(normalized);
      }
    }
  }

  return [...discovered];
}
