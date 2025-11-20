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
import { createExecutionLogger } from '../../src/treasury/executionLogger.js';

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
  .option('--log-file <file>', 'Path to the execution log file', 'logs/treasury-executor.log')
  .option('--webhook <url>', 'Optional webhook to notify after execution')
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
  logFile: string;
  webhook?: string;
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

const logger = createExecutionLogger({
  logPath: options.logFile,
  baseFields: { digest, treasury: options.treasury }
});

const ledger = new IntentLedger(options.ledger);

async function sendWebhook(body: Record<string, unknown>) {
  if (!options.webhook) return;
  try {
    const response = await fetch(options.webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      logger.logger.warn({ status: response.status }, 'Webhook responded with non-200 status');
    }
  } catch (error) {
    logger.logger.warn({ error }, 'Webhook notification failed');
  }
}

async function main() {
  logger.intentReceived({ intentDigest: digest, intent });
  console.log(`Intent digest: ${digest}`);

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

  logger.signaturesLoaded(envelopes.length, { intentDigest: digest });

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
      const note = `Digest already executed on ${prior?.at ?? 'a prior run'}${prior?.txHash ? ` (tx ${prior.txHash})` : ''}.`;
      console.error(note);
      logger.thresholdShortfall(report.threshold, report.approvals.length, report.pendingGuardians.map((g) => g.id), {
        intentDigest: digest,
        note
      });
    } else {
      const pending = report.pendingGuardians.map((g) => g.id);
      const note = `Threshold not met. Approvals=${report.approvals.length}/${report.threshold} (shortfall ${report.shortfall}). Pending guardians: ${pending.join(', ') || 'none'}`;
      console.error(note);
      logger.thresholdShortfall(report.threshold, report.approvals.length, pending, { intentDigest: digest });
    }
    process.exit(1);
  }

  const approvedGuardians = report.approvals.map((approval) => approval.guardian.id);
  logger.thresholdSatisfied(report.threshold, approvedGuardians, { intentDigest: digest });

  if (options.dryRun) {
    console.log('Dry-run enabled. Threshold satisfied; skipping on-chain execution.');
    await sendWebhook({ status: 'dry-run', digest, guardians: approvedGuardians });
    process.exit(0);
  }

  const provider = new JsonRpcProvider(options.rpcUrl);
  const wallet = new Wallet(options.key, provider);
  const iface = new Interface(['function executeTransaction(address to, uint256 value, bytes data)']);
  const txData = iface.encodeFunctionData('executeTransaction', [intent.to, intent.value, intent.data]);

  console.log('\nBroadcasting executeTransaction call...');
  const tx = await wallet.sendTransaction({ to: options.treasury, data: txData });
  logger.broadcast(tx.hash, { intentDigest: digest });
  const receipt = await tx.wait();

  if (receipt?.status !== 1n && receipt?.status !== 1) {
    throw new Error(`Transaction failed: ${tx.hash}`);
  }

  console.log(`Intent executed in tx ${tx.hash}`);
  logger.executed(tx.hash, { intentDigest: digest });
  ledger.recordExecution(digest, {
    txHash: tx.hash,
    approvals: approvedGuardians
  });
  console.log(`Ledger updated at ${ledger.path}`);
  await sendWebhook({ status: 'executed', digest, txHash: tx.hash, guardians: approvedGuardians });
}

main().catch((error) => {
  logger.failure(error, { intentDigest: digest });
  console.error(error);
  process.exit(1);
});
