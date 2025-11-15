import pino, { type Logger } from 'pino';
import { getEnsClient, type EnsClient, EnsResolutionError } from '../ens/client.js';
import { parseDnsaddr } from './dnsaddr.js';
import type { NodeIdentity } from './types.js';

export class NodeIdentityError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'NodeIdentityError';
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

export interface LoadNodeIdentityOptions {
  readonly client?: EnsClient;
  readonly metadataKeys?: readonly string[];
  readonly logger?: Logger;
}

const DEFAULT_METADATA_KEYS = [
  'node.peerId',
  'node.peerid',
  'peerId',
  'node.role',
  'node.version',
  'node.status',
  'node.dnsaddr'
];

function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new NodeIdentityError('ENS name must be a non-empty string');
  }
  return trimmed.toLowerCase();
}

async function loadMetadata(
  client: EnsClient,
  ensName: string,
  metadataKeys: readonly string[]
): Promise<Record<string, string>> {
  const records: Record<string, string> = {};

  for (const key of metadataKeys) {
    try {
      const value = await client.getTextRecord(ensName, key);
      if (typeof value === 'string' && value.trim()) {
        records[key] = value.trim();
      }
    } catch (error) {
      if (error instanceof EnsResolutionError) {
        throw error;
      }
    }
  }

  return records;
}

function derivePeerId(metadata: Record<string, string>, ensName: string): string {
  const peerId = metadata['node.peerId'] ?? metadata['node.peerid'] ?? metadata['peerId'];
  if (!peerId) {
    throw new NodeIdentityError(`ENS name ${ensName} is missing required node.peerId text record`);
  }
  return peerId;
}

async function loadDnsaddrRecords(client: EnsClient, ensName: string, metadata: Record<string, string>): Promise<string[]> {
  const records: string[] = [];

  if (metadata['node.dnsaddr']) {
    records.push(metadata['node.dnsaddr']);
  }

  const dnsSubdomain = `_dnsaddr.${ensName}`;
  try {
    const resolver = await client.getResolver(dnsSubdomain);
    if (resolver) {
      const value = await client.getTextRecord(dnsSubdomain, 'dnsaddr');
      if (typeof value === 'string' && value.trim()) {
        records.push(...value.split(/\r?\n/u).filter((entry) => entry.trim().length > 0));
      }
    }
  } catch (error) {
    if (error instanceof EnsResolutionError) {
      throw error;
    }
  }

  return parseDnsaddr(records);
}

function normalizeCoordinate(value: string, label: string, ensName: string): string {
  if (typeof value !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new NodeIdentityError(`ENS name ${ensName} has invalid ${label} coordinate`);
  }
  return `0x${value.slice(2).toLowerCase()}`;
}

function normalizePubkey(pubkey: { x: string; y: string } | null, ensName: string) {
  if (!pubkey) {
    throw new NodeIdentityError(`ENS name ${ensName} is missing the required pubkey record`);
  }
  return {
    x: normalizeCoordinate(pubkey.x, 'x', ensName),
    y: normalizeCoordinate(pubkey.y, 'y', ensName)
  };
}

function parseExpiry(expiry: bigint | number): number | undefined {
  const numeric = Number(expiry);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return undefined;
  }
  if (!Number.isSafeInteger(numeric)) {
    return Math.trunc(numeric);
  }
  return numeric;
}

export async function loadNodeIdentity(
  ensName: string,
  options: LoadNodeIdentityOptions = {}
): Promise<NodeIdentity> {
  const logger = options.logger ?? pino({ level: 'info', name: 'identity-loader' });
  const normalizedName = normalizeName(ensName);
  const client = options.client ?? getEnsClient();
  const metadataKeys = options.metadataKeys ?? DEFAULT_METADATA_KEYS;

  logger.debug?.({ ensName: normalizedName }, 'Resolving node identity');

  const resolverAddress = await client.getResolver(normalizedName);
  if (!resolverAddress) {
    throw new NodeIdentityError(`Resolver not configured for ${normalizedName}`);
  }

  const pubkeyRecord = await client.getPubkey(normalizedName);
  const pubkey = normalizePubkey(pubkeyRecord, normalizedName);

  const metadata = await loadMetadata(client, normalizedName, metadataKeys);
  const peerId = derivePeerId(metadata, normalizedName);
  const multiaddrs = await loadDnsaddrRecords(client, normalizedName, metadata);

  const wrapper = await client.getNameWrapperData(normalizedName);
  const identity: NodeIdentity = {
    ensName: normalizedName,
    peerId,
    pubkey,
    multiaddrs,
    metadata
  };

  if (wrapper) {
    identity.fuses = wrapper.fuses;
    const expiry = parseExpiry(wrapper.expiry);
    if (expiry !== undefined) {
      identity.expiry = expiry;
    }
  }

  return identity;
}
