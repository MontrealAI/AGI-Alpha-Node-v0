#!/usr/bin/env tsx
import 'dotenv/config';
import chalk from 'chalk';
import { Command } from 'commander';
import { pathToFileURL } from 'node:url';
import { format } from 'node:util';
import { loadEnsConfig, type EnsConfigOverrides } from '../src/ens/config.js';
import { EnsResolutionError, getEnsClient as createEnsClient } from '../src/ens/client.js';

const KEY_TEXT_RECORDS = ['node.role', 'node.version', 'node.dnsaddr'];

const NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT'
]);

export class EnsNetworkError extends Error {
  readonly rpcUrl: string;
  readonly code: string | null;

  constructor({ rpcUrl, code, cause }: { rpcUrl: string; code: string | null; cause?: unknown }) {
    super(code ? `Network error: ${code}` : 'Network error');
    this.name = 'EnsNetworkError';
    this.rpcUrl = rpcUrl;
    this.code = code;
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

export interface InspectOptions {
  readonly json?: boolean;
  readonly chainId?: string;
  readonly rpcUrl?: string;
  readonly ensRegistry?: string;
  readonly nameWrapper?: string;
  readonly publicResolver?: string;
}

export function extractNetworkErrorCode(error: unknown): string | null {
  if (!error) {
    return null;
  }

  const inspectSingle = (candidate: unknown): string | null => {
    if (!candidate || typeof candidate !== 'object') {
      return null;
    }

    const code = (candidate as { code?: unknown }).code;
    if (typeof code === 'string' && NETWORK_ERROR_CODES.has(code.toUpperCase())) {
      return code.toUpperCase();
    }

    const errno = (candidate as { errno?: unknown }).errno;
    if (typeof errno === 'string' && NETWORK_ERROR_CODES.has(errno.toUpperCase())) {
      return errno.toUpperCase();
    }

    return null;
  };

  const directCode = inspectSingle(error);
  if (directCode) {
    return directCode;
  }

  if (error instanceof AggregateError) {
    for (const inner of error.errors) {
      const code = extractNetworkErrorCode(inner);
      if (code) {
        return code;
      }
    }
  }

  return null;
}

function parseOverrides(options: InspectOptions): EnsConfigOverrides {
  const overrides: EnsConfigOverrides = {};

  if (options.chainId) {
    overrides.chainId = options.chainId;
  }
  if (options.rpcUrl) {
    overrides.rpcUrl = options.rpcUrl;
  }
  if (options.ensRegistry) {
    overrides.ensRegistry = options.ensRegistry;
  }
  if (options.nameWrapper !== undefined) {
    overrides.nameWrapper = options.nameWrapper;
  }
  if (options.publicResolver !== undefined) {
    overrides.publicResolver = options.publicResolver;
  }

  return overrides;
}

export interface InspectResult {
  readonly name: string;
  readonly network: {
    readonly chainId: number;
    readonly rpcUrl: string;
    readonly ensRegistry: string;
    readonly nameWrapper: string | null;
    readonly publicResolver: string | null;
  };
  readonly resolver: string;
  readonly pubkey: Awaited<ReturnType<ReturnType<typeof createEnsClient>['getPubkey']>>;
  readonly contenthash: string | null;
  readonly textRecords: Record<string, string | null>;
  readonly nameWrapper: (Awaited<ReturnType<ReturnType<typeof createEnsClient>['getNameWrapperData']>> & {
    readonly expiryISO: string;
  }) | null;
}

export async function inspectEnsName(name: string, options: InspectOptions): Promise<InspectResult> {
  const overrides = parseOverrides(options);
  const config = loadEnsConfig({ overrides });
  const client = createEnsClient({ overrides });

  try {
    const resolverAddress = await client.getResolver(name);
    if (!resolverAddress) {
      throw new EnsResolutionError(`Resolver not configured for ${name}`);
    }

    const pubkey = await client.getPubkey(name);
    const contenthash = await client.getContenthash(name);
    const textRecords: Record<string, string | null> = {};

    for (const key of KEY_TEXT_RECORDS) {
      textRecords[key] = await client.getTextRecord(name, key);
    }

    const wrapper = await client.getNameWrapperData(name);

    const output: InspectResult = {
      name,
      network: {
        chainId: config.chainId,
        rpcUrl: config.rpcUrl,
        ensRegistry: config.ensRegistry,
        nameWrapper: config.nameWrapper,
        publicResolver: config.publicResolver ?? null
      },
      resolver: resolverAddress,
      pubkey,
      contenthash,
      textRecords,
      nameWrapper: wrapper
        ? {
            ...wrapper,
            expiryISO: new Date(Number(wrapper.expiry) * 1000).toISOString()
          }
        : null
    };

    return output;
  } catch (error) {
    const networkCode = extractNetworkErrorCode(error);
    if (networkCode || error instanceof AggregateError) {
      throw new EnsNetworkError({ rpcUrl: config.rpcUrl, code: networkCode, cause: error });
    }
    throw error;
  }
}

function printHumanReadable(data: InspectResult): void {
  const lines: string[] = [];
  lines.push(chalk.bold.cyan(`ENS Inspection → ${data.name}`));
  lines.push('');
  lines.push(chalk.bold('Network'));
  lines.push(`  Chain ID      : ${data.network.chainId}`);
  lines.push(`  RPC URL       : ${data.network.rpcUrl}`);
  lines.push(`  ENS Registry  : ${data.network.ensRegistry}`);
  lines.push(`  NameWrapper   : ${data.network.nameWrapper ?? chalk.dim('not configured')}`);
  lines.push(`  PublicResolver: ${data.network.publicResolver ?? chalk.dim('not configured')}`);
  lines.push('');
  lines.push(chalk.bold('Resolver'));
  lines.push(`  Address       : ${data.resolver}`);
  if (data.pubkey) {
    lines.push(`  Pubkey (x)    : ${data.pubkey.x}`);
    lines.push(`  Pubkey (y)    : ${data.pubkey.y}`);
  } else {
    lines.push(`  Pubkey        : ${chalk.dim('not set')}`);
  }
  lines.push(`  Contenthash   : ${data.contenthash ?? chalk.dim('not set')}`);
  lines.push('');
  lines.push(chalk.bold('Text Records'));
  for (const key of KEY_TEXT_RECORDS) {
    const value = data.textRecords[key];
    lines.push(`  ${key.padEnd(12, ' ')}: ${value ?? chalk.dim('not set')}`);
  }
  lines.push('');
  lines.push(chalk.bold('NameWrapper'));
  if (data.nameWrapper) {
    lines.push(`  Owner         : ${data.nameWrapper.owner}`);
    lines.push(`  Fuses         : ${data.nameWrapper.fuses}`);
    lines.push(`  Expiry (sec)  : ${data.nameWrapper.expiry}`);
    lines.push(`  Expiry (ISO)  : ${data.nameWrapper.expiryISO}`);
  } else {
    lines.push(`  Status        : ${chalk.dim('not wrapped or NameWrapper disabled')}`);
  }

  console.log(lines.join('\n'));
}

export async function main() {
  const program = new Command();
  program
    .argument('<name>', 'ENS name to inspect (e.g. alpha.agent.agi.eth)')
    .option('--json', 'Emit machine-readable JSON', false)
    .option('--chain-id <chainId>', 'Override the chain ID for RPC calls')
    .option('--rpc-url <url>', 'Override the RPC endpoint URL')
    .option('--ens-registry <address>', 'Override the ENS registry address')
    .option('--name-wrapper <address>', 'Override the NameWrapper address or blank to disable')
    .option('--public-resolver <address>', 'Override the PublicResolver address or blank to disable')
    .action(async (name: string, opts: InspectOptions) => {
      try {
        const result = await inspectEnsName(name, opts);
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        printHumanReadable(result);
      } catch (error) {
        if (error instanceof EnsResolutionError) {
          console.error(chalk.red(`Resolution error: ${error.message}`));
          process.exitCode = 2;
          return;
        }

        if (error instanceof EnsNetworkError) {
          const codeMessage = error.code ? ` (${error.code})` : '';
          console.error(chalk.red(`Network error${codeMessage} while contacting RPC ${error.rpcUrl}`));
          console.error(
            chalk.yellow(
              'Verify connectivity or supply an alternative endpoint via --rpc-url <https://rpc.endpoint>.'
            )
          );
          if (error.cause) {
            console.error(chalk.dim(format(error.cause)));
          }
          process.exitCode = 3;
          return;
        }

        console.error(chalk.red('Unexpected failure while inspecting ENS data.'));
        console.error(format(error));
        process.exitCode = 1;
      }
    });

  await program.parseAsync(process.argv);
}

const invokedDirectly = (() => {
  try {
    const entryUrl = pathToFileURL(process.argv[1] ?? '');
    return import.meta.url === entryUrl.href;
  } catch {
    return true;
  }
})();

if (invokedDirectly) {
  main().catch((error) => {
    console.error(chalk.red('Fatal error while executing ENS inspection.'));
    console.error(format(error));
    process.exit(1);
  });
}
