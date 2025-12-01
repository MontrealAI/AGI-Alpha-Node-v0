#!/usr/bin/env node
import fs from 'node:fs';
import { Command } from 'commander';
import chalk from 'chalk';
import pino from 'pino';
import { getAddress, parseUnits } from 'ethers';
import { loadConfig } from './config/env.js';
import { createProvider, createWallet } from './services/provider.js';
import { verifyNodeOwnership, buildNodeNameFromLabel } from './services/ensVerifier.js';
import { buildStakeAndActivateTx, validateStakeThreshold } from './services/staking.js';
import { calculateRewardShare, splitRewardPool } from './services/rewards.js';
import {
  optimizeReinvestmentStrategy,
  summarizeStrategy,
  calculateAlphaProductivityIndex
} from './services/economics.js';
import { formatTokenAmount } from './utils/formatters.js';
import {
  AGIALPHA_TOKEN_CHECKSUM_ADDRESS,
  AGIALPHA_TOKEN_DECIMALS,
  AGIALPHA_TOKEN_SYMBOL,
  normalizeTokenAddress
} from './constants/token.js';
import { buildTokenApproveTx, describeAgialphaToken, getTokenAllowance } from './services/token.js';
import { runNodeDiagnostics, launchMonitoring } from './orchestrator/nodeRuntime.js';
import { startMonitorLoop } from './orchestrator/monitorLoop.js';
import { bootstrapContainer } from './orchestrator/bootstrap.js';
import {
  buildSystemPauseTx,
  buildMinimumStakeTx,
  buildValidatorThresholdTx,
  buildStakeRegistryUpgradeTx,
  buildRoleShareTx,
  buildGlobalSharesTx,
  buildJobRegistryUpgradeTx,
  buildDisputeTriggerTx,
  buildIdentityDelegateTx,
  buildNodeRegistrationTx,
  buildNodeMetadataTx,
  buildNodeStatusTx,
  buildNodeOperatorTx,
  buildNodeWorkMeterTx,
  buildWorkMeterValidatorTx,
  buildWorkMeterOracleTx,
  buildWorkMeterWindowTx,
  buildWorkMeterProductivityIndexTx,
  buildWorkMeterUsageTx,
  buildProductivityRecordTx,
  buildProductivityEmissionManagerTx,
  buildProductivityWorkMeterTx,
  buildProductivityTreasuryTx,
  buildEmissionPerEpochTx,
  buildEmissionEpochLengthTx,
  buildEmissionCapTx,
  buildEmissionRateMultiplierTx,
  buildIncentivesStakeManagerTx,
  buildIncentivesMinimumStakeTx,
  buildIncentivesHeartbeatTx,
  buildIncentivesActivationFeeTx,
  buildIncentivesTreasuryTx,
  getOwnerFunctionCatalog,
  getOwnerControlSurfaces
} from './services/governance.js';
import { recordGovernanceAction } from './services/governanceLedger.js';
import { generateEnsSetupGuide, formatEnsGuide } from './services/ensGuide.js';
import { planJobExecution, describeStrategyComparison, DEFAULT_STRATEGIES } from './intelligence/planning.js';
import { orchestrateSwarm } from './intelligence/swarmOrchestrator.js';
import { runCurriculumEvolution } from './intelligence/learningLoop.js';
import { assessAntifragility } from './intelligence/stressHarness.js';
import { createJobProof, buildProofSubmissionTx } from './services/jobProof.js';
import { loadOfflineSnapshot } from './services/offlineSnapshot.js';
import { acknowledgeStakeAndActivate } from './services/stakeActivation.js';
import { createJobLifecycle } from './services/jobLifecycle.js';
import { createLifecycleJournal } from './services/lifecycleJournal.js';
import { buildEpochPayload } from './services/oracleExport.js';
import { applyEnsRecordOverrides, buildEnsRecordTemplate } from './ens/ens_config.js';
import { createSyntheticLaborEngine } from './services/syntheticLaborEngine.js';
import { createGlobalIndexEngine } from './services/globalIndexEngine.js';
import { initializeDatabase } from './persistence/database.js';
import { buildGossipsubRoutingConfig } from './network/pubsubConfig.js';
import { buildDialerPolicyConfig } from './network/dialerPolicy.js';
import { installProcessGuards } from './utils/processGuard.js';

const program = new Command();
installProcessGuards();

function parseStrategiesOption(input) {
  if (!input) return DEFAULT_STRATEGIES;
  return input
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk, index) => {
      const [name, cost = '0', reliability, capability, parallelism = '1'] = chunk.split(':').map((part) => part.trim());
      if (!name || reliability === undefined || capability === undefined) {
        throw new Error(`Strategy definition at position ${index + 1} must include name, cost, reliability, capability`);
      }
      const parsedReliability = Number.parseFloat(reliability);
      const parsedCapability = Number.parseFloat(capability);
      const parsedParallelism = Number.parseFloat(parallelism);
      if (!Number.isFinite(parsedReliability) || !Number.isFinite(parsedCapability) || !Number.isFinite(parsedParallelism)) {
        throw new Error(`Strategy definition ${name} contains invalid numeric values`);
      }
      return {
        name,
        computeCost: cost,
        reliability: parsedReliability,
        capability: parsedCapability,
        parallelism: parsedParallelism
      };
    });
}

function parseCsv(input) {
  if (!input) return [];
  return input
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function parseWindowList(input) {
  if (!input) {
    return undefined;
  }
  if (Array.isArray(input)) {
    return input
      .map((entry) => (typeof entry === 'string' ? entry.trim() : String(entry)))
      .filter((entry) => entry.length > 0);
  }
  return input
    .split(',')
    .map((value) => value.trim())
    .filter((value, index, array) => value.length > 0 && array.indexOf(value) === index);
}

function toDateOnly(value) {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

function addDays(date, offset) {
  const parsed = toDateOnly(date);
  if (!parsed) return null;
  const d = new Date(parsed);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

function enumerateDates(startDate, endDate) {
  const start = toDateOnly(startDate);
  const end = toDateOnly(endDate);
  if (!start || !end) return [];
  const dates = [];
  let cursor = start;
  while (cursor <= end) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function formatBps(value) {
  if (value === null || value === undefined) {
    return 'n/a';
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return `${value.toString()} bps`;
  }
  const percent = (numeric / 100).toFixed(2);
  return `${numeric} bps (${percent}%)`;
}

function formatOptionalRatio(value) {
  if (value === null || value === undefined) {
    return 'n/a';
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 'n/a';
  }
  return numeric.toFixed(4);
}

function formatYield(value, digits = 4) {
  if (value === null || value === undefined) {
    return '0.0000';
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '0.0000';
  }
  return numeric.toFixed(digits);
}

function formatLatencySeconds(value) {
  if (value === null || value === undefined) {
    return '0';
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '0';
  }
  return numeric.toFixed(2);
}

function rankBreakdownEntries(breakdown = {}) {
  return Object.entries(breakdown)
    .map(([key, metrics]) => ({
      key,
      minted: Number(metrics?.minted ?? 0),
      accepted: Number(metrics?.accepted ?? 0),
      slashes: Number(metrics?.slashes ?? 0),
      stake: Number(metrics?.stake ?? 0),
      acceptanceRate: Number(metrics?.acceptanceRate ?? 0),
      onTimeP95Seconds: Number(metrics?.onTimeP95Seconds ?? 0),
      slashingAdjustedYield: Number(metrics?.slashingAdjustedYield ?? 0)
    }))
    .sort((a, b) => b.slashingAdjustedYield - a.slashingAdjustedYield);
}

function printAlphaWorkUnitMetrics(metrics) {
  if (!metrics) {
    console.log(chalk.yellow('No α-work unit metrics available. Stream data first with the monitor loop.'));
    return;
  }

  const segments = [];
  if (metrics.overall) {
    segments.push({ label: metrics.overall.window ?? 'all', metrics: metrics.overall });
  }
  if (Array.isArray(metrics.windows)) {
    metrics.windows.forEach((entry) => {
      if (entry) {
        segments.push({ label: entry.window ?? entry.label ?? 'window', metrics: entry });
      }
    });
  }

  if (!segments.length) {
    console.log(chalk.yellow('α-work unit metrics registry is empty. Ingest event history before requesting KPIs.'));
    return;
  }

  console.log(chalk.bold('α-work unit KPI rollup'));
  const windowTable = segments.map(({ label, metrics: entry }) => ({
    window: label,
    minted: entry?.totals?.minted ?? 0,
    accepted: entry?.totals?.accepted ?? 0,
    acceptance: formatYield(entry?.acceptanceRate),
    p95Seconds: formatLatencySeconds(entry?.onTimeP95Seconds),
    slashAdjustedYield: formatYield(entry?.slashingAdjustedYield),
    quality: formatYield(entry?.quality?.global ?? 0)
  }));
  console.table(windowTable);

  const overallBreakdowns = metrics.overall?.breakdowns ?? {};
  const breakdownConfigs = [
    { title: 'Top agents', dimension: overallBreakdowns.agents },
    { title: 'Top nodes', dimension: overallBreakdowns.nodes },
    { title: 'Top validators', dimension: overallBreakdowns.validators }
  ];

  breakdownConfigs.forEach(({ title, dimension }) => {
    const ranked = rankBreakdownEntries(dimension);
    if (!ranked.length) {
      return;
    }
    console.log(chalk.cyan(title));
    console.table(
      ranked.slice(0, 5).map((entry) => ({
        id: entry.key,
        minted: entry.minted,
        accepted: entry.accepted,
        acceptance: formatYield(entry.acceptanceRate),
        p95Seconds: formatLatencySeconds(entry.onTimeP95Seconds),
        slashAdjustedYield: formatYield(entry.slashingAdjustedYield),
        slashes: entry.slashes,
        stake: entry.stake
      }))
    );
  });
}

function buildProductivityReports(options) {
  if (options.reports) {
    if (options.alpha) {
      throw new Error('Provide either --reports or inline series options, not both');
    }
    const raw = fs.readFileSync(options.reports, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('--reports file must contain an array of epoch reports');
    }
    return parsed;
  }

  if (!options.alpha) {
    throw new Error('Provide either --reports or --alpha values');
  }

  const alphaValues = parseCsv(options.alpha);
  if (alphaValues.length === 0) {
    throw new Error('--alpha must contain at least one value');
  }

  const sloValues = parseCsv(options.slo);
  const qualityValues = parseCsv(options.quality);
  const emissionValues = parseCsv(options.emissions);
  const burnValues = parseCsv(options.burns);

  return alphaValues.map((alphaValue, index) => ({
    epoch: index + 1,
    alpha: alphaValue,
    sloPass: sloValues[index],
    qualityValidation: qualityValues[index],
    tokensEmitted: emissionValues[index],
    tokensBurned: burnValues[index]
  }));
}

function parseTasksOption(input) {
  const defaults = [
    { name: 'energy-grid', domain: 'energy', complexity: 7, urgency: 5, value: 8 },
    { name: 'bio-synthesis', domain: 'biotech', complexity: 6, urgency: 4, value: 7 }
  ];
  if (!input) return defaults;
  return input
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk, index) => {
      const [domain, complexity, urgency = '1', value = '1', name] = chunk.split(':').map((part) => part.trim());
      if (!domain || complexity === undefined) {
        throw new Error(`Task definition at position ${index + 1} requires domain and complexity`);
      }
      const parsedComplexity = Number.parseFloat(complexity);
      const parsedUrgency = Number.parseFloat(urgency);
      const parsedValue = Number.parseFloat(value);
      if (!Number.isFinite(parsedComplexity)) {
        throw new Error(`Task ${domain} contains invalid complexity`);
      }
      return {
        name: name || `${domain}-task-${index + 1}`,
        domain,
        complexity: parsedComplexity,
        urgency: Number.isFinite(parsedUrgency) ? parsedUrgency : 1,
        value: Number.isFinite(parsedValue) ? parsedValue : 1
      };
    });
}

function parseAgentsOption(input) {
  const defaults = [
    { name: 'orion', domains: ['energy', 'finance'], capacity: 2, latencyMs: 80, quality: 0.95, capability: 8 },
    { name: 'helix', domains: ['biotech'], capacity: 1, latencyMs: 140, quality: 0.9, capability: 7 },
    { name: 'vault', domains: ['governance', 'finance'], capacity: 1, latencyMs: 90, quality: 0.85, capability: 5 }
  ];
  if (!input) return defaults;
  return input
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk, index) => {
      const [name, domainsRaw, capacity, latency = '120', quality = '0.9', capability = '6'] = chunk
        .split(':')
        .map((part) => part.trim());
      if (!name || !domainsRaw || capacity === undefined) {
        throw new Error(`Agent definition at position ${index + 1} requires name, domains, and capacity`);
      }
      const domainList = domainsRaw.split('|').map((domain) => domain.trim()).filter(Boolean);
      const parsedCapacity = Number.parseFloat(capacity);
      const parsedLatency = Number.parseFloat(latency);
      const parsedQuality = Number.parseFloat(quality);
      const parsedCapability = Number.parseFloat(capability);
      if (!Number.isFinite(parsedCapacity)) {
        throw new Error(`Agent ${name} contains invalid capacity`);
      }
      return {
        name,
        domains: domainList,
        capacity: parsedCapacity,
        latencyMs: Number.isFinite(parsedLatency) ? parsedLatency : 120,
        quality: Number.isFinite(parsedQuality) ? parsedQuality : 0.9,
        capability: Number.isFinite(parsedCapability) ? parsedCapability : 6
      };
    });
}

function parseHistoryOption(input) {
  const defaults = [
    { difficulty: 4, successRate: 0.85, reward: 1.4 },
    { difficulty: 4.5, successRate: 0.82, reward: 1.5 },
    { difficulty: 5, successRate: 0.8, reward: 1.6 }
  ];
  if (!input) return defaults;
  return input
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk, index) => {
      const [difficulty, successRate, reward] = chunk.split(':').map((part) => part.trim());
      if (difficulty === undefined || successRate === undefined || reward === undefined) {
        throw new Error(`History definition at position ${index + 1} requires difficulty:successRate:reward`);
      }
      const parsedDifficulty = Number.parseFloat(difficulty);
      const parsedSuccess = Number.parseFloat(successRate);
      const parsedReward = Number.parseFloat(reward);
      if (!Number.isFinite(parsedDifficulty) || !Number.isFinite(parsedSuccess) || !Number.isFinite(parsedReward)) {
        throw new Error(`History definition ${chunk} contains invalid numbers`);
      }
      return {
        difficulty: parsedDifficulty,
        successRate: parsedSuccess,
        reward: parsedReward
      };
    });
}

function parseScenariosOption(input) {
  const defaults = [
    { name: 'flash-crash', loadFactor: 12, errorRate: 0.12, downtimeMinutes: 14, financialExposure: 180_000 },
    { name: 'api-outage', loadFactor: 4, errorRate: 0.05, downtimeMinutes: 60, financialExposure: 50_000 }
  ];
  if (!input) return defaults;
  return input
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk, index) => {
      const [name, loadFactor, errorRate, downtime = '0', exposure = '0'] = chunk.split(':').map((part) => part.trim());
      if (!name || loadFactor === undefined || errorRate === undefined) {
        throw new Error(`Scenario definition at position ${index + 1} requires name:loadFactor:errorRate`);
      }
      const parsedLoad = Number.parseFloat(loadFactor);
      const parsedError = Number.parseFloat(errorRate);
      const parsedDowntime = Number.parseFloat(downtime);
      const parsedExposure = Number.parseFloat(exposure);
      if (!Number.isFinite(parsedLoad) || !Number.isFinite(parsedError)) {
        throw new Error(`Scenario definition ${name} contains invalid numbers`);
      }
      return {
        name,
        loadFactor: parsedLoad,
        errorRate: parsedError,
        downtimeMinutes: Number.isFinite(parsedDowntime) ? parsedDowntime : 0,
        financialExposure: Number.isFinite(parsedExposure) ? parsedExposure : 0
      };
    });
}

function parseMetadataOption(input) {
  if (input === undefined || input === null) {
    return undefined;
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed);
    } catch (error) {
      throw new Error(`Failed to parse metadata JSON: ${error.message}`);
    }
  }
  return trimmed;
}

function parseJsonMaybe(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function parseLedgerTagsOption(input) {
  if (!input) {
    return [];
  }
  return input
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function checksumAddressOrUndefined(value, label) {
  if (value === undefined || value === null) {
    return undefined;
  }
  try {
    return getAddress(value);
  } catch (error) {
    throw new Error(`${label ?? 'address'} must be a valid checksum address: ${error.message}`);
  }
}

function parseDecimalToWei(amount, label) {
  if (amount === undefined || amount === null) {
    return null;
  }
  const stringified = typeof amount === 'string' ? amount.trim() : String(amount);
  if (!stringified) {
    return null;
  }
  try {
    return parseUnits(stringified, 18);
  } catch (error) {
    throw new Error(`${label ?? 'amount'} must be a numeric value with up to 18 decimals`);
  }
}

function parseIntegerOption(value, label) {
  if (value === undefined || value === null) {
    return undefined;
  }
  const parsed = Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label ?? 'value'} must be an integer`);
  }
  return parsed;
}

function parseBooleanOption(value, label) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }
  throw new Error(`${label ?? 'value'} must be a boolean-like flag`);
}

function parseBigIntOption(value, label) {
  if (value === undefined || value === null) {
    return undefined;
  }
  const normalized = String(value).trim();
  if (!normalized) {
    return undefined;
  }
  if (!/^-?\d+$/.test(normalized)) {
    throw new Error(`${label ?? 'value'} must be an integer`);
  }
  try {
    return BigInt(normalized);
  } catch (error) {
    throw new Error(`${label ?? 'value'} must be an integer: ${error.message}`);
  }
}

function printGovernanceMeta(meta) {
  console.log(chalk.bold(meta.description));
  console.table({
    contract: meta.contract,
    method: meta.method,
    to: meta.to,
    signature: meta.signature
  });
  if (meta.args && Object.keys(meta.args).length > 0) {
    console.log(chalk.gray('Arguments'));
    console.table(meta.args);
  }
  if (meta.diff && meta.diff.length > 0) {
    console.log(chalk.gray('Proposed diff'));
    console.table(
      meta.diff.map((entry) => ({
        field: entry.field,
        before: entry.before ?? '-',
        after: entry.after ?? '-'
      }))
    );
  } else {
    console.log(chalk.gray('No diff detected from provided context'));
  }
}

function emitGovernanceResult(tx, options) {
  printGovernanceMeta(tx.meta);
  console.log(chalk.gray(`calldata: ${tx.data}`));
  const tags = parseLedgerTagsOption(options.tags);
  if (!options.execute) {
    console.log(chalk.yellow('Dry-run only. Use --execute --confirm to persist a ledger entry.'));
    return;
  }
  if (!options.confirm) {
    throw new Error('Owner confirmation required: pass --confirm along with --execute to persist the payload');
  }
  const operator = options.operator ? checksumAddressOrUndefined(options.operator, 'operator') : null;
  const ledgerResult = recordGovernanceAction({
    payload: { to: tx.to, data: tx.data },
    meta: tx.meta,
    signature: options.signature ?? null,
    operator,
    tags,
    rootDir: options.ledgerRoot ? options.ledgerRoot : process.cwd()
  });
  console.log(chalk.green(`Ledger entry recorded at ${ledgerResult.filePath}`));
}

function addCommonGovernanceOptions(command) {
  return command
    .option('--execute', 'Persist the payload into the governance ledger')
    .option('--confirm', 'Owner acknowledgement required with --execute')
    .option('--signature <hex>', 'Signature captured with the ledger entry')
    .option('--operator <address>', 'Operator/owner address recorded alongside the payload')
    .option('--tags <tags>', 'Comma-separated ledger tags for classification')
    .option('--ledger-root <path>', 'Custom ledger root for persisted payloads');
}

function loadFileContents(filePath) {
  if (!filePath) return undefined;
  const resolved = filePath.trim();
  if (!resolved) return undefined;
  try {
    return fs.readFileSync(resolved, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read file at ${resolved}: ${error.message}`);
  }
}

function resolveResultPayload({ result, resultFile }) {
  const explicit = result !== undefined && result !== null ? result : undefined;
  const fileContent = resultFile ? loadFileContents(resultFile) : undefined;
  return parseJsonMaybe(fileContent ?? explicit);
}

function resolveMetadataPayload(metadata, metadataFile) {
  const fileContent = metadataFile ? loadFileContents(metadataFile) : undefined;
  const source = fileContent ?? metadata;
  return parseJsonMaybe(source);
}

function buildJobLifecycleFromConfig(config, overrides = {}, logger = pino({ level: 'info', name: 'jobs-cli' })) {
  const registryAddress = overrides.registry ?? config.JOB_REGISTRY_ADDRESS;
  if (!registryAddress) {
    throw new Error('Job registry address is required. Configure JOB_REGISTRY_ADDRESS or supply --registry.');
  }
  const rpcUrl = overrides.rpcUrl ?? config.RPC_URL;
  const provider = createProvider(rpcUrl);
  const privateKey = overrides.privateKey ?? config.OPERATOR_PRIVATE_KEY ?? null;
  const signer = privateKey ? createWallet(privateKey, provider) : null;
  const profile = overrides.profile ?? config.JOB_REGISTRY_PROFILE;
  const rawProfileOverrides =
    overrides.profileConfig !== undefined ? parseJsonMaybe(overrides.profileConfig) : config.JOB_PROFILE_SPEC ?? null;
  if (typeof rawProfileOverrides === 'string') {
    throw new Error('Profile configuration overrides must be valid JSON describing ABI, events, and methods.');
  }
  const journalDirectory = overrides.lifecycleLogDir ?? config.LIFECYCLE_LOG_DIR ?? '.agi/lifecycle';
  const journal = createLifecycleJournal({ directory: journalDirectory });
  const lifecycle = createJobLifecycle({
    provider,
    jobRegistryAddress: registryAddress,
    defaultSigner: signer,
    defaultSubdomain: overrides.subdomain ?? config.NODE_LABEL,
    defaultProof: overrides.proof ?? config.JOB_APPLICATION_PROOF ?? '0x',
    discoveryBlockRange: overrides.discoveryBlockRange ?? config.JOB_DISCOVERY_BLOCK_RANGE,
    profile,
    profileOverrides: rawProfileOverrides,
    journal,
    logger
  });
  return { lifecycle, provider, signer };
}

function collectRoleShareTargets(value, previous) {
  const accumulator = { ...previous };
  const trimmed = (value ?? '').trim();
  if (trimmed.length === 0) {
    return accumulator;
  }
  const [role, share] = trimmed.split('=').map((part) => part.trim());
  if (!role || share === undefined) {
    throw new Error('Role share definition must be formatted as role=bps');
  }
  const parsedShare = Number.parseInt(share, 10);
  if (!Number.isFinite(parsedShare) || !Number.isInteger(parsedShare)) {
    throw new Error(`Role share for ${role} must be an integer basis point value`);
  }
  accumulator[role] = parsedShare;
  return accumulator;
}
program
  .name('agi-alpha-node')
  .description('AGI Alpha Node sovereign runtime CLI')
  .version('1.1.0');

program
  .command('ens:records')
  .description('Print ENS metadata template for the current node configuration')
  .option('-l, --label <label>', 'ENS label to embed in the generated records')
  .option('-p, --parent <domain>', 'ENS parent domain (e.g. alpha.node.agi.eth)')
  .option('--ens-name <ens>', 'Full ENS name override (takes precedence over label/parent)')
  .option('--payout-eth <address>', 'Override ETH payout address used for the coin record')
  .option('--payout-agialpha <address>', 'Override AGIALPHA payout address used for the coin record')
  .option('--verifier-url <url>', 'Override verifier base URL for published text records')
  .option('--primary-model <model>', 'Primary model identifier for agialpha_model text record')
  .option('--commit <hash>', 'Override commit hash embedded in agialpha_commit text record')
  .option('--pretty', 'Pretty-print JSON output', false)
  .action((options) => {
    let config = {};
    let configLoaded = false;
    try {
      config = loadConfig();
      configLoaded = true;
    } catch (error) {
      const hasOverrides = [
        'ensName',
        'label',
        'parent',
        'payoutEth',
        'payoutAgialpha',
        'verifierUrl',
        'primaryModel',
        'commit'
      ].some((key) => Boolean(options[key]));
      if (!hasOverrides) {
        console.error(chalk.red(`Failed to load configuration: ${error.message}`));
        process.exitCode = 1;
        return;
      }

      console.error(
        chalk.yellow(
          `Configuration could not be loaded (${error.message}); proceeding with CLI overrides only`
        )
      );
    }
    const mergedConfig = applyEnsRecordOverrides(config, {
      ensName: options.ensName,
      label: options.label,
      parent: options.parent,
      payoutEth: options.payoutEth,
      payoutAgialpha: options.payoutAgialpha,
      verifierUrl: options.verifierUrl,
      primaryModel: options.primaryModel
    });

    if (!configLoaded && !Object.keys(mergedConfig).length) {
      console.error(chalk.red('ENS records require configuration or explicit CLI overrides.'));
      process.exitCode = 1;
      return;
    }

    const template = buildEnsRecordTemplate({
      config: mergedConfig,
      commitHash: options.commit?.trim?.() ?? null
    });
    const payload = options.pretty ? JSON.stringify(template, null, 2) : JSON.stringify(template);
    console.log(payload);
  });

program
  .command('ens-guide')
  .description('Print ENS subdomain setup instructions for a node label')
  .requiredOption('-l, --label <label>', 'ENS label for the node (e.g. 1)')
  .option('-p, --parent <domain>', 'ENS parent domain', 'alpha.node.agi.eth')
  .requiredOption('-a, --address <address>', 'Operator address that will control the subdomain')
  .action((options) => {
    try {
      const guide = generateEnsSetupGuide({
        label: options.label,
        parentDomain: options.parent,
        operatorAddress: options.address
      });
      console.log(chalk.bold(`ENS setup guide for ${guide.nodeName}`));
      const lines = formatEnsGuide(guide);
      for (const line of lines) {
        const [heading, ...rest] = line.split('\n');
        console.log(chalk.cyan(heading));
        rest.forEach((segment) => console.log(`   ${segment}`));
      }
      console.log(chalk.gray(`Reference: ${guide.ensManagerUrl}`));
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    }
  });

program
  .command('verify-ens')
  .description('Verify ENS ownership for a node label')
  .requiredOption('-l, --label <label>', 'ENS label for the node (e.g. 1)')
  .option('-p, --parent <domain>', 'ENS parent domain', 'alpha.node.agi.eth')
  .requiredOption('-a, --address <address>', 'Expected operator address')
  .option('--rpc <url>', 'RPC endpoint URL')
  .action(async (options) => {
    const logger = pino({ level: 'info', name: 'verify-ens' });
    try {
      const config = loadConfig({ RPC_URL: options.rpc, NODE_LABEL: options.label, OPERATOR_ADDRESS: options.address });
      const provider = createProvider(config.RPC_URL);
      const verification = await verifyNodeOwnership({
        provider,
        label: config.NODE_LABEL,
        parentDomain: config.ENS_PARENT_DOMAIN,
        expectedAddress: config.OPERATOR_ADDRESS
      });
      const status = verification.success ? chalk.green('verified') : chalk.red('mismatch');
      console.log(`ENS ownership ${status} for ${verification.nodeName}`);
      console.table({
        expected: verification.expectedAddress,
        resolved: verification.resolvedAddress,
        registry: verification.registryOwner,
        wrapper: verification.wrapperOwner,
        matches: JSON.stringify(verification.matches)
      });
    } catch (error) {
      logger.error(error, 'Failed to verify ENS ownership');
      process.exitCode = 1;
    }
  });

program
  .command('stake-tx')
  .description('Generate stakeAndActivate transaction payload')
  .requiredOption('-m, --amount <amount>', '$AGIALPHA amount to stake (decimal)')
  .requiredOption('-i, --incentives <address>', 'Platform incentives contract address')
  .option('-d, --decimals <decimals>', 'Token decimals', '18')
  .action((options) => {
    try {
      const tx = buildStakeAndActivateTx({
        amount: options.amount,
        decimals: Number.parseInt(options.decimals, 10),
        incentivesAddress: options.incentives
      });
      console.log('Transaction payload');
      console.table({
        to: tx.to,
        data: tx.data,
        amount: tx.amount.toString()
      });
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    }
  });

program
  .command('status')
  .description('Run diagnostics against the node configuration')
  .requiredOption('-l, --label <label>', 'ENS label for the node')
  .requiredOption('-a, --address <address>', 'Operator address')
  .option('--rpc <url>', 'RPC endpoint URL')
  .option('--stake-manager <address>', 'StakeManager contract address')
  .option('--incentives <address>', 'PlatformIncentives contract address')
  .option('--reward-engine <address>', 'RewardEngine contract address for share governance')
  .option('--job-registry <address>', 'JobRegistry contract address')
  .option('--identity-registry <address>', 'IdentityRegistry contract address')
  .option('--system-pause <address>', 'System pause contract address for owner overrides')
  .option('--emission-manager <address>', 'EmissionManager contract address')
  .option('--desired-minimum <amount>', 'Desired minimum stake floor in $AGIALPHA (decimal)')
  .option('--auto-resume', 'Generate resume transaction when the stake posture is healthy')
  .option('--operator-share-bps <bps>', 'Desired operator global share (basis points)')
  .option('--validator-share-bps <bps>', 'Desired validator global share (basis points)')
  .option('--treasury-share-bps <bps>', 'Desired treasury global share (basis points)')
  .option('--desired-job-registry <address>', 'Desired StakeManager job registry target address')
  .option('--desired-identity-registry <address>', 'Desired StakeManager identity registry target address')
  .option('--desired-validation-module <address>', 'Desired JobRegistry validation module address')
  .option('--desired-reputation-module <address>', 'Desired JobRegistry reputation module address')
  .option('--desired-dispute-module <address>', 'Desired JobRegistry dispute module address')
  .option('--desired-epoch-emission <amount>', 'Desired emission released per epoch in $AGIALPHA (decimal)')
  .option('--desired-epoch-length <seconds>', 'Desired emission epoch length in seconds (integer)')
  .option('--desired-emission-cap <amount>', 'Desired cumulative emission cap in $AGIALPHA (decimal)')
  .option('--desired-multiplier-numerator <value>', 'Desired emission multiplier numerator (uint256)')
  .option('--desired-multiplier-denominator <value>', 'Desired emission multiplier denominator (uint256)')
  .option(
    '--role-share <role=bps>',
    'Role share target definition (repeatable). Example: guardian=250',
    collectRoleShareTargets,
    {}
  )
  .option('--projected-rewards <amount>', 'Projected reward pool for the next epoch (decimal)')
  .option('--metrics-port <port>', 'Expose Prometheus metrics on the specified port')
  .option(
    '--offline-snapshot <path>',
    'Use offline snapshot JSON when RPC connectivity is unavailable'
  )
  .action(async (options) => {
    const logger = pino({ level: 'info', name: 'status' });
    try {
      let offlineSnapshot = null;
      if (options.offlineSnapshot) {
        try {
          offlineSnapshot = loadOfflineSnapshot(options.offlineSnapshot);
        } catch (snapshotError) {
          logger.error(snapshotError, 'Failed to load offline snapshot');
          console.error(chalk.red(snapshotError.message));
          process.exitCode = 1;
          return;
        }
      }
      const configOverrides = {
        RPC_URL: options.rpc,
        NODE_LABEL: options.label,
        OPERATOR_ADDRESS: options.address,
        STAKE_MANAGER_ADDRESS: options.stakeManager,
        PLATFORM_INCENTIVES_ADDRESS: options.incentives,
        REWARD_ENGINE_ADDRESS: options.rewardEngine,
        JOB_REGISTRY_ADDRESS: options.jobRegistry,
        IDENTITY_REGISTRY_ADDRESS: options.identityRegistry,
        SYSTEM_PAUSE_ADDRESS: options.systemPause,
        EMISSION_MANAGER_ADDRESS: options.emissionManager,
        DESIRED_MINIMUM_STAKE: options.desiredMinimum,
        AUTO_RESUME: options.autoResume,
        METRICS_PORT: options.metricsPort,
        DESIRED_OPERATOR_SHARE_BPS: options.operatorShareBps,
        DESIRED_VALIDATOR_SHARE_BPS: options.validatorShareBps,
        DESIRED_TREASURY_SHARE_BPS: options.treasuryShareBps,
        DESIRED_JOB_REGISTRY_ADDRESS: options.desiredJobRegistry,
        DESIRED_IDENTITY_REGISTRY_ADDRESS: options.desiredIdentityRegistry,
        DESIRED_VALIDATION_MODULE_ADDRESS: options.desiredValidationModule,
        DESIRED_REPUTATION_MODULE_ADDRESS: options.desiredReputationModule,
        DESIRED_DISPUTE_MODULE_ADDRESS: options.desiredDisputeModule,
        DESIRED_EMISSION_PER_EPOCH: options.desiredEpochEmission,
        DESIRED_EPOCH_LENGTH_SECONDS: options.desiredEpochLength,
        DESIRED_EMISSION_CAP: options.desiredEmissionCap,
        DESIRED_EMISSION_MULTIPLIER_NUMERATOR: options.desiredMultiplierNumerator,
        DESIRED_EMISSION_MULTIPLIER_DENOMINATOR: options.desiredMultiplierDenominator,
        ROLE_SHARE_TARGETS:
          options.roleShare && Object.keys(options.roleShare).length > 0 ? options.roleShare : undefined
      };

      const config = loadConfig(
        Object.fromEntries(
          Object.entries(configOverrides).filter(([, value]) => value !== undefined)
        )
      );

      const networkMetrics = (() => {
        try {
          const gossipsubRouting = buildGossipsubRoutingConfig({ config, logger });
          const dialerPolicy = buildDialerPolicyConfig({ config, baseLogger: logger });
          return { meshConfig: gossipsubRouting.mesh, gossipConfig: gossipsubRouting.gossip, dialerPolicy };
        } catch (error) {
          logger?.warn?.(error, 'Unable to derive network metrics for telemetry');
          return null;
        }
      })();
      const diagnostics = await runNodeDiagnostics({
        rpcUrl: config.RPC_URL,
        label: config.NODE_LABEL,
        parentDomain: config.ENS_PARENT_DOMAIN,
        operatorAddress: config.OPERATOR_ADDRESS,
        stakeManagerAddress: config.STAKE_MANAGER_ADDRESS,
        incentivesAddress: config.PLATFORM_INCENTIVES_ADDRESS,
        systemPauseAddress: config.SYSTEM_PAUSE_ADDRESS,
        desiredMinimumStake: config.DESIRED_MINIMUM_STAKE,
        autoResume: config.AUTO_RESUME,
        rewardEngineAddress: config.REWARD_ENGINE_ADDRESS,
        desiredOperatorShareBps: config.DESIRED_OPERATOR_SHARE_BPS,
        desiredValidatorShareBps: config.DESIRED_VALIDATOR_SHARE_BPS,
        desiredTreasuryShareBps: config.DESIRED_TREASURY_SHARE_BPS,
        roleShareTargets: config.ROLE_SHARE_TARGETS,
        jobRegistryAddress: config.JOB_REGISTRY_ADDRESS,
        identityRegistryAddress: config.IDENTITY_REGISTRY_ADDRESS,
        desiredJobRegistryAddress: config.DESIRED_JOB_REGISTRY_ADDRESS,
        desiredIdentityRegistryAddress: config.DESIRED_IDENTITY_REGISTRY_ADDRESS,
        desiredValidationModuleAddress: config.DESIRED_VALIDATION_MODULE_ADDRESS,
        desiredReputationModuleAddress: config.DESIRED_REPUTATION_MODULE_ADDRESS,
        desiredDisputeModuleAddress: config.DESIRED_DISPUTE_MODULE_ADDRESS,
        emissionManagerAddress: config.EMISSION_MANAGER_ADDRESS,
        desiredEmissionPerEpoch: config.DESIRED_EMISSION_PER_EPOCH,
        desiredEpochLengthSeconds: config.DESIRED_EPOCH_LENGTH_SECONDS,
        desiredEmissionCap: config.DESIRED_EMISSION_CAP,
        desiredEmissionMultiplierNumerator: config.DESIRED_EMISSION_MULTIPLIER_NUMERATOR,
        desiredEmissionMultiplierDenominator: config.DESIRED_EMISSION_MULTIPLIER_DENOMINATOR,
        projectedRewards: options.projectedRewards,
        offlineSnapshot,
        logger
      });

      console.log(chalk.bold(`Diagnostics for ${diagnostics.verification.nodeName}`));
      console.table({
        expected: diagnostics.verification.expectedAddress,
        resolved: diagnostics.verification.resolvedAddress,
        registry: diagnostics.verification.registryOwner,
        wrapper: diagnostics.verification.wrapperOwner,
        success: diagnostics.verification.success
      });

      if (diagnostics.stakeStatus) {
        const threshold = validateStakeThreshold(diagnostics.stakeStatus);
        const penaltyDisplay =
          diagnostics.stakeStatus.slashingPenalty === null
            ? 'N/A'
            : formatTokenAmount(diagnostics.stakeStatus.slashingPenalty);
        console.table({
          minimumStake: diagnostics.stakeStatus.minimumStake
            ? formatTokenAmount(diagnostics.stakeStatus.minimumStake)
            : 'N/A',
          operatorStake: diagnostics.stakeStatus.operatorStake
            ? formatTokenAmount(diagnostics.stakeStatus.operatorStake)
            : 'N/A',
          slashingPenalty: penaltyDisplay,
          lastHeartbeat: diagnostics.stakeStatus.lastHeartbeat?.toString() ?? 'N/A',
          active: diagnostics.stakeStatus.active,
          healthy: threshold?.meets ?? 'unknown'
        });
        if (diagnostics.stakeEvaluation) {
          const evaluation = diagnostics.stakeEvaluation;
          const deficitDisplay =
            evaluation.deficit === null || evaluation.deficit === undefined
              ? 'N/A'
              : formatTokenAmount(evaluation.deficit);
          console.table({
            meetsMinimum: evaluation.meets ?? 'unknown',
            deficit: deficitDisplay,
            penaltyActive: evaluation.penaltyActive,
            heartbeatAgeSeconds: evaluation.heartbeatAgeSeconds ?? 'N/A',
            heartbeatStale: evaluation.heartbeatStale ?? 'N/A',
            shouldPause: evaluation.shouldPause ?? 'N/A',
            recommendedAction: evaluation.recommendedAction
          });
        }
      }

      if (diagnostics.rewardsProjection) {
        console.table({
          projectedPool: formatTokenAmount(diagnostics.rewardsProjection.pool),
          operatorShare: formatTokenAmount(diagnostics.rewardsProjection.operatorPortion),
          operatorShareBps: diagnostics.rewardsProjection.operatorShareBps,
          validatorShareBps: diagnostics.rewardsProjection.validatorShareBps ?? 'N/A',
          treasuryShareBps: diagnostics.rewardsProjection.treasuryShareBps ?? 'N/A'
        });
        if (diagnostics.rewardsProjection.roleShares) {
          console.log(chalk.gray('Role share telemetry'));
          const shareRows = Object.entries(diagnostics.rewardsProjection.roleShares).map(([role, share]) => ({
            role,
            shareBps: share
          }));
          console.table(shareRows);
        }
      }

      if (diagnostics.ownerDirectives) {
        const directives = diagnostics.ownerDirectives;
        console.log(chalk.bold(`Owner Control Directives [${directives.priority.toUpperCase()}]`));
        if (directives.actions.length > 0) {
          const actionRows = directives.actions.map((action, index) => ({
            '#': index + 1,
            type: action.type,
            level: action.level,
            reason: action.reason,
            to: action.tx?.to ?? 'n/a',
            method: action.tx?.method ?? (action.tx?.data ? 'call' : 'n/a'),
            amount:
              action.formattedAmount ??
              (typeof action.amount === 'bigint'
                ? `${formatTokenAmount(action.amount, AGIALPHA_TOKEN_DECIMALS)} ${AGIALPHA_TOKEN_SYMBOL}`
                : 'n/a')
          }));
          console.table(actionRows);
        } else {
          console.log(chalk.gray('No actionable transactions derived.'));
        }
        if (directives.notices.length > 0) {
          directives.notices.forEach((notice) => {
            console.log(chalk.yellow(`⚠️  ${notice}`));
          });
        }
      }

      if (options.metricsPort) {
        await launchMonitoring({
          port: Number(options.metricsPort),
          stakeStatus: diagnostics.stakeStatus,
          performance: diagnostics.performance,
          runtimeMode: diagnostics.runtimeMode,
          logger,
          networkMetrics
        });
        console.log(`Metrics available on :${options.metricsPort}/metrics`);
      }
    } catch (error) {
      logger.error(error, 'Diagnostics failed');
      if (error?.details?.nodeName) {
        const details = error.details;
        console.error(chalk.red(`ENS verification mismatch for ${details.nodeName}`));
        console.table({
          expected: details.expectedAddress,
          resolved: details.resolvedAddress,
          registry: details.registryOwner,
          wrapper: details.wrapperOwner,
          matches: JSON.stringify(details.matches)
        });
      }
      process.exitCode = 1;
    }
  });

program
  .command('monitor')
  .description('Continuously run diagnostics, refresh Prometheus metrics, and honour offline snapshots')
  .option('-l, --label <label>', 'ENS label for the node')
  .option('-a, --address <address>', 'Operator address')
  .option('--rpc <url>', 'RPC endpoint URL')
  .option('--stake-manager <address>', 'StakeManager contract address')
  .option('--incentives <address>', 'PlatformIncentives contract address')
  .option('--reward-engine <address>', 'RewardEngine contract address for share governance')
  .option('--job-registry <address>', 'JobRegistry contract address')
  .option('--identity-registry <address>', 'IdentityRegistry contract address')
  .option('--system-pause <address>', 'System pause contract address for owner overrides')
  .option('--desired-minimum <amount>', 'Desired minimum stake floor in $AGIALPHA (decimal)')
  .option('--auto-resume', 'Generate resume transaction when the stake posture is healthy')
  .option('--operator-share-bps <bps>', 'Desired operator global share (basis points)')
  .option('--validator-share-bps <bps>', 'Desired validator global share (basis points)')
  .option('--treasury-share-bps <bps>', 'Desired treasury global share (basis points)')
  .option('--desired-job-registry <address>', 'Desired StakeManager job registry target address')
  .option('--desired-identity-registry <address>', 'Desired StakeManager identity registry target address')
  .option('--desired-validation-module <address>', 'Desired JobRegistry validation module address')
  .option('--desired-reputation-module <address>', 'Desired JobRegistry reputation module address')
  .option('--desired-dispute-module <address>', 'Desired JobRegistry dispute module address')
  .option('--network-size-preset <preset>', 'PubSub mesh preset: small|medium|large')
  .option(
    '--role-share <role=bps>',
    'Role share target definition (repeatable). Example: guardian=250',
    collectRoleShareTargets,
    {}
  )
  .option('--projected-rewards <amount>', 'Projected reward pool for the next epoch (decimal)')
  .option('--metrics-port <port>', 'Expose Prometheus metrics on the specified port')
  .option('--offline-snapshot <path>', 'Use offline snapshot JSON when RPC connectivity is unavailable')
  .option('--interval <seconds>', 'Seconds between diagnostic refreshes', '60')
  .action(async (options) => {
    const logger = pino({ level: 'info', name: 'monitor' });
    try {
      const intervalSeconds = Number.parseInt(options.interval, 10);
      if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
        throw new Error('Interval must be a positive integer number of seconds');
      }

      const configOverrides = {
        RPC_URL: options.rpc,
        NODE_LABEL: options.label,
        OPERATOR_ADDRESS: options.address,
        STAKE_MANAGER_ADDRESS: options.stakeManager,
        PLATFORM_INCENTIVES_ADDRESS: options.incentives,
        REWARD_ENGINE_ADDRESS: options.rewardEngine,
        JOB_REGISTRY_ADDRESS: options.jobRegistry,
        IDENTITY_REGISTRY_ADDRESS: options.identityRegistry,
        SYSTEM_PAUSE_ADDRESS: options.systemPause,
        DESIRED_MINIMUM_STAKE: options.desiredMinimum,
        AUTO_RESUME: options.autoResume,
        METRICS_PORT: options.metricsPort,
        DESIRED_OPERATOR_SHARE_BPS: options.operatorShareBps,
        DESIRED_VALIDATOR_SHARE_BPS: options.validatorShareBps,
        DESIRED_TREASURY_SHARE_BPS: options.treasuryShareBps,
        DESIRED_JOB_REGISTRY_ADDRESS: options.desiredJobRegistry,
        DESIRED_IDENTITY_REGISTRY_ADDRESS: options.desiredIdentityRegistry,
        DESIRED_VALIDATION_MODULE_ADDRESS: options.desiredValidationModule,
        DESIRED_REPUTATION_MODULE_ADDRESS: options.desiredReputationModule,
        DESIRED_DISPUTE_MODULE_ADDRESS: options.desiredDisputeModule,
        NETWORK_SIZE_PRESET: options.networkSizePreset,
        ROLE_SHARE_TARGETS:
          options.roleShare && Object.keys(options.roleShare).length > 0 ? options.roleShare : undefined
      };

      const config = loadConfig(
        Object.fromEntries(Object.entries(configOverrides).filter(([, value]) => value !== undefined))
      );

      const projectedRewards = options.projectedRewards ?? process.env.PROJECTED_REWARDS ?? null;
      const offlineSnapshotPath = options.offlineSnapshot ?? process.env.OFFLINE_SNAPSHOT_PATH ?? null;

      const monitor = await startMonitorLoop({
        config,
        intervalSeconds,
        projectedRewards,
        offlineSnapshotPath,
        logger
      });

      const gracefulShutdown = async () => {
        logger.info('Shutting down monitor loop');
        await monitor.stop();
        process.exit(0);
      };

      process.on('SIGINT', gracefulShutdown);
      process.on('SIGTERM', gracefulShutdown);

      await monitor.loopPromise;
    } catch (error) {
      logger.error(error, 'Monitor loop failed');
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    }
  });

program
  .command('container')
  .description(
    'Bootstrap container deployment: verify ENS, evaluate stake posture, and launch the monitoring loop'
  )
  .option('--skip-monitor', 'Run diagnostics only and exit')
  .option('--once', 'Run a single monitor iteration then exit')
  .option('--interval <seconds>', 'Seconds between diagnostic refreshes', '60')
  .option('--rpc <url>', 'RPC endpoint URL override')
  .option('-l, --label <label>', 'ENS label override')
  .option('-a, --address <address>', 'Operator address override')
  .option('--stake-manager <address>', 'StakeManager contract address override')
  .option('--incentives <address>', 'PlatformIncentives contract address override')
  .option('--reward-engine <address>', 'RewardEngine contract address override')
  .option('--job-registry <address>', 'JobRegistry contract address override')
  .option('--identity-registry <address>', 'IdentityRegistry contract address override')
  .option('--system-pause <address>', 'System pause contract address override')
  .option('--desired-minimum <amount>', 'Desired minimum stake floor in $AGIALPHA (decimal)')
  .option('--auto-resume', 'Generate resume transaction when the stake posture is healthy')
  .option('--operator-share-bps <bps>', 'Desired operator global share (basis points) override')
  .option('--validator-share-bps <bps>', 'Desired validator global share (basis points) override')
  .option('--treasury-share-bps <bps>', 'Desired treasury global share (basis points) override')
  .option('--desired-job-registry <address>', 'Desired StakeManager job registry target override')
  .option('--desired-identity-registry <address>', 'Desired StakeManager identity registry target override')
  .option('--desired-validation-module <address>', 'Desired JobRegistry validation module override')
  .option('--desired-reputation-module <address>', 'Desired JobRegistry reputation module override')
  .option('--desired-dispute-module <address>', 'Desired JobRegistry dispute module override')
  .option('--network-size-preset <preset>', 'PubSub mesh preset: small|medium|large')
  .option(
    '--role-share <role=bps>',
    'Role share target definition (repeatable). Example: guardian=250',
    collectRoleShareTargets,
    {}
  )
  .option('--metrics-port <port>', 'Expose Prometheus metrics on the specified port')
  .option('--api-port <port>', 'Expose the agent REST API on the specified port')
  .option('--projected-rewards <amount>', 'Projected reward pool for the next epoch (decimal)')
  .option('--offline-snapshot <path>', 'Use offline snapshot JSON when RPC connectivity is unavailable')
  .option('--offline-mode', 'Force local/offline intelligence runtime')
  .option('--auto-stake', 'Automatically broadcast stake activation when a deficit is detected')
  .option('--no-interactive-stake', 'Disable interactive staking prompts during container bootstrap')
  .option('--stake-amount <amount>', 'Override the stake amount when auto activation is enabled')
  .option('--private-key <key>', 'Operator private key used for stake activation')
  .action(async (options) => {
    const logger = pino({ level: 'info', name: 'container' });
    try {
      const intervalSeconds = Number.parseInt(options.interval ?? '60', 10);
      if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
        throw new Error('Interval must be a positive integer number of seconds');
      }

      const configOverrides = {
        RPC_URL: options.rpc,
        NODE_LABEL: options.label,
        OPERATOR_ADDRESS: options.address,
        STAKE_MANAGER_ADDRESS: options.stakeManager,
        PLATFORM_INCENTIVES_ADDRESS: options.incentives,
        REWARD_ENGINE_ADDRESS: options.rewardEngine,
        JOB_REGISTRY_ADDRESS: options.jobRegistry,
        IDENTITY_REGISTRY_ADDRESS: options.identityRegistry,
        SYSTEM_PAUSE_ADDRESS: options.systemPause,
        DESIRED_MINIMUM_STAKE: options.desiredMinimum,
        AUTO_RESUME: options.autoResume,
        DESIRED_OPERATOR_SHARE_BPS: options.operatorShareBps,
        DESIRED_VALIDATOR_SHARE_BPS: options.validatorShareBps,
        DESIRED_TREASURY_SHARE_BPS: options.treasuryShareBps,
        DESIRED_JOB_REGISTRY_ADDRESS: options.desiredJobRegistry,
        DESIRED_IDENTITY_REGISTRY_ADDRESS: options.desiredIdentityRegistry,
        DESIRED_VALIDATION_MODULE_ADDRESS: options.desiredValidationModule,
        DESIRED_REPUTATION_MODULE_ADDRESS: options.desiredReputationModule,
        DESIRED_DISPUTE_MODULE_ADDRESS: options.desiredDisputeModule,
        NETWORK_SIZE_PRESET: options.networkSizePreset,
        METRICS_PORT: options.metricsPort,
        API_PORT: options.apiPort,
        AUTO_STAKE: options.autoStake,
        STAKE_AMOUNT: options.stakeAmount,
        INTERACTIVE_STAKE: options.interactiveStake,
        OPERATOR_PRIVATE_KEY: options.privateKey,
        OFFLINE_MODE: options.offlineMode,
        ROLE_SHARE_TARGETS:
          options.roleShare && Object.keys(options.roleShare).length > 0 ? options.roleShare : undefined
      };

      const projectedRewards = options.projectedRewards ?? process.env.PROJECTED_REWARDS ?? null;
      const offlineSnapshotPath = options.offlineSnapshot ?? process.env.OFFLINE_SNAPSHOT_PATH ?? null;
      const skipMonitor = Boolean(options.skipMonitor);
      const runOnce = Boolean(options.once);
      const maxIterations = runOnce ? 1 : Infinity;

      const result = await bootstrapContainer({
        overrides: configOverrides,
        skipMonitor,
        intervalSeconds,
        projectedRewards,
        offlineSnapshotPath,
        maxIterations,
        logger
      });

      if (skipMonitor) {
        return;
      }

      const { monitor, apiServer, validatorRuntime } = result;
      if (!monitor) {
        if (validatorRuntime?.loopPromise) {
          await validatorRuntime.loopPromise;
        }
        if (apiServer) {
          await apiServer.stop();
        }
        return;
      }

      const gracefulShutdown = async () => {
        logger.info('Shutting down container monitor loop');
        await monitor.stop();
        if (validatorRuntime) {
          await validatorRuntime.stop();
        }
        if (apiServer) {
          await apiServer.stop();
        }
        process.exit(0);
      };

      process.on('SIGINT', gracefulShutdown);
      process.on('SIGTERM', gracefulShutdown);

      await monitor.loopPromise;
      if (validatorRuntime) {
        await validatorRuntime.stop();
      }

      if (runOnce) {
        process.off('SIGINT', gracefulShutdown);
        process.off('SIGTERM', gracefulShutdown);
        await monitor.stop();
        if (apiServer) {
          await apiServer.stop();
        }
        if (validatorRuntime) {
          await validatorRuntime.stop();
        }
      }
    } catch (error) {
      logger.error(error, 'Container bootstrap failed');
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    }
  });

program
  .command('stake-activate')
  .description('Broadcast a stake activation transaction to PlatformIncentives')
  .requiredOption('-a, --amount <amount>', 'Amount of $AGIALPHA to stake (decimal)')
  .requiredOption('-k, --private-key <key>', 'Operator private key (0x...)')
  .requiredOption('-i, --incentives <address>', 'PlatformIncentives contract address')
  .option('--rpc <url>', 'Ethereum RPC endpoint to use for the transaction')
  .action(async (options) => {
    const logger = pino({ level: 'info', name: 'stake-activate' });
    try {
      const rpcUrl = options.rpc ?? process.env.RPC_URL ?? 'https://rpc.ankr.com/eth';
      await acknowledgeStakeAndActivate({
        rpcUrl,
        privateKey: options.privateKey,
        incentivesAddress: options.incentives,
        amount: options.amount,
        logger
      });
      logger.info({ amount: options.amount }, 'Stake activation completed');
    } catch (error) {
      logger.error(error, 'Stake activation command failed');
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    }
  });

program
  .command('reward-share')
  .description('Calculate operator share of a reward pool')
  .requiredOption('-t, --total <amount>', 'Total reward pool amount (decimal)')
  .option('-b, --bps <bps>', 'Share in basis points (default 1500)', '1500')
  .option('-d, --decimals <decimals>', 'Token decimals', '18')
  .action((options) => {
    try {
      const share = calculateRewardShare({
        totalRewards: options.total,
        shareBps: Number.parseInt(options.bps, 10),
        decimals: Number.parseInt(options.decimals, 10)
      });
      console.log(`Operator share: ${formatTokenAmount(share, Number(options.decimals))}`);
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    }
  });

program
  .command('reward-distribution')
  .description('Simulate thermodynamic reward split across operator, validators, and treasury')
  .requiredOption('-t, --total <amount>', 'Total reward pool amount (decimal)')
  .requiredOption('-s, --stake <amount>', 'Operator stake amount (decimal)')
  .requiredOption('-T, --total-stake <amount>', 'Total active stake across operators (decimal)')
  .option('-f, --floor-bps <bps>', 'Operator floor share in basis points', '1500')
  .option('--validator-bps <bps>', 'Validator share in basis points', '7500')
  .option('--treasury-bps <bps>', 'Treasury share in basis points', '1000')
  .option('-d, --decimals <decimals>', 'Token decimals', '18')
  .action((options) => {
    try {
      const decimals = Number.parseInt(options.decimals, 10);
      const distribution = splitRewardPool({
        totalRewards: options.total,
        operatorStake: options.stake,
        totalStake: options.totalStake,
        operatorFloorBps: Number.parseInt(options.floorBps, 10),
        validatorShareBps: Number.parseInt(options.validatorBps, 10),
        treasuryShareBps: Number.parseInt(options.treasuryBps, 10),
        decimals
      });

      console.log(chalk.bold('Thermodynamic reward distribution'));
      console.table({
        operatorFloor: formatTokenAmount(distribution.operator.floor, decimals),
        operatorWeighted: formatTokenAmount(distribution.operator.weighted, decimals),
        operatorTotal: formatTokenAmount(distribution.operator.total, decimals),
        validator: formatTokenAmount(distribution.validator, decimals),
        treasury: formatTokenAmount(distribution.treasury, decimals)
      });
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    }
  });

const oracle = program.command('oracle').description('Oracle export and bridge tooling');

oracle
  .command('export-epoch')
  .description('Export deterministic α-WU payload for an epoch window')
  .requiredOption('--from <iso>', 'Epoch start (ISO timestamp)')
  .requiredOption('--to <iso>', 'Epoch end (ISO timestamp)')
  .option('--epoch-id <id>', 'Epoch identifier override')
  .option('--out <path>', 'File destination (defaults to stdout)')
  .action((options) => {
    try {
      const payload = buildEpochPayload({
        epochId: options.epochId,
        fromTs: options.from,
        toTs: options.to
      });
      const serialized = `${JSON.stringify(payload, null, 2)}\n`;
      if (options.out) {
        fs.writeFileSync(options.out, serialized, 'utf8');
      } else {
        process.stdout.write(serialized);
      }
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    }
  });

const token = program.command('token').description('Canonical $AGIALPHA token authority console');

token
  .command('metadata')
  .description('Display canonical token metadata and enforcement status')
  .action(() => {
    try {
      const metadata = describeAgialphaToken();
      console.log(chalk.bold(`${metadata.symbol} token specification`));
      console.table({
        symbol: metadata.symbol,
        address: metadata.address,
        decimals: metadata.decimals,
        canonical: metadata.canonical
      });
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    }
  });

token
  .command('approve')
  .description('Encode an ERC-20 approve transaction for staking allowances')
  .requiredOption('-s, --spender <address>', 'Spender contract address (e.g. StakeManager)')
  .requiredOption('-a, --amount <amount>', 'Allowance amount in tokens or "max" for MaxUint256')
  .option('-t, --token <address>', 'Token contract address (defaults to canonical $AGIALPHA)')
  .option('-d, --decimals <decimals>', 'Token decimals', String(AGIALPHA_TOKEN_DECIMALS))
  .action((options) => {
    try {
      const decimals = Number.parseInt(options.decimals, 10);
      if (!Number.isFinite(decimals)) {
        throw new Error('decimals must be numeric');
      }
      const tokenAddress = options.token ?? AGIALPHA_TOKEN_CHECKSUM_ADDRESS;
      const tx = buildTokenApproveTx({
        spender: options.spender,
        amount: options.amount,
        tokenAddress,
        decimals
      });
      console.log('Approve transaction payload');
      console.table({
        token: tx.token,
        spender: tx.spender,
        amount: tx.amount.toString(),
        data: tx.data
      });
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    }
  });

token
  .command('allowance')
  .description('Read current ERC-20 allowance for an owner/spender pair')
  .requiredOption('-o, --owner <address>', 'Owner address that granted the allowance')
  .requiredOption('-s, --spender <address>', 'Spender contract address (e.g. StakeManager)')
  .option('--rpc <url>', 'RPC endpoint URL (defaults to config)')
  .option('-t, --token <address>', 'Token contract address (defaults to canonical $AGIALPHA)')
  .option('-d, --decimals <decimals>', 'Token decimals', String(AGIALPHA_TOKEN_DECIMALS))
  .action(async (options) => {
    const logger = pino({ level: 'info', name: 'token-allowance' });
    try {
      const overrides = { RPC_URL: options.rpc };
      if (options.token) {
        overrides.AGIALPHA_TOKEN_ADDRESS = options.token;
      }
      const config = loadConfig(overrides);
      const decimals = Number.parseInt(options.decimals ?? config.AGIALPHA_TOKEN_DECIMALS, 10);
      if (!Number.isFinite(decimals)) {
        throw new Error('decimals must be numeric');
      }
      const provider = createProvider(config.RPC_URL);
      const ownerAddress = normalizeTokenAddress(options.owner);
      const spenderAddress = normalizeTokenAddress(options.spender);
      const allowance = await getTokenAllowance({
        provider,
        owner: ownerAddress,
        spender: spenderAddress,
        tokenAddress: config.AGIALPHA_TOKEN_ADDRESS
      });
      const normalizedToken = normalizeTokenAddress(config.AGIALPHA_TOKEN_ADDRESS);
      console.log(chalk.bold('Current allowance state'));
      console.table({
        token: normalizedToken,
        owner: ownerAddress,
        spender: spenderAddress,
        allowance: allowance.toString(),
        formatted: formatTokenAmount(allowance, decimals)
      });
    } catch (error) {
      logger.error(error, 'Failed to read token allowance');
      process.exitCode = 1;
    }
  });

const proof = program.command('proof').description('On-chain job proof attestation and submission utilities');

proof
  .command('commit')
  .description('Derive deterministic proof commitment for a completed AGI job')
  .requiredOption('--job-id <id>', 'Job identifier or label')
  .requiredOption('--result <result>', 'Result payload (utf-8 string, JSON, or hex)')
  .option('--operator <address>', 'Operator address bound to the proof')
  .option('--timestamp <seconds>', 'Unix timestamp used for the commitment (defaults to current time)')
  .option('--metadata <metadata>', 'Supplemental metadata JSON, utf-8 string, or hex blob')
  .action((options) => {
    try {
      const metadata = parseMetadataOption(options.metadata);
      const proofPayload = createJobProof({
        jobId: options.jobId,
        result: options.result,
        operator: options.operator,
        timestamp: options.timestamp,
        metadata,
        resultUri: options.resultUri ?? ''
      });
      console.log(chalk.bold('Deterministic job proof commitment'));
      console.table({
        jobId: proofPayload.jobId,
        commitment: proofPayload.commitment,
        resultHash: proofPayload.resultHash,
        metadata: proofPayload.metadata,
        operator: proofPayload.operator,
        timestamp: proofPayload.timestamp.toString()
      });
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    }
  });

proof
  .command('submit-tx')
  .description('Encode JobRegistry.submitProof transaction payload')
  .requiredOption('--registry <address>', 'JobRegistry contract address')
  .requiredOption('--job-id <id>', 'Job identifier or label')
  .option('--result <result>', 'Result payload to derive the commitment (utf-8 string, JSON, or hex)')
  .option('--commitment <hash>', 'Pre-computed commitment (32-byte hex)')
  .option('--result-hash <hash>', 'Pre-computed result hash (32-byte hex)')
  .option('--operator <address>', 'Operator address used to bind the commitment')
  .option('--timestamp <seconds>', 'Unix timestamp used when generating the commitment')
  .option('--metadata <metadata>', 'Supplemental metadata JSON, utf-8 string, or hex blob')
  .option('--result-uri <uri>', 'Off-chain artifact URI for verifiers', '')
  .action((options) => {
    const logger = pino({ level: 'info', name: 'proof-submit' });
    try {
      const metadata = parseMetadataOption(options.metadata);
      let proofPayload;
      if (options.result) {
        proofPayload = createJobProof({
          jobId: options.jobId,
          result: options.result,
          operator: options.operator,
          timestamp: options.timestamp,
          metadata,
          resultUri: options.resultUri ?? ''
        });
      } else {
        if (!options.commitment) {
          throw new Error('commitment is required when result is not provided');
        }
        if (!options.resultHash) {
          throw new Error('resultHash is required when result is not provided');
        }
        proofPayload = {
          jobId: options.jobId,
          commitment: options.commitment,
          resultHash: options.resultHash,
          metadata
        };
      }
      const tx = buildProofSubmissionTx({
        jobRegistryAddress: options.registry,
        jobId: proofPayload.jobId,
        commitment: proofPayload.commitment,
        resultHash: proofPayload.resultHash,
        metadata: proofPayload.metadata,
        resultUri: options.resultUri
      });
      console.log('JobRegistry submitProof transaction payload');
      console.table({
        to: tx.to,
        jobId: tx.jobId,
        commitment: tx.commitment,
        resultHash: tx.resultHash,
        resultUri: tx.resultUri,
        metadata: tx.metadata,
        data: tx.data
      });
    } catch (error) {
      logger.error(error, 'Failed to build submitProof payload');
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    }
  });

const jobs = program.command('jobs').description('On-chain AGI Jobs lifecycle orchestration');

jobs
  .command('discover')
  .description('Scan the JobRegistry for open jobs and print a telemetry feed')
  .option('--registry <address>', 'JobRegistry contract address override')
  .option('--rpc <url>', 'RPC endpoint override')
  .option('--from-block <number>', 'Starting block height for the discovery window')
  .option('--blocks <number>', 'Override the discovery block range window')
  .option('--profile <name>', 'JobRegistry compatibility profile (v0, v2, or custom)')
  .option('--profile-config <json>', 'JSON overrides describing ABI/events/methods when using custom profiles')
  .option('--lifecycle-log-dir <path>', 'Directory for append-only lifecycle journal entries')
  .action(async (options) => {
    const logger = pino({ level: 'info', name: 'jobs-discover' });
    const config = loadConfig();
    let lifecycle;
    try {
      const blockRange = options.blocks ? Number.parseInt(options.blocks, 10) : undefined;
      const { lifecycle: jobLifecycle } = buildJobLifecycleFromConfig(
        config,
        {
          registry: options.registry,
          rpcUrl: options.rpc,
          discoveryBlockRange: blockRange,
          profile: options.profile,
          profileConfig: options.profileConfig,
          lifecycleLogDir: options.lifecycleLogDir
        },
        logger
      );
      lifecycle = jobLifecycle;
      const fromBlock = options.fromBlock ? Number.parseInt(options.fromBlock, 10) : undefined;
      const discovered = await jobLifecycle.discover({
        fromBlock: Number.isFinite(fromBlock) && fromBlock >= 0 ? fromBlock : undefined
      });
      if (!discovered.length) {
        console.log(chalk.yellow('No open jobs detected in the selected block window.'));
      } else {
        discovered.forEach((job) => {
          const reward = typeof job.reward === 'bigint' ? formatTokenAmount(job.reward) : String(job.reward ?? '0');
          const status = chalk.cyan(job.status ?? 'unknown');
          console.log(`${status} :: ${chalk.bold(job.jobId)} :: reward ${reward} ${AGIALPHA_TOKEN_SYMBOL}`);
          if (job.deadline) {
            const deadline = typeof job.deadline === 'bigint' ? job.deadline : BigInt(job.deadline ?? 0);
            if (deadline > 0n && deadline < BigInt(Number.MAX_SAFE_INTEGER)) {
              console.log(`  deadline: ${new Date(Number(deadline) * 1000).toISOString()}`);
            }
          }
          if (job.uri) {
            console.log(`  uri: ${job.uri}`);
          }
          if (Array.isArray(job.tags) && job.tags.length > 0) {
            console.log(`  tags: ${job.tags.join(', ')}`);
          }
        });
      }
    } catch (error) {
      logger.error(error, 'Job discovery failed');
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    } finally {
      lifecycle?.stop?.();
    }
  });

jobs
  .command('apply <jobId>')
  .description('Apply for a job using the configured ENS subdomain and staked identity')
  .option('--registry <address>', 'JobRegistry contract address override')
  .option('--rpc <url>', 'RPC endpoint override')
  .option('--subdomain <label>', 'ENS label override (defaults to NODE_LABEL)')
  .option('--proof <bytes>', 'Merkle proof bytes (hex string) for gated registries')
  .option('--private-key <hex>', 'Override private key used for signing the transaction')
  .option('--profile <name>', 'JobRegistry compatibility profile (v0, v2, or custom)')
  .option('--profile-config <json>', 'JSON overrides describing ABI/events/methods when using custom profiles')
  .option('--lifecycle-log-dir <path>', 'Directory for append-only lifecycle journal entries')
  .action(async (jobId, options) => {
    const logger = pino({ level: 'info', name: 'jobs-apply' });
    const config = loadConfig();
    let lifecycle;
    try {
      const { lifecycle: jobLifecycle } = buildJobLifecycleFromConfig(
        config,
        {
          registry: options.registry,
          rpcUrl: options.rpc,
          subdomain: options.subdomain,
          proof: options.proof,
          privateKey: options.privateKey,
          profile: options.profile,
          profileConfig: options.profileConfig,
          lifecycleLogDir: options.lifecycleLogDir
        },
        logger
      );
      lifecycle = jobLifecycle;
      const response = await jobLifecycle.apply(jobId, {
        subdomain: options.subdomain ?? config.NODE_LABEL,
        proof: options.proof
      });
      console.log(chalk.green(`Applied for job ${response.jobId}`));
      if (response.transactionHash) {
        console.log(`  tx: ${response.transactionHash}`);
      }
      console.log(`  method: ${response.method}`);
    } catch (error) {
      logger.error(error, 'Job application failed');
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    } finally {
      lifecycle?.stop?.();
    }
  });

jobs
  .command('submit <jobId>')
  .description('Submit completed work to the JobRegistry and emit deterministic commitments')
  .option('--registry <address>', 'JobRegistry contract address override')
  .option('--rpc <url>', 'RPC endpoint override')
  .option('--result <payload>', 'Inline result payload (utf-8, JSON, or hex)')
  .option('--result-file <path>', 'Path to file containing the result payload')
  .option('--result-uri <uri>', 'Off-chain URI for the published artifact')
  .option('--metadata <value>', 'Supplemental metadata JSON/utf-8/hex blob')
  .option('--metadata-file <path>', 'Path to supplemental metadata JSON file')
  .option('--timestamp <seconds>', 'Custom commitment timestamp (defaults to now)')
  .option('--subdomain <label>', 'ENS label override (defaults to NODE_LABEL)')
  .option('--proof <bytes>', 'Merkle proof bytes (hex string) for gated registries')
  .option('--private-key <hex>', 'Override private key used for signing the transaction')
  .option('--validator <address>', 'Validator address required when submitting against validation-aware registries')
  .option('--profile <name>', 'JobRegistry compatibility profile (v0, v2, or custom)')
  .option('--profile-config <json>', 'JSON overrides describing ABI/events/methods when using custom profiles')
  .option('--lifecycle-log-dir <path>', 'Directory for append-only lifecycle journal entries')
  .action(async (jobId, options) => {
    const logger = pino({ level: 'info', name: 'jobs-submit' });
    const config = loadConfig();
    let lifecycle;
    try {
      const resultPayload = resolveResultPayload({ result: options.result, resultFile: options.resultFile });
      if (resultPayload === undefined && options.resultUri === undefined) {
        throw new Error('Provide --result, --result-file, or --result-uri to derive a commitment.');
      }
      const metadataPayload = resolveMetadataPayload(options.metadata, options.metadataFile);
      let timestamp;
      if (options.timestamp !== undefined) {
        try {
          timestamp = BigInt(options.timestamp);
          if (timestamp < 0n) {
            throw new Error('timestamp must be non-negative');
          }
        } catch (error) {
          throw new Error(`Invalid timestamp: ${error.message}`);
        }
      }
      const { lifecycle: jobLifecycle } = buildJobLifecycleFromConfig(
        config,
        {
          registry: options.registry,
          rpcUrl: options.rpc,
          subdomain: options.subdomain,
          proof: options.proof,
          privateKey: options.privateKey,
          profile: options.profile,
          profileConfig: options.profileConfig,
          lifecycleLogDir: options.lifecycleLogDir
        },
        logger
      );
      lifecycle = jobLifecycle;
      const submission = await jobLifecycle.submitExecutorResult(jobId, {
        result: resultPayload ?? options.resultUri ?? '',
        resultUri: options.resultUri,
        metadata: metadataPayload,
        subdomain: options.subdomain ?? config.NODE_LABEL,
        proof: options.proof,
        timestamp,
        validator: options.validator
      });
      console.log(chalk.green(`Submitted result for job ${submission.jobId}`));
      if (submission.transactionHash) {
        console.log(`  tx: ${submission.transactionHash}`);
      }
      if (submission.commitment) {
        console.log(`  commitment: ${submission.commitment}`);
      }
      if (submission.resultHash) {
        console.log(`  resultHash: ${submission.resultHash}`);
      }
      if (submission.alphaWu) {
        console.log(`  α-WU signature: ${submission.alphaWu.attestor_sig}`);
      }
      console.log(`  method: ${submission.method}`);
    } catch (error) {
      logger.error(error, 'Job submission failed');
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    } finally {
      lifecycle?.stop?.();
    }
  });

jobs
  .command('finalize <jobId>')
  .description('Finalize a validated job and release escrowed $AGIALPHA rewards')
  .option('--registry <address>', 'JobRegistry contract address override')
  .option('--rpc <url>', 'RPC endpoint override')
  .option('--private-key <hex>', 'Override private key used for signing the transaction')
  .option('--validator <address>', 'Validator address required when finalizing against validator-aware registries')
  .option('--profile <name>', 'JobRegistry compatibility profile (v0, v2, or custom)')
  .option('--profile-config <json>', 'JSON overrides describing ABI/events/methods when using custom profiles')
  .option('--lifecycle-log-dir <path>', 'Directory for append-only lifecycle journal entries')
  .action(async (jobId, options) => {
    const logger = pino({ level: 'info', name: 'jobs-finalize' });
    const config = loadConfig();
    let lifecycle;
    try {
      const { lifecycle: jobLifecycle } = buildJobLifecycleFromConfig(
        config,
        {
          registry: options.registry,
          rpcUrl: options.rpc,
          privateKey: options.privateKey,
          profile: options.profile,
          profileConfig: options.profileConfig,
          lifecycleLogDir: options.lifecycleLogDir
        },
        logger
      );
      lifecycle = jobLifecycle;
      const result = await jobLifecycle.finalize(jobId, { validator: options.validator });
      console.log(chalk.green(`Finalized job ${result.jobId}`));
      if (result.transactionHash) {
        console.log(`  tx: ${result.transactionHash}`);
      }
      console.log(`  method: ${result.method}`);
    } catch (error) {
      logger.error(error, 'Job finalization failed');
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    } finally {
      lifecycle?.stop?.();
    }
  });

jobs
  .command('notify-validator <jobId>')
  .description('Signal the registry-assigned validator that results are ready for review')
  .requiredOption('--validator <address>', 'Validator address to notify')
  .option('--registry <address>', 'JobRegistry contract address override')
  .option('--rpc <url>', 'RPC endpoint override')
  .option('--private-key <hex>', 'Override private key used for signing the transaction')
  .option('--profile <name>', 'JobRegistry compatibility profile (v0, v2, or custom)')
  .option('--profile-config <json>', 'JSON overrides describing ABI/events/methods when using custom profiles')
  .option('--lifecycle-log-dir <path>', 'Directory for append-only lifecycle journal entries')
  .action(async (jobId, options) => {
    const logger = pino({ level: 'info', name: 'jobs-notify-validator' });
    const config = loadConfig();
    let lifecycle;
    try {
      const { lifecycle: jobLifecycle } = buildJobLifecycleFromConfig(
        config,
        {
          registry: options.registry,
          rpcUrl: options.rpc,
          privateKey: options.privateKey,
          profile: options.profile,
          profileConfig: options.profileConfig,
          lifecycleLogDir: options.lifecycleLogDir
        },
        logger
      );
      lifecycle = jobLifecycle;
      const result = await jobLifecycle.notifyValidator(jobId, options.validator);
      console.log(chalk.green(`Notified validator for job ${result.jobId}`));
      if (result.transactionHash) {
        console.log(`  tx: ${result.transactionHash}`);
      }
      console.log(`  method: ${result.method}`);
    } catch (error) {
      logger.error(error, 'Validator notification failed');
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    } finally {
      lifecycle?.stop?.();
    }
  });

jobs
  .command('alpha-kpi')
  .description('Render validator-weighted α-work unit KPIs from lifecycle telemetry')
  .option('--registry <address>', 'JobRegistry contract address override')
  .option('--rpc <url>', 'RPC endpoint override')
  .option('--profile <name>', 'JobRegistry compatibility profile (v0, v2, or custom)')
  .option('--profile-config <json>', 'JSON overrides describing ABI/events/methods when using custom profiles')
  .option('--windows <list>', 'Comma-separated window specifiers (e.g. 7d,30d,12h)')
  .option('--events <path>', 'JSON file of α-work unit events to ingest before reporting')
  .option('--lifecycle-log-dir <path>', 'Directory for append-only lifecycle journal entries')
  .action(async (options) => {
    const logger = pino({ level: 'info', name: 'jobs-alpha-kpi' });
    const config = loadConfig();
    let lifecycle;
    try {
      const { lifecycle: jobLifecycle } = buildJobLifecycleFromConfig(
        config,
        {
          registry: options.registry,
          rpcUrl: options.rpc,
          profile: options.profile,
          profileConfig: options.profileConfig,
          lifecycleLogDir: options.lifecycleLogDir
        },
        logger
      );
      lifecycle = jobLifecycle;

      if (options.events) {
        const rawEvents = parseJsonMaybe(loadFileContents(options.events));
        if (rawEvents && !Array.isArray(rawEvents)) {
          throw new Error('--events file must contain an array of α-work unit events');
        }
        (rawEvents ?? []).forEach((entry, index) => {
          if (!entry || typeof entry !== 'object') {
            logger.warn({ index }, 'Skipping malformed α-work unit event entry');
            return;
          }
          const { type, payload, ...rest } = entry;
          if (!type) {
            logger.warn({ index }, 'Skipping α-work unit event without type');
            return;
          }
          const normalizedPayload = payload && typeof payload === 'object' ? payload : rest;
          try {
            jobLifecycle.recordAlphaWorkUnitEvent(type, normalizedPayload, { emit: false });
          } catch (error) {
            logger.warn({ index, type }, error, 'Failed to ingest α-work unit event');
          }
        });
      }

      const windows = parseWindowList(options.windows);
      const metrics = jobLifecycle.getAlphaWorkUnitMetrics(
        windows && windows.length ? { windows } : {}
      );
      printAlphaWorkUnitMetrics(metrics);
    } catch (error) {
      logger.error(error, 'Failed to render α-work unit KPIs');
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    } finally {
      lifecycle?.stop?.();
    }
  });

const economics = program.command('economics').description('Economic self-optimization and reinvestment modelling');

economics
  .command('optimize')
  .description('Recommend a reinvestment ratio based on recent rewards and policy constraints')
  .requiredOption('--stake <amount>', 'Current staked amount (decimal)')
  .requiredOption('--rewards <amounts>', 'Comma-separated reward history (decimal amounts per epoch)')
  .option('--decimals <decimals>', 'Token decimals', '18')
  .option('--reinvest-options <bpsList>', 'Comma-separated reinvest options in basis points', '9000,8000,7000,6000,5000')
  .option('--min-buffer-bps <bps>', 'Minimum buffer requirement in basis points of average rewards', '2500')
  .option('--risk <bps>', 'Risk aversion weighting in basis points', '2500')
  .option('--upcoming <amounts>', 'Comma-separated upcoming obligations to cover (decimal amounts)')
  .action((options) => {
    try {
      const decimals = Number.parseInt(options.decimals, 10);
      const reinvestOptions = options.reinvestOptions
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => Number.parseInt(value, 10));
      const rewardHistory = options.rewards
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      const upcomingObligations = options.upcoming
        ? options.upcoming
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
        : [];

      const plan = optimizeReinvestmentStrategy({
        currentStake: options.stake,
        rewardHistory,
        reinvestOptions,
        upcomingObligations,
        decimals,
        minimumBufferBps: Number.parseInt(options.minBufferBps, 10),
        riskAversionBps: Number.parseInt(options.risk, 10)
      });

      const summary = summarizeStrategy(plan);

      console.log(
        chalk.bold(
          `Recommended reinvestment: ${summary.reinvestBps} bps (${formatTokenAmount(
            plan.recommended.reinvestAmount,
            decimals
          )})`
        )
      );

      console.table({
        averageReward: formatTokenAmount(plan.historyStats.average, decimals),
        bufferRequired: formatTokenAmount(plan.bufferRequirement.required, decimals),
        recommendedBuffer: formatTokenAmount(plan.recommended.bufferAmount, decimals),
        projectedStake: formatTokenAmount(plan.recommended.projectedStake, decimals),
        bufferEpochs: summary.bufferEpochs.toString(),
        meetsPolicy: summary.meetsMinimumBuffer
      });

      if (plan.upcomingObligations.length > 0) {
        console.log(chalk.cyan('Upcoming obligations')); 
        plan.upcomingObligations.forEach((obligation, index) => {
          console.log(`  [${index + 1}] ${formatTokenAmount(obligation, decimals)}`);
        });
      }

      console.log(chalk.gray('Strategy comparison (basis points)'));
      console.table(
        plan.strategies.map((strategy) => ({
          reinvestBps: strategy.reinvestBps,
          reinvest: formatTokenAmount(strategy.reinvestAmount, decimals),
          buffer: formatTokenAmount(strategy.bufferAmount, decimals),
          score: strategy.score.toString(),
          bufferShortfall: strategy.bufferShortfall.toString(),
          obligationsShortfall: strategy.obligationsShortfall.toString()
        }))
      );
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    }
  });

economics
  .command('productivity')
  .description('Summarize α-Productivity Index, burn ratio, and wage curve for recent epochs')
  .option('--reports <file>', 'Path to JSON file containing epoch productivity reports')
  .option('--alpha <values>', 'Comma-separated α-WU totals per epoch (decimal values)')
  .option('--slo <values>', 'Comma-separated SLO pass ratios (0-1) aligned with α-WU values')
  .option('--quality <values>', 'Comma-separated validator quality scores (0-1)')
  .option('--emissions <values>', 'Comma-separated token emission amounts per epoch (decimal)')
  .option('--burns <values>', 'Comma-separated token burn amounts per epoch (decimal)')
  .option('--circulating <amount>', 'Circulating $AGIALPHA supply for Synthetic Labor Yield (decimal)')
  .option('--decimals <decimals>', 'Token decimals', '18')
  .action((options) => {
    try {
      const decimals = Number.parseInt(options.decimals, 10);
      if (!Number.isFinite(decimals) || Number.isNaN(decimals)) {
        throw new Error('--decimals must be a valid integer');
      }

      const reports = buildProductivityReports(options);
      const index = calculateAlphaProductivityIndex({
        reports,
        decimals,
        circulatingSupply: options.circulating
      });

      console.log(
        chalk.bold(
          `Total α-WU: ${formatTokenAmount(index.totalAlphaWu, decimals)} · Average α-WU: ${formatTokenAmount(
            index.averageAlphaWu,
            decimals
          )}`
        )
      );

      console.table({
        epochs: index.epochCount,
        growth: formatBps(index.growthBps),
        averageSLO: formatOptionalRatio(index.averages.sloPass),
        averageQuality: formatOptionalRatio(index.averages.quality)
      });

      console.log(chalk.cyan('Token Flows'));
      console.table({
        emitted: formatTokenAmount(index.totals.tokensEmitted, decimals),
        burned: formatTokenAmount(index.totals.tokensBurned, decimals),
        net: formatTokenAmount(index.totals.netTokens, decimals),
        burnToEmission: formatBps(index.burnToEmissionBps),
        wagePerAlpha: index.wagePerAlpha ? formatTokenAmount(index.wagePerAlpha, decimals) : 'n/a',
        syntheticLaborYield: index.syntheticLaborYield
          ? formatTokenAmount(index.syntheticLaborYield, decimals)
          : 'n/a'
      });

      console.log(chalk.gray('Epoch Contributions'));
      console.table(
        index.contributions.map((entry) => ({
          epoch: entry.epoch,
          alphaWu: formatTokenAmount(entry.alphaWu, decimals),
          sloPass: formatOptionalRatio(entry.sloPass),
          quality: formatOptionalRatio(entry.quality),
          emitted: entry.tokensEmitted !== undefined
            ? formatTokenAmount(entry.tokensEmitted, decimals)
            : 'n/a',
          burned: entry.tokensBurned !== undefined
            ? formatTokenAmount(entry.tokensBurned, decimals)
            : 'n/a'
        }))
      );
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    }
  });

program
  .command('label-hash')
  .description('Derive ENS labelhash and node name for a label')
  .requiredOption('-l, --label <label>', 'ENS label')
  .option('-p, --parent <domain>', 'Parent domain', 'alpha.node.agi.eth')
  .action((options) => {
    const nodeName = buildNodeNameFromLabel(options.label, options.parent);
    console.log(nodeName);
  });

const governance = program.command('governance').description('Owner supremacy governance utilities');

governance
  .command('catalog')
  .description('List owner-only contract functions mapped to builders')
  .action(() => {
    const catalog = getOwnerFunctionCatalog();
    for (const [contract, entries] of Object.entries(catalog)) {
      console.log(chalk.bold(contract));
      console.table(entries.map((entry) => ({ signature: entry.signature })));
    }
  });

governance
  .command('surfaces')
  .description('Summarize owner control surfaces, coverage, and builder mappings')
  .option('--json', 'Emit JSON manifest for downstream tooling')
  .action((options) => {
    const surfaces = getOwnerControlSurfaces();
    if (options.json) {
      console.log(JSON.stringify(surfaces, null, 2));
      return;
    }
    const table = surfaces.map((surface) => {
      const percent = surface.coverage.percent;
      const formattedPercent = Number.isFinite(percent)
        ? `${percent % 1 === 0 ? percent.toFixed(0) : percent.toFixed(2)}%`
        : 'n/a';
      return {
        Surface: surface.label,
        Contract: surface.contract,
        Coverage: `${surface.coverage.covered}/${surface.coverage.total} (${formattedPercent})`,
        Methods: surface.methods.join(', '),
        Builders: surface.builders.join(', ')
      };
    });
    console.table(table);
  });

addCommonGovernanceOptions(
  governance
    .command('node-register')
    .description('Register a node identity, operator, and metadata in the NodeRegistry')
    .requiredOption('--registry <address>', 'NodeRegistry contract address')
    .requiredOption('--node-id <id>', 'Node identifier (hex bytes32 or label to hash)')
    .requiredOption('--operator <address>', 'Operator address controlling the node')
    .option('--metadata <uri>', 'Metadata URI or descriptor for the node dossier')
    .option('--metadata-file <path>', 'Path to file containing metadata URI/dossier reference')
).action((options) => {
  try {
    const metadataSource = options.metadataFile ? loadFileContents(options.metadataFile) : options.metadata;
    if (!metadataSource || !metadataSource.trim()) {
      throw new Error('Provide --metadata or --metadata-file with a non-empty value');
    }
    const tx = buildNodeRegistrationTx({
      nodeRegistryAddress: options.registry,
      nodeId: options.nodeId,
      operatorAddress: options.operator,
      metadataURI: metadataSource.trim()
    });
    emitGovernanceResult(tx, options);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  }
});

addCommonGovernanceOptions(
  governance
    .command('node-metadata')
    .description('Update or rotate NodeRegistry metadata URI for a node')
    .requiredOption('--registry <address>', 'NodeRegistry contract address')
    .requiredOption('--node-id <id>', 'Node identifier (hex bytes32 or label)')
    .option('--metadata <uri>', 'New metadata URI')
    .option('--metadata-file <path>', 'Path to file containing metadata URI')
    .option('--current <uri>', 'Current metadata URI for diff context')
).action((options) => {
  try {
    const metadataSource = options.metadataFile ? loadFileContents(options.metadataFile) : options.metadata;
    if (!metadataSource || !metadataSource.trim()) {
      throw new Error('Provide --metadata or --metadata-file with a non-empty value');
    }
    const tx = buildNodeMetadataTx({
      nodeRegistryAddress: options.registry,
      nodeId: options.nodeId,
      metadataURI: metadataSource.trim(),
      currentMetadataURI: options.current ?? undefined
    });
    emitGovernanceResult(tx, options);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  }
});

addCommonGovernanceOptions(
  governance
    .command('node-status')
    .description('Toggle NodeRegistry active status for a node')
    .requiredOption('--registry <address>', 'NodeRegistry contract address')
    .requiredOption('--node-id <id>', 'Node identifier (hex bytes32 or label)')
    .requiredOption('--active <bool>', 'Active flag (true/false)')
    .option('--current <bool>', 'Current active flag for diff context')
).action((options) => {
  try {
    const active = parseBooleanOption(options.active, 'active');
    const current = options.current !== undefined ? parseBooleanOption(options.current, 'current') : undefined;
    const tx = buildNodeStatusTx({
      nodeRegistryAddress: options.registry,
      nodeId: options.nodeId,
      active,
      currentStatus: current ?? undefined
    });
    emitGovernanceResult(tx, options);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  }
});

addCommonGovernanceOptions(
  governance
    .command('node-operator')
    .description('Authorize or revoke operator addresses in the NodeRegistry')
    .requiredOption('--registry <address>', 'NodeRegistry contract address')
    .requiredOption('--operator <address>', 'Operator address to update')
    .requiredOption('--allowed <bool>', 'Allowed flag (true/false)')
    .option('--current <bool>', 'Current allowed state for diff context')
).action((options) => {
  try {
    const allowed = parseBooleanOption(options.allowed, 'allowed');
    const current = options.current !== undefined ? parseBooleanOption(options.current, 'current') : undefined;
    const tx = buildNodeOperatorTx({
      nodeRegistryAddress: options.registry,
      operatorAddress: options.operator,
      allowed,
      currentAllowed: current ?? undefined
    });
    emitGovernanceResult(tx, options);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  }
});

addCommonGovernanceOptions(
  governance
    .command('node-workmeter')
    .description('Bind the NodeRegistry to a WorkMeter contract')
    .requiredOption('--registry <address>', 'NodeRegistry contract address')
    .requiredOption('--work-meter <address>', 'WorkMeter contract address')
    .option('--current <address>', 'Current WorkMeter address for diff context')
).action((options) => {
  try {
    const tx = buildNodeWorkMeterTx({
      nodeRegistryAddress: options.registry,
      workMeterAddress: options.workMeter,
      currentWorkMeter: options.current ?? undefined
    });
    emitGovernanceResult(tx, options);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  }
});

addCommonGovernanceOptions(
  governance
    .command('workmeter-validator')
    .description('Authorize or disable WorkMeter validator addresses')
    .requiredOption('--work-meter <address>', 'WorkMeter contract address')
    .requiredOption('--validator <address>', 'Validator address to update')
    .requiredOption('--allowed <bool>', 'Allowed flag (true/false)')
    .option('--current <bool>', 'Current allowed state for diff context')
).action((options) => {
  try {
    const allowed = parseBooleanOption(options.allowed, 'allowed');
    const current = options.current !== undefined ? parseBooleanOption(options.current, 'current') : undefined;
    const tx = buildWorkMeterValidatorTx({
      workMeterAddress: options.workMeter,
      validatorAddress: options.validator,
      allowed,
      currentAllowed: current ?? undefined
    });
    emitGovernanceResult(tx, options);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  }
});

addCommonGovernanceOptions(
  governance
    .command('workmeter-oracle')
    .description('Authorize or disable WorkMeter oracle addresses')
    .requiredOption('--work-meter <address>', 'WorkMeter contract address')
    .requiredOption('--oracle <address>', 'Oracle address to update')
    .requiredOption('--allowed <bool>', 'Allowed flag (true/false)')
    .option('--current <bool>', 'Current allowed state for diff context')
).action((options) => {
  try {
    const allowed = parseBooleanOption(options.allowed, 'allowed');
    const current = options.current !== undefined ? parseBooleanOption(options.current, 'current') : undefined;
    const tx = buildWorkMeterOracleTx({
      workMeterAddress: options.workMeter,
      oracleAddress: options.oracle,
      allowed,
      currentAllowed: current ?? undefined
    });
    emitGovernanceResult(tx, options);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  }
});

addCommonGovernanceOptions(
  governance
    .command('workmeter-window')
    .description('Reconfigure WorkMeter submission window in seconds')
    .requiredOption('--work-meter <address>', 'WorkMeter contract address')
    .requiredOption('--seconds <seconds>', 'Submission window in seconds')
    .option('--current <seconds>', 'Current window for diff context')
).action((options) => {
  try {
    const windowSeconds = parseBigIntOption(options.seconds, 'seconds');
    if (windowSeconds === undefined) {
      throw new Error('seconds is required');
    }
    const current = options.current !== undefined ? parseBigIntOption(options.current, 'current seconds') : undefined;
    const tx = buildWorkMeterWindowTx({
      workMeterAddress: options.workMeter,
      submissionWindowSeconds: windowSeconds,
      currentWindowSeconds: current ?? undefined
    });
    emitGovernanceResult(tx, options);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  }
});

addCommonGovernanceOptions(
  governance
    .command('workmeter-productivity')
    .description('Assign ProductivityIndex contract to WorkMeter outputs')
    .requiredOption('--work-meter <address>', 'WorkMeter contract address')
    .requiredOption('--index <address>', 'ProductivityIndex contract address')
    .option('--current <address>', 'Current productivity index address for diff context')
).action((options) => {
  try {
    const tx = buildWorkMeterProductivityIndexTx({
      workMeterAddress: options.workMeter,
      productivityIndexAddress: options.index,
      currentProductivityIndex: options.current ?? undefined
    });
    emitGovernanceResult(tx, options);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  }
});

addCommonGovernanceOptions(
  governance
    .command('workmeter-submit')
    .description('Encode WorkMeter usage submission for α-WU accounting')
    .requiredOption('--work-meter <address>', 'WorkMeter contract address')
    .requiredOption('--report-id <id>', 'Usage report identifier (hex bytes32 or label)')
    .requiredOption('--node-id <id>', 'Node identifier (hex bytes32 or label)')
    .requiredOption('--gpu-seconds <value>', 'GPU seconds consumed (decimal)')
    .requiredOption('--gflops <value>', 'Normalized GFLOPS (decimal)')
    .requiredOption('--model-tier <value>', 'Model tier multiplier (decimal)')
    .requiredOption('--slo <ratio>', 'SLO pass ratio (0-1)')
    .requiredOption('--quality <ratio>', 'Quality validation ratio (0-1)')
    .option('--usage-hash <hash>', 'Precomputed usage hash (32-byte hex); defaults to deterministic digest')
    .option('--metric-decimals <decimals>', 'Metric precision decimals', '6')
).action((options) => {
  try {
    const metricDecimals = parseIntegerOption(options.metricDecimals, 'metric-decimals') ?? 6;
    const tx = buildWorkMeterUsageTx({
      workMeterAddress: options.workMeter,
      reportId: options.reportId,
      nodeId: options.nodeId,
      gpuSeconds: options.gpuSeconds,
      gflopsNorm: options.gflops,
      modelTier: options.modelTier,
      sloPass: options.slo,
      quality: options.quality,
      usageHash: options.usageHash ?? undefined,
      metricDecimals
    });
    emitGovernanceResult(tx, options);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  }
});

addCommonGovernanceOptions(
  governance
    .command('productivity-record')
    .description('Record epoch productivity totals and token flows')
    .requiredOption('--index <address>', 'ProductivityIndex contract address')
    .requiredOption('--epoch <number>', 'Epoch number (integer)')
    .requiredOption('--alpha <amount>', 'α-WU total for the epoch (decimal)')
    .option('--emitted <amount>', 'Tokens emitted for the epoch (decimal)', '0')
    .option('--burned <amount>', 'Tokens burned for the epoch (decimal)', '0')
    .option('--decimals <decimals>', 'Token decimals for α-WU and token amounts', '18')
).action((options) => {
  try {
    const decimals = parseIntegerOption(options.decimals, 'decimals') ?? 18;
    const epoch = parseBigIntOption(options.epoch, 'epoch');
    if (epoch === undefined) {
      throw new Error('epoch is required');
    }
    const tx = buildProductivityRecordTx({
      productivityIndexAddress: options.index,
      epoch,
      alphaWu: options.alpha,
      tokensEmitted: options.emitted,
      tokensBurned: options.burned,
      decimals
    });
    emitGovernanceResult(tx, options);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  }
});

addCommonGovernanceOptions(
  governance
    .command('productivity-emission-manager')
    .description('Assign EmissionManager to ProductivityIndex supervision')
    .requiredOption('--index <address>', 'ProductivityIndex contract address')
    .requiredOption('--emission-manager <address>', 'EmissionManager contract address')
    .option('--current <address>', 'Current emission manager for diff context')
).action((options) => {
  try {
    const tx = buildProductivityEmissionManagerTx({
      productivityIndexAddress: options.index,
      emissionManagerAddress: options.emissionManager,
      currentEmissionManager: options.current ?? undefined
    });
    emitGovernanceResult(tx, options);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  }
});

addCommonGovernanceOptions(
  governance
    .command('productivity-workmeter')
    .description('Bind ProductivityIndex to WorkMeter feed')
    .requiredOption('--index <address>', 'ProductivityIndex contract address')
    .requiredOption('--work-meter <address>', 'WorkMeter contract address')
    .option('--current <address>', 'Current WorkMeter for diff context')
).action((options) => {
  try {
    const tx = buildProductivityWorkMeterTx({
      productivityIndexAddress: options.index,
      workMeterAddress: options.workMeter,
      currentWorkMeter: options.current ?? undefined
    });
    emitGovernanceResult(tx, options);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  }
});

addCommonGovernanceOptions(
  governance
    .command('productivity-treasury')
    .description('Configure ProductivityIndex treasury distribution address')
    .requiredOption('--index <address>', 'ProductivityIndex contract address')
    .requiredOption('--treasury <address>', 'Treasury address to receive flows')
    .option('--current <address>', 'Current treasury address for diff context')
).action((options) => {
  try {
    const tx = buildProductivityTreasuryTx({
      productivityIndexAddress: options.index,
      treasuryAddress: options.treasury,
      currentTreasury: options.current ?? undefined
    });
    emitGovernanceResult(tx, options);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  }
});

addCommonGovernanceOptions(
  governance
    .command('system-pause')
    .description('Encode pause/resume directives for the SystemPause contract')
    .requiredOption('--system-pause <address>', 'SystemPause contract address')
    .option('--action <action>', 'Action to perform (pause, resume, unpause)', 'pause')
).action((options) => {
  try {
    const tx = buildSystemPauseTx({
      systemPauseAddress: options.systemPause,
      action: options.action
    });
    emitGovernanceResult(tx, options);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  }
});

addCommonGovernanceOptions(
  governance
    .command('minimum-stake')
    .description('Update StakeManager minimum stake (18 decimal $AGIALPHA)')
    .requiredOption('--stake-manager <address>', 'StakeManager contract address')
    .requiredOption('--amount <amount>', 'New minimum stake in $AGIALPHA (decimal)')
    .option('--current <amount>', 'Current minimum stake for diff (decimal)')
).action((options) => {
  try {
    const current = parseDecimalToWei(options.current, 'current minimum stake');
    const tx = buildMinimumStakeTx({
      stakeManagerAddress: options.stakeManager,
      amount: options.amount,
      currentMinimum: current ?? undefined
    });
    emitGovernanceResult(tx, options);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  }
});

addCommonGovernanceOptions(
  governance
    .command('validator-threshold')
    .description('Adjust StakeManager validator quorum threshold')
    .requiredOption('--stake-manager <address>', 'StakeManager contract address')
    .requiredOption('--threshold <count>', 'New validator threshold (integer)')
    .option('--current <count>', 'Current validator threshold for diff')
).action((options) => {
  try {
    const threshold = parseBigIntOption(options.threshold, 'threshold');
    if (threshold === undefined) {
      throw new Error('threshold is required');
    }
    if (threshold < 0n) {
      throw new Error('threshold must be non-negative');
    }
    const current = parseBigIntOption(options.current, 'current threshold');
    const tx = buildValidatorThresholdTx({
      stakeManagerAddress: options.stakeManager,
      threshold,
      currentThreshold: current ?? null
    });
    emitGovernanceResult(tx, options);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  }
});

addCommonGovernanceOptions(
  governance
    .command('registry-upgrade')
    .description('Reassign StakeManager registry dependencies')
    .requiredOption('--stake-manager <address>', 'StakeManager contract address')
    .requiredOption('--type <type>', 'Registry type (job | identity)')
    .requiredOption('--address <address>', 'New registry contract address')
    .option('--current <address>', 'Current registry address for diff')
).action((options) => {
  try {
    const tx = buildStakeRegistryUpgradeTx({
      stakeManagerAddress: options.stakeManager,
      registryType: options.type,
      newAddress: options.address,
      currentAddress: options.current
    });
    emitGovernanceResult(tx, options);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  }
});

addCommonGovernanceOptions(
  governance
    .command('role-share')
    .description('Adjust RewardEngine role share allocation')
    .requiredOption('--reward-engine <address>', 'RewardEngine contract address')
    .requiredOption('--role <role>', 'Role identifier or alias (e.g. node, validator, treasury)')
    .requiredOption('--bps <bps>', 'Share allocation in basis points')
    .option('--current-bps <bps>', 'Current share allocation for diff')
).action((options) => {
  try {
    const shareBps = parseIntegerOption(options.bps, 'bps');
    if (shareBps === undefined) {
      throw new Error('bps is required');
    }
    const currentShare = parseIntegerOption(options.currentBps, 'current-bps');
    const tx = buildRoleShareTx({
      rewardEngineAddress: options.rewardEngine,
      role: options.role,
      shareBps,
      currentShareBps: currentShare ?? null
    });
    emitGovernanceResult(tx, options);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  }
});

addCommonGovernanceOptions(
  governance
    .command('global-shares')
    .description('Adjust RewardEngine global share split')
    .requiredOption('--reward-engine <address>', 'RewardEngine contract address')
    .requiredOption('--operator-bps <bps>', 'Operator share in basis points')
    .requiredOption('--validator-bps <bps>', 'Validator share in basis points')
    .requiredOption('--treasury-bps <bps>', 'Treasury share in basis points')
    .option('--current-operator-bps <bps>', 'Current operator share for diff')
    .option('--current-validator-bps <bps>', 'Current validator share for diff')
    .option('--current-treasury-bps <bps>', 'Current treasury share for diff')
).action((options) => {
  try {
    const operatorShare = parseIntegerOption(options.operatorBps, 'operator-bps');
    const validatorShare = parseIntegerOption(options.validatorBps, 'validator-bps');
    const treasuryShare = parseIntegerOption(options.treasuryBps, 'treasury-bps');
    if (operatorShare === undefined || validatorShare === undefined || treasuryShare === undefined) {
      throw new Error('operator-bps, validator-bps, and treasury-bps are required');
    }
    const currentShares = {};
    let hasCurrent = false;
    const currentOperator = parseIntegerOption(options.currentOperatorBps, 'current-operator-bps');
    if (currentOperator !== undefined) {
      currentShares.operatorShare = currentOperator;
      hasCurrent = true;
    }
    const currentValidator = parseIntegerOption(options.currentValidatorBps, 'current-validator-bps');
    if (currentValidator !== undefined) {
      currentShares.validatorShare = currentValidator;
      hasCurrent = true;
    }
    const currentTreasury = parseIntegerOption(options.currentTreasuryBps, 'current-treasury-bps');
    if (currentTreasury !== undefined) {
      currentShares.treasuryShare = currentTreasury;
      hasCurrent = true;
    }
    const tx = buildGlobalSharesTx({
      rewardEngineAddress: options.rewardEngine,
      operatorShareBps: operatorShare,
      validatorShareBps: validatorShare,
      treasuryShareBps: treasuryShare,
      currentShares: hasCurrent ? currentShares : null
    });
    emitGovernanceResult(tx, options);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  }
});

addCommonGovernanceOptions(
  governance
    .command('emission-per-epoch')
    .description('Update base emission released each epoch (18 decimal $AGIALPHA)')
    .requiredOption('--emission-manager <address>', 'EmissionManager contract address')
    .requiredOption('--amount <amount>', 'Emission amount in $AGIALPHA (decimal)')
    .option('--current <amount>', 'Current emission amount for diff (decimal)')
    .option('--decimals <decimals>', 'Token decimals (defaults to 18)', String(AGIALPHA_TOKEN_DECIMALS))
).action((options) => {
  try {
    const decimals = parseIntegerOption(options.decimals, 'decimals') ?? AGIALPHA_TOKEN_DECIMALS;
    const current = parseDecimalToWei(options.current, 'current emission per epoch');
    const tx = buildEmissionPerEpochTx({
      emissionManagerAddress: options.emissionManager,
      emissionPerEpoch: options.amount,
      decimals,
      currentEmissionPerEpoch: current ?? undefined
    });
    emitGovernanceResult(tx, options);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  }
});

addCommonGovernanceOptions(
  governance
    .command('emission-epoch-length')
    .description('Adjust emission epoch length (seconds)')
    .requiredOption('--emission-manager <address>', 'EmissionManager contract address')
    .requiredOption('--seconds <seconds>', 'New epoch length in seconds (integer)')
    .option('--current <seconds>', 'Current epoch length for diff (integer)')
).action((options) => {
  try {
    const epochLength = parseBigIntOption(options.seconds, 'seconds');
    if (epochLength === undefined) {
      throw new Error('seconds is required');
    }
    const current = parseBigIntOption(options.current, 'current epoch length');
    const tx = buildEmissionEpochLengthTx({
      emissionManagerAddress: options.emissionManager,
      epochLengthSeconds: epochLength,
      currentEpochLengthSeconds: current ?? undefined
    });
    emitGovernanceResult(tx, options);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  }
});

addCommonGovernanceOptions(
  governance
    .command('emission-cap')
    .description('Set cumulative emission cap (18 decimal $AGIALPHA)')
    .requiredOption('--emission-manager <address>', 'EmissionManager contract address')
    .requiredOption('--amount <amount>', 'Emission cap in $AGIALPHA (decimal)')
    .option('--current <amount>', 'Current emission cap for diff (decimal)')
    .option('--decimals <decimals>', 'Token decimals (defaults to 18)', String(AGIALPHA_TOKEN_DECIMALS))
).action((options) => {
  try {
    const decimals = parseIntegerOption(options.decimals, 'decimals') ?? AGIALPHA_TOKEN_DECIMALS;
    const current = parseDecimalToWei(options.current, 'current emission cap');
    const tx = buildEmissionCapTx({
      emissionManagerAddress: options.emissionManager,
      emissionCap: options.amount,
      decimals,
      currentEmissionCap: current ?? undefined
    });
    emitGovernanceResult(tx, options);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  }
});

addCommonGovernanceOptions(
  governance
    .command('emission-multiplier')
    .description('Adjust emission reward rate multiplier (numerator/denominator)')
    .requiredOption('--emission-manager <address>', 'EmissionManager contract address')
    .requiredOption('--numerator <value>', 'Multiplier numerator (uint256)')
    .requiredOption('--denominator <value>', 'Multiplier denominator (uint256)')
    .option('--current-numerator <value>', 'Current numerator (uint256)')
    .option('--current-denominator <value>', 'Current denominator (uint256)')
).action((options) => {
  try {
    const numerator = parseBigIntOption(options.numerator, 'numerator');
    const denominator = parseBigIntOption(options.denominator, 'denominator');
    if (numerator === undefined || denominator === undefined) {
      throw new Error('numerator and denominator are required');
    }
    if (denominator === 0n) {
      throw new Error('denominator must be greater than zero');
    }
    const currentNumerator = parseBigIntOption(options.currentNumerator, 'current numerator');
    const currentDenominator = parseBigIntOption(options.currentDenominator, 'current denominator');
    const tx = buildEmissionRateMultiplierTx({
      emissionManagerAddress: options.emissionManager,
      numerator,
      denominator,
      currentMultiplier:
        currentNumerator === undefined || currentDenominator === undefined
          ? null
          : { numerator: currentNumerator, denominator: currentDenominator }
    });
    emitGovernanceResult(tx, options);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  }
});

addCommonGovernanceOptions(
  governance
    .command('job-module')
    .description('Upgrade JobRegistry modules (validation, reputation, dispute)')
    .requiredOption('--job-registry <address>', 'JobRegistry contract address')
    .requiredOption('--module <module>', 'Module name (validation | reputation | dispute)')
    .requiredOption('--address <address>', 'New module contract address')
    .option('--current <address>', 'Current module address for diff')
).action((options) => {
  try {
    const tx = buildJobRegistryUpgradeTx({
      jobRegistryAddress: options.jobRegistry,
      module: options.module,
      newAddress: options.address,
      currentAddress: options.current
    });
    emitGovernanceResult(tx, options);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  }
});

addCommonGovernanceOptions(
  governance
    .command('dispute')
    .description('Trigger JobRegistry dispute escalation for a job')
    .requiredOption('--job-registry <address>', 'JobRegistry contract address')
    .requiredOption('--job-id <id>', 'Job identifier (uint256)')
    .option('--reason <text>', 'Dispute reason (hashed on-chain)')
).action((options) => {
  try {
    const jobId = parseBigIntOption(options.jobId, 'job-id');
    if (jobId === undefined) {
      throw new Error('job-id is required');
    }
    const tx = buildDisputeTriggerTx({
      jobRegistryAddress: options.jobRegistry,
      jobId,
      reason: options.reason
    });
    emitGovernanceResult(tx, options);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  }
});

addCommonGovernanceOptions(
  governance
    .command('identity-delegate')
    .description('Authorize or revoke IdentityRegistry delegate operator access')
    .requiredOption('--identity-registry <address>', 'IdentityRegistry contract address')
    .requiredOption('--operator <address>', 'Delegate operator address')
    .requiredOption('--allowed <boolean>', 'true/false to grant or revoke access')
    .option('--current-allowed <boolean>', 'Current delegate status for diff')
).action((options) => {
  try {
    const currentAllowed = parseBooleanOption(options.currentAllowed, 'current-allowed');
    const tx = buildIdentityDelegateTx({
      identityRegistryAddress: options.identityRegistry,
      operatorAddress: options.operator,
      allowed: options.allowed,
      current:
        currentAllowed === undefined
          ? null
          : { operator: options.operator, allowed: currentAllowed }
    });
    emitGovernanceResult(tx, options);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  }
});

addCommonGovernanceOptions(
  governance
    .command('incentives-manager')
    .description('Repoint PlatformIncentives to a new StakeManager contract')
    .requiredOption('--incentives <address>', 'PlatformIncentives contract address')
    .requiredOption('--stake-manager <address>', 'StakeManager contract address')
    .option('--current <address>', 'Current StakeManager contract address for diff')
).action((options) => {
  try {
    const tx = buildIncentivesStakeManagerTx({
      incentivesAddress: options.incentives,
      stakeManagerAddress: options.stakeManager,
      currentStakeManager: options.current ?? null
    });
    emitGovernanceResult(tx, options);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  }
});

addCommonGovernanceOptions(
  governance
    .command('incentives-minimum')
    .description('Update PlatformIncentives minimum stake (18 decimal $AGIALPHA)')
    .requiredOption('--incentives <address>', 'PlatformIncentives contract address')
    .requiredOption('--amount <amount>', 'New minimum stake in $AGIALPHA (decimal)')
    .option('--current <amount>', 'Current minimum stake for diff (decimal)')
    .option('--decimals <decimals>', 'Token decimals (defaults to 18)', String(AGIALPHA_TOKEN_DECIMALS))
).action((options) => {
  try {
    const decimals = parseIntegerOption(options.decimals, 'decimals') ?? AGIALPHA_TOKEN_DECIMALS;
    const current = parseDecimalToWei(options.current, 'current minimum stake');
    const tx = buildIncentivesMinimumStakeTx({
      incentivesAddress: options.incentives,
      amount: options.amount,
      decimals,
      currentMinimum: current ?? undefined
    });
    emitGovernanceResult(tx, options);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  }
});

addCommonGovernanceOptions(
  governance
    .command('incentives-heartbeat')
    .description('Adjust PlatformIncentives heartbeat grace window (seconds)')
    .requiredOption('--incentives <address>', 'PlatformIncentives contract address')
    .requiredOption('--grace-seconds <seconds>', 'New heartbeat grace window (seconds)')
    .option('--current <seconds>', 'Current heartbeat grace window for diff')
).action((options) => {
  try {
    const grace = parseBigIntOption(options.graceSeconds, 'grace-seconds');
    if (grace === undefined) {
      throw new Error('grace-seconds is required');
    }
    const current = parseBigIntOption(options.current, 'current grace window');
    const tx = buildIncentivesHeartbeatTx({
      incentivesAddress: options.incentives,
      graceSeconds: grace,
      currentGraceSeconds: current ?? undefined
    });
    emitGovernanceResult(tx, options);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  }
});

addCommonGovernanceOptions(
  governance
    .command('incentives-activation-fee')
    .description('Set PlatformIncentives activation fee (18 decimal $AGIALPHA)')
    .requiredOption('--incentives <address>', 'PlatformIncentives contract address')
    .requiredOption('--fee <amount>', 'Activation fee amount in $AGIALPHA (decimal)')
    .option('--current <amount>', 'Current activation fee for diff (decimal)')
    .option('--decimals <decimals>', 'Token decimals (defaults to 18)', String(AGIALPHA_TOKEN_DECIMALS))
).action((options) => {
  try {
    const decimals = parseIntegerOption(options.decimals, 'decimals') ?? AGIALPHA_TOKEN_DECIMALS;
    const current = parseDecimalToWei(options.current, 'current activation fee');
    const tx = buildIncentivesActivationFeeTx({
      incentivesAddress: options.incentives,
      feeAmount: options.fee,
      decimals,
      currentFee: current ?? undefined
    });
    emitGovernanceResult(tx, options);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  }
});

addCommonGovernanceOptions(
  governance
    .command('incentives-treasury')
    .description('Redirect PlatformIncentives treasury distribution address')
    .requiredOption('--incentives <address>', 'PlatformIncentives contract address')
    .requiredOption('--treasury <address>', 'Treasury recipient address')
    .option('--current <address>', 'Current treasury address for diff')
).action((options) => {
  try {
    const tx = buildIncentivesTreasuryTx({
      incentivesAddress: options.incentives,
      treasuryAddress: options.treasury,
      currentTreasury: options.current ?? null
    });
    emitGovernanceResult(tx, options);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exitCode = 1;
  }
});

const intelligence = program
  .command('intelligence')
  .description('Advanced autonomous intelligence, swarm orchestration, and antifragile safety shell');

intelligence
  .command('plan')
  .description('Run world-model planning to evaluate strategies against a job profile')
  .requiredOption('--reward <amount>', 'Reward for completing the job (decimal)')
  .requiredOption('--complexity <score>', 'Job complexity score (1-10)')
  .requiredOption('--deadline <hours>', 'Deadline in hours to complete the job')
  .option('--risk-bps <bps>', 'Risk appetite in basis points', '2500')
  .option('--strategies <definitions>', 'Strategy descriptors "name:cost:reliability:capability:parallelism" separated by ;')
  .option('--horizon <epochs>', 'Projection horizon epochs', '3')
  .option('--decimals <decimals>', 'Token decimals', String(AGIALPHA_TOKEN_DECIMALS))
  .action((options) => {
    try {
      const decimals = Number.parseInt(options.decimals, 10);
      const complexity = Number.parseFloat(options.complexity);
      const deadline = Number.parseFloat(options.deadline);
      const riskBps = Number.parseInt(options.riskBps, 10);
      const horizon = Number.parseInt(options.horizon, 10);
      if (!Number.isFinite(decimals) || !Number.isFinite(complexity) || !Number.isFinite(deadline) || !Number.isFinite(riskBps)) {
        throw new Error('decimals, complexity, deadline, and risk must be numeric');
      }
      const strategies = parseStrategiesOption(options.strategies);
      const plan = planJobExecution({
        jobProfile: {
          reward: options.reward,
          complexity,
          deadlineHours: deadline,
          riskBps
        },
        strategies,
        horizon,
        decimals
      });

      console.log(chalk.bold(`Recommended strategy: ${plan.recommended.strategy.name}`));
      console.table({
        strategy: plan.recommended.strategy.name,
        durationHours: plan.recommended.duration.toFixed(2),
        reliability: plan.recommended.strategy.reliability,
        capability: plan.recommended.strategy.capability,
        netValue: formatTokenAmount(plan.recommended.netValue, decimals),
        riskAdjusted: formatTokenAmount(plan.recommended.riskAdjusted, decimals)
      });

      console.log(chalk.gray('Strategy comparison'));
      const comparison = describeStrategyComparison(plan);
      console.table(
        comparison.map((entry) => ({
          name: entry.name,
          reliability: entry.reliability,
          capability: entry.capability,
          durationHours: entry.durationHours,
          netValue: formatTokenAmount(BigInt(entry.netValue), decimals),
          riskAdjusted: formatTokenAmount(BigInt(entry.riskAdjusted), decimals)
        }))
      );

      console.log(chalk.gray('Projected reinforcement timeline'));
      plan.projection.timeline.forEach((epoch) => {
        console.log(`  Epoch ${epoch.epoch}: ${formatTokenAmount(epoch.adjustedNet, decimals)}`);
      });
      console.log(chalk.gray(`Projected cumulative reward across horizon: ${formatTokenAmount(plan.projection.projectedReward, decimals)}`));
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    }
  });

intelligence
  .command('swarm')
  .description('Coordinate swarm agents across domains with deterministic fallbacks')
  .option('--tasks <definitions>', 'Task descriptors "domain:complexity:urgency:value[:name]" separated by ;')
  .option('--agents <definitions>', 'Agent descriptors "name:domainA|domainB:capacity:latency:quality:capability" separated by ;')
  .option('--latency <ms>', 'Latency budget in milliseconds', '250')
  .action((options) => {
    try {
      const tasks = parseTasksOption(options.tasks);
      const agents = parseAgentsOption(options.agents);
      const latencyBudgetMs = Number.parseFloat(options.latency ?? '250');
      if (!Number.isFinite(latencyBudgetMs)) {
        throw new Error('latency must be numeric');
      }
      const plan = orchestrateSwarm({ tasks, agents, latencyBudgetMs });

      console.log(chalk.bold('Primary assignments'));
      console.table(
        plan.assignments.map((assignment) => ({
          task: assignment.task.name,
          domain: assignment.task.domain,
          agent: assignment.agent.name,
          score: assignment.score.toFixed(2)
        }))
      );

      console.log(chalk.gray('Fallback mesh'));
      console.table(
        plan.fallbacks.map((assignment) => ({
          task: assignment.task.name,
          domain: assignment.task.domain,
          agent: assignment.agent.name,
          score: assignment.score.toFixed(2)
        }))
      );

      console.log(chalk.gray('Utilization snapshot'));
      console.table(
        plan.utilization.map((entry) => ({
          agent: entry.agent,
          used: entry.used,
          capacity: entry.capacity,
          utilization: entry.utilization.toFixed(2)
        }))
      );
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    }
  });

intelligence
  .command('learn')
  .description('Run open-ended curriculum evolution for autonomous growth')
  .option('--history <definitions>', 'History descriptors "difficulty:successRate:reward" separated by ;')
  .option('--exploration <ratio>', 'Exploration bias (0-1)', '0.2')
  .option('--shock <ratio>', 'Shock factor (0-1)', '0.1')
  .option('--floor <ratio>', 'Target success floor (0-1)', '0.78')
  .action((options) => {
    try {
      const history = parseHistoryOption(options.history);
      const explorationBias = Number.parseFloat(options.exploration ?? '0.2');
      const shockFactor = Number.parseFloat(options.shock ?? '0.1');
      const floor = Number.parseFloat(options.floor ?? '0.78');
      if (!Number.isFinite(explorationBias) || !Number.isFinite(shockFactor) || !Number.isFinite(floor)) {
        throw new Error('exploration, shock, and floor must be numeric ratios');
      }
      const evolution = runCurriculumEvolution({
        history,
        explorationBias,
        shockFactor,
        targetSuccessFloor: floor
      });

      console.log(chalk.bold('Curriculum evolution status'));
      console.table({
        status: evolution.curriculum.status,
        nextDifficulty: evolution.curriculum.nextDifficulty,
        explorationBias: evolution.curriculum.explorationBias,
        shockFactor: evolution.curriculum.shockFactor
      });

      console.log(chalk.gray('Generated challenge envelope'));
      console.table(evolution.generatedChallenges);
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    }
  });

intelligence
  .command('stress-test')
  .description('Execute antifragile stress scenarios and produce remediation playbooks')
  .option('--scenarios <definitions>', 'Scenario descriptors "name:loadFactor:errorRate:downtime:exposure" separated by ;')
  .option('--capacity <index>', 'Baseline capacity index', '6')
  .option('--error <budget>', 'Baseline error budget', '0.08')
  .option('--downtime <minutes>', 'Baseline downtime budget in minutes', '20')
  .option('--buffer <amount>', 'Baseline financial buffer', '250000')
  .option('--remediation <ratio>', 'Remediation bias ratio', '0.65')
  .action((options) => {
    try {
      const scenarios = parseScenariosOption(options.scenarios);
      const baseline = {
        capacityIndex: Number.parseFloat(options.capacity ?? '6'),
        errorBudget: Number.parseFloat(options.error ?? '0.08'),
        downtimeBudget: Number.parseFloat(options.downtime ?? '20'),
        financialBuffer: Number.parseFloat(options.buffer ?? '250000')
      };
      const remediationBias = Number.parseFloat(options.remediation ?? '0.65');
      if (
        !Number.isFinite(baseline.capacityIndex) ||
        !Number.isFinite(baseline.errorBudget) ||
        !Number.isFinite(baseline.downtimeBudget) ||
        !Number.isFinite(baseline.financialBuffer) ||
        !Number.isFinite(remediationBias)
      ) {
        throw new Error('baseline metrics and remediation bias must be numeric');
      }
      const stress = assessAntifragility({ baseline, scenarios, remediationBias });

      console.log(chalk.bold('Stress test synthesis'));
      console.table(
        stress.evaluations.map((entry) => ({
          scenario: entry.scenario.name,
          resilience: entry.resilienceScore,
          loadFactor: entry.scenario.loadFactor,
          errorRate: entry.scenario.errorRate,
          downtimeMinutes: entry.scenario.downtimeMinutes,
          financialExposure: entry.scenario.financialExposure,
          capacityReinforcement: entry.improvementPlan.capacity,
          redundancyBoost: entry.improvementPlan.redundancy,
          coverageMinutes: entry.improvementPlan.coverageMinutes,
          insuranceBuffer: entry.improvementPlan.insuranceBuffer
        }))
      );

      console.log(chalk.gray(`Recommended focus: ${stress.recommendedFocus.join(', ')}`));
      console.log(chalk.gray(`Antifragile gain: ${stress.antifragileGain}`));
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    }
  });

program
  .command('score:daily')
  .description('Compute Synthetic Labor Units per provider for a given UTC date')
  .option('--date <date>', 'ISO date (YYYY-MM-DD) to score', new Date().toISOString().slice(0, 10))
  .action((options) => {
    try {
      const measurementDate = options.date ?? new Date().toISOString().slice(0, 10);
      const engine = createSyntheticLaborEngine();
      const scores = engine.computeDailyScores(measurementDate);

      console.log(chalk.bold(`Synthetic Labor Scores for ${measurementDate}`));
      console.table(
        scores.map((score) => ({
          provider: engine.providers.getById(score.provider_id)?.name ?? score.provider_id,
          rawThroughput: score.raw_throughput,
          energyAdjustment: score.energy_adjustment,
          qualityAdjustment: score.quality_adjustment,
          consensusFactor: score.consensus_factor,
          slu: score.slu
        }))
      );
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    }
  });

program
  .command('index:eligibility')
  .description('List eligible providers and exclusions for the Global Synthetic Labor Index')
  .option('--date <date>', 'ISO date (YYYY-MM-DD) to evaluate', new Date().toISOString().slice(0, 10))
  .option('--lookback <days>', 'Lookback window in days for eligibility', '30')
  .option('--min-slu <value>', 'Minimum SLU required over the window', '1')
  .action((options) => {
    try {
      const asOfDate = toDateOnly(options.date) ?? new Date().toISOString().slice(0, 10);
      const lookbackDays = Number.parseInt(options.lookback ?? '30', 10);
      const minimumSlu30d = Number.parseFloat(options.minSlu ?? '1');

      if (!Number.isFinite(lookbackDays) || lookbackDays <= 0) {
        throw new Error('lookback must be a positive integer');
      }
      if (!Number.isFinite(minimumSlu30d) || minimumSlu30d < 0) {
        throw new Error('min-slu must be non-negative');
      }

      const indexEngine = createGlobalIndexEngine();
      const eligibility = indexEngine.selectEligibleProviders({
        asOfDate,
        lookbackDays,
        minimumSlu30d
      });

      console.log(chalk.bold(`Eligibility window ${eligibility.window.start} → ${eligibility.window.end}`));
      console.log(chalk.green(`Eligible providers (${eligibility.eligible.length})`));
      console.table(
        eligibility.eligible.map((entry) => ({
          provider_id: entry.provider.id,
          name: entry.provider.name,
          total_slu: entry.total_slu,
          days_observed: entry.days_observed
        }))
      );

      if (eligibility.excluded.length > 0) {
        console.log(chalk.gray(`Excluded providers (${eligibility.excluded.length})`));
        console.table(
          eligibility.excluded.map((entry) => ({
            provider_id: entry.provider.id,
            name: entry.provider.name,
            reason: entry.reason,
            observed_slu: entry.observed_slu,
            days_observed: entry.days_observed
          }))
        );
      }
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    }
  });

program
  .command('index:rebalance')
  .description('Rebalance Global Synthetic Labor Index constituents with capped weights')
  .option('--date <date>', 'ISO date (YYYY-MM-DD) for the rebalance', new Date().toISOString().slice(0, 10))
  .option('--cap <percent>', 'Maximum provider weight percentage', '15')
  .option('--min-slu <value>', 'Minimum 30d SLU required for eligibility', '1')
  .option('--lookback <days>', 'Lookback window in days for base weights', '90')
  .option('--divisor <value>', 'Base divisor to normalize headline index values', '1')
  .option('--divisor-version <id>', 'Version tag for the divisor logic', 'v1')
  .action((options) => {
    try {
      const asOfDate = toDateOnly(options.date) ?? new Date().toISOString().slice(0, 10);
      const capPercent = Number.parseFloat(options.cap ?? '15');
      const minimumSlu30d = Number.parseFloat(options.minSlu ?? '1');
      const lookbackDays = Number.parseInt(options.lookback ?? '90', 10);
      const baseDivisor = Number.parseFloat(options.divisor ?? '1');
      const divisorVersion = options.divisorVersion ?? 'v1';
      if (!Number.isFinite(capPercent) || !Number.isFinite(minimumSlu30d) || !Number.isFinite(lookbackDays)) {
        throw new Error('cap, min-slu, and lookback must be numeric');
      }
      if (!Number.isFinite(baseDivisor) || baseDivisor <= 0) {
        throw new Error('divisor must be a positive number');
      }

      const indexEngine = createGlobalIndexEngine();
      const weightSet = indexEngine.rebalance({
        asOfDate,
        capPercent,
        minimumSlu30d,
        lookbackDays,
        baseDivisor,
        divisorVersion
      });

      const weights = indexEngine.constituentWeights.listForWeightSet(weightSet.id);
      const exclusions = indexEngine.exclusions.listForWeightSet(weightSet.id);

      console.log(chalk.bold(`Weight set ${weightSet.id} effective ${weightSet.effective_date}`));
      console.table(
        weights.map((entry) => ({
          provider_id: entry.provider_id,
          weight: entry.weight,
          capped: Boolean(entry.metadata?.capped)
        }))
      );

      if (exclusions.length > 0) {
        console.log(chalk.gray('Exclusions'));
        console.table(
          exclusions.map((entry) => ({
            provider_id: entry.provider_id,
            reason: entry.reason,
            observed_slu: entry.metadata?.observed_slu ?? 0,
            days_observed: entry.metadata?.days_observed ?? 0
          }))
        );
      }
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    }
  });

program
  .command('index:daily')
  .description('Compute the Global Synthetic Labor Index value for a date')
  .option('--date <date>', 'ISO date (YYYY-MM-DD) to compute', new Date().toISOString().slice(0, 10))
  .option('--weight-set <id>', 'Optional weight set id to use')
  .action((options) => {
    try {
      const measurementDate = toDateOnly(options.date) ?? new Date().toISOString().slice(0, 10);
      const weightSetId = options.weightSet ? Number.parseInt(options.weightSet, 10) : null;
      const indexEngine = createGlobalIndexEngine();
      const indexValue = indexEngine.computeIndexValue(measurementDate, weightSetId);

      console.log(chalk.bold(`Index value for ${indexValue.effective_date}`));
      console.table({
        weightSetId: indexValue.weight_set_id,
        headline: indexValue.headline_value,
        baseDivisor: indexValue.base_divisor,
        divisorVersion: indexValue.divisor_version
      });
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    }
  });

function simulateTelemetryDay(engine, measurementDate, drift = 0) {
  const providers = engine.providers.list();
  const taskTypes = engine.taskTypes.list();
  const taskType = taskTypes[0] ?? engine.taskTypes.create({
    name: 'synthetic-demo',
    description: 'Synthetic telemetry generator',
    difficulty_coefficient: 1.05
  });

  providers.forEach((provider, index) => {
    const baseThroughput = 5 + index + (drift % 3);
    const qualityScore = 0.82 + (index * 0.03) - (drift % 2 === 0 ? 0.02 : -0.01);
    const run = engine.taskRuns.create({
      provider_id: provider.id,
      task_type_id: taskType.id,
      status: 'completed',
      raw_throughput: baseThroughput,
      tokens_processed: 5500 + index * 250,
      tool_calls: 2 + (index % 2),
      quality_score: qualityScore,
      started_at: `${measurementDate}T00:00:00Z`,
      completed_at: `${measurementDate}T00:10:00Z`
    });

    engine.energyReports.create({
      task_run_id: run.id,
      kwh: 1.2 + index * 0.2,
      cost_usd: 0.12 + drift * 0.01,
      region: provider.region ?? 'demo-region',
      energy_mix: provider.energy_mix ?? 'synthetic',
      carbon_intensity_gco2_kwh: 18 + index
    });

    engine.qualityEvaluations.create({
      task_run_id: run.id,
      evaluator: 'synthetic',
      score: Math.min(0.98, qualityScore + 0.05),
      notes: 'synthetic backfill'
    });
  });

  engine.computeDailyScores(measurementDate);
}

program
  .command('index:simulate')
  .description('Generate synthetic telemetry and backfill a 90-day Global Synthetic Labor Index history')
  .option('--days <count>', 'Number of days to backfill', '90')
  .option('--end <date>', 'End date (YYYY-MM-DD) for the backfill window', new Date().toISOString().slice(0, 10))
  .option('--cap <percent>', 'Maximum provider weight percentage', '15')
  .option('--min-slu <value>', 'Minimum 30d SLU required for eligibility', '1')
  .option('--lookback <days>', 'Lookback window for weight construction', '90')
  .option('--rebalance-interval <days>', 'Days between rebalances during the backfill', '30')
  .option('--divisor <value>', 'Base divisor for the synthetic headline index', '1')
  .option('--divisor-version <id>', 'Version tag for the divisor logic', 'v1')
  .action((options) => {
    try {
      const days = Number.parseInt(options.days ?? '90', 10);
      const endDate = toDateOnly(options.end) ?? new Date().toISOString().slice(0, 10);
      const startDate = addDays(endDate, -1 * (days - 1));
      const capPercent = Number.parseFloat(options.cap ?? '15');
      const minimumSlu30d = Number.parseFloat(options.minSlu ?? '1');
      const lookbackDays = Number.parseInt(options.lookback ?? '90', 10);
      const rebalanceIntervalDays = Number.parseInt(options.rebalanceInterval ?? '30', 10);
      const baseDivisor = Number.parseFloat(options.divisor ?? '1');
      const divisorVersion = options.divisorVersion ?? 'v1';

      if (!Number.isFinite(days) || days <= 0) {
        throw new Error('days must be a positive integer');
      }
      if (!startDate) {
        throw new Error('Invalid end date supplied');
      }
      if (!Number.isFinite(capPercent) || !Number.isFinite(minimumSlu30d) || !Number.isFinite(lookbackDays)) {
        throw new Error('cap, min-slu, and lookback must be numeric');
      }
      if (!Number.isFinite(rebalanceIntervalDays) || rebalanceIntervalDays <= 0) {
        throw new Error('rebalance-interval must be a positive integer');
      }
      if (!Number.isFinite(baseDivisor) || baseDivisor <= 0) {
        throw new Error('divisor must be a positive number');
      }

      const db = initializeDatabase({ withSeed: true });
      const laborEngine = createSyntheticLaborEngine({ db });
      const indexEngine = createGlobalIndexEngine({ db });

      const dates = enumerateDates(startDate, endDate);
      dates.forEach((date, index) => simulateTelemetryDay(laborEngine, date, index));

      const backfill = indexEngine.backfillIndexHistory({
        startDate,
        endDate,
        capPercent,
        minimumSlu30d,
        lookbackDays,
        rebalanceIntervalDays,
        baseDivisor,
        divisorVersion
      });

      const latest = backfill.indexValues[backfill.indexValues.length - 1];
      console.log(chalk.bold(`Backfilled ${backfill.indexValues.length} days from ${startDate} to ${endDate}`));
      console.table({
        latestDate: latest?.effective_date,
        latestHeadline: latest?.headline_value,
        activeWeightSet: latest?.weight_set_id
      });
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    }
  });

await program.parseAsync(process.argv);
