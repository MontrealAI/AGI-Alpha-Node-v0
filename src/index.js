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
import { optimizeReinvestmentStrategy, summarizeStrategy } from './services/economics.js';
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
  buildIncentivesStakeManagerTx,
  buildIncentivesMinimumStakeTx,
  buildIncentivesHeartbeatTx,
  buildIncentivesActivationFeeTx,
  buildIncentivesTreasuryTx,
  getOwnerFunctionCatalog
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

const program = new Command();

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
        ROLE_SHARE_TARGETS:
          options.roleShare && Object.keys(options.roleShare).length > 0 ? options.roleShare : undefined
      };

      const config = loadConfig(
        Object.fromEntries(
          Object.entries(configOverrides).filter(([, value]) => value !== undefined)
        )
      );
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
          logger
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

      const { monitor, apiServer } = result;
      if (!monitor) {
        if (apiServer) {
          await apiServer.stop();
        }
        return;
      }

      const gracefulShutdown = async () => {
        logger.info('Shutting down container monitor loop');
        await monitor.stop();
        if (apiServer) {
          await apiServer.stop();
        }
        process.exit(0);
      };

      process.on('SIGINT', gracefulShutdown);
      process.on('SIGTERM', gracefulShutdown);

      await monitor.loopPromise;

      if (runOnce) {
        process.off('SIGINT', gracefulShutdown);
        process.off('SIGTERM', gracefulShutdown);
        await monitor.stop();
        if (apiServer) {
          await apiServer.stop();
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
        metadata
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
          metadata
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
      const submission = await jobLifecycle.submit(jobId, {
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

await program.parseAsync(process.argv);
