#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command } from 'commander';
import { dataSlice, id, Interface, JsonRpcProvider, Wallet } from 'ethers';
import { normalizeIntent, type TreasuryIntentV1 } from '../../src/treasury/intentTypes.js';
import {
  digestTreasuryIntent,
  EXECUTE_TRANSACTION_SIGNATURE,
  EXECUTE_TRANSACTION_SELECTOR
} from '../../src/treasury/intentEncoding.js';
import { type SignedIntentEnvelope } from '../../src/treasury/pqEnvelope.js';
import { GuardianRegistry } from '../../src/treasury/guardianRegistry.js';
import { aggregateGuardianEnvelopes } from '../../src/treasury/thresholdAggregator.js';
import { IntentLedger } from '../../src/treasury/intentLedger.js';
import { loadEnvelopesFromDirectory } from '../../src/treasury/envelopeCollector.js';

const program = new Command();
program
  .name('execute-intent')
  .description('Aggregate PQ guardian approvals and execute a TreasuryIntentV1 on-chain.')
  .argument('<intent>', 'Path to the TreasuryIntentV1 JSON file.')
  .option('-e, --envelopes <dir>', 'Directory that stores signed envelopes', './envelopes')
  .option('-r, --registry <file>', 'Guardian registry JSON file', 'config/guardians.json')
  .option('--threshold <m>', 'Required signature threshold', (value) => Number.parseInt(value, 10), 2)
  .option('--treasury <address>', 'Treasury contract address', process.env.TREASURY_ADDRESS)
  .option('--rpc-url <url>', 'Ethereum RPC URL', process.env.RPC_URL)
  .option('--key <hex>', 'Orchestrator private key', process.env.ORCHESTRATOR_KEY)
  .option('--chain-id <id>', 'Chain id for domain binding', (value) => BigInt(value), process.env.CHAIN_ID ? BigInt(process.env.CHAIN_ID) : 0n)
  .option('--domain-version <version>', 'Domain separator version', (value) => Number.parseInt(value, 10), 1)
  .option('--function-signature <signature>', 'Function signature binding', EXECUTE_TRANSACTION_SIGNATURE)
  .option('--ledger <file>', 'Path to the executed intent ledger', 'config/intent-ledger.json')
  .option('--dry-run', 'Only verify signatures without sending a transaction', false)
  .parse(process.argv);

const options = program.opts<{
  envelopes: string;
  registry: string;
  threshold: number;
  treasury: string;
  rpcUrl: string;
  key: string;
  chainId: bigint;
  domainVersion: number;
  functionSignature: string;
  ledger: string;
  dryRun: boolean;
}>();

if (!options.treasury) {
  throw new Error('Treasury contract address is required.');
}
if (!options.rpcUrl) {
  throw new Error('RPC URL is required.');
}
if (!options.key) {
  throw new Error('Orchestrator private key is required.');
}

const intentPath = resolve(program.args[0]);
const rawIntent = JSON.parse(readFileSync(intentPath, 'utf8')) as Partial<TreasuryIntentV1>;
const intent = normalizeIntent(rawIntent);

const selector = options.functionSignature
  ? (dataSlice(id(options.functionSignature), 0, 4) as `0x${string}`)
  : EXECUTE_TRANSACTION_SELECTOR;

const digest = digestTreasuryIntent(intent, {
  domain: {
    chainId: options.chainId,
    contractAddress: options.treasury,
    version: options.domainVersion,
    functionSelector: selector,
    includeSelector: true
  }
});

console.log(`Intent digest: ${digest}`);

const ledger = new IntentLedger(options.ledger);

const envelopeDir = resolve(options.envelopes);
const loadResult = loadEnvelopesFromDirectory(envelopeDir);
const envelopes: SignedIntentEnvelope[] = loadResult.envelopes;

for (const report of loadResult.reports) {
  if (report.status === 'parsed') {
    console.log(`  ✓ loaded ${report.file}`);
  } else {
    console.warn(`  ✗ skipped ${report.file}: ${report.reason}`);
  }
}

if (!envelopes.length) {
  throw new Error('No signed envelopes found.');
}

const registry = GuardianRegistry.fromConfigFile(options.registry);
const report = await aggregateGuardianEnvelopes(envelopes, {
  digest,
  threshold: options.threshold,
  registry,
  executedCheck: (candidate) => ledger.getRecord(candidate)
});

console.log(`\nCollected ${report.approvals.length} valid approval(s). Threshold: ${report.threshold}`);
for (const approval of report.approvals) {
  console.log(`  ✓ ${approval.guardian.id} :: parameterSet=${approval.guardian.parameterSet}`);
}
for (const invalid of report.invalid) {
  console.warn(`  ✗ invalid envelope (${invalid.reason})`);
}
if (!report.thresholdMet) {
  if (report.replayDetected) {
    const prior = report.executedRecord;
    console.error(
      `Digest already executed on ${prior?.at ?? 'a prior run'}${prior?.txHash ? ` (tx ${prior.txHash})` : ''}.`);
  } else {
    const pending = report.pendingGuardians.map((g) => g.id).join(', ') || 'none';
    console.error(
      `Threshold not met. Approvals=${report.approvals.length}/${report.threshold} (shortfall ${report.shortfall}). Pending guardians: ${pending}`
    );
  }
  process.exit(1);
}

if (options.dryRun) {
  console.log('Dry-run enabled. Threshold satisfied; skipping on-chain execution.');
  process.exit(0);
}

const provider = new JsonRpcProvider(options.rpcUrl);
const wallet = new Wallet(options.key, provider);
const iface = new Interface(['function executeTransaction(address to, uint256 value, bytes data)']);
const txData = iface.encodeFunctionData('executeTransaction', [intent.to, intent.value, intent.data]);

console.log('\nBroadcasting executeTransaction call...');
const tx = await wallet.sendTransaction({ to: options.treasury, data: txData });
const receipt = await tx.wait();

if (receipt?.status !== 1n && receipt?.status !== 1) {
  throw new Error(`Transaction failed: ${tx.hash}`);
}

console.log(`Intent executed in tx ${tx.hash}`);
ledger.recordExecution(digest, {
  txHash: tx.hash,
  approvals: report.approvals.map((approval) => approval.guardian.id)
});
console.log(`Ledger updated at ${ledger.path}`);
