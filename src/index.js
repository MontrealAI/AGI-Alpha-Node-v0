#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import pino from 'pino';
import { loadConfig } from './config/env.js';
import { createProvider } from './services/provider.js';
import { verifyNodeOwnership, buildNodeNameFromLabel } from './services/ensVerifier.js';
import { buildStakeAndActivateTx, validateStakeThreshold } from './services/staking.js';
import { calculateRewardShare } from './services/rewards.js';
import { optimizeReinvestmentStrategy, summarizeStrategy } from './services/economics.js';
import { formatTokenAmount } from './utils/formatters.js';
import {
  AGIALPHA_TOKEN_CHECKSUM_ADDRESS,
  AGIALPHA_TOKEN_DECIMALS,
  normalizeTokenAddress
} from './constants/token.js';
import { buildTokenApproveTx, describeAgialphaToken, getTokenAllowance } from './services/token.js';
import { runNodeDiagnostics, launchMonitoring } from './orchestrator/nodeRuntime.js';
import {
  buildSystemPauseTx,
  buildMinimumStakeTx,
  buildRoleShareTx,
  buildGlobalSharesTx
} from './services/governance.js';
import { generateEnsSetupGuide, formatEnsGuide } from './services/ensGuide.js';
import { planJobExecution, describeStrategyComparison, DEFAULT_STRATEGIES } from './intelligence/planning.js';
import { orchestrateSwarm } from './intelligence/swarmOrchestrator.js';
import { runCurriculumEvolution } from './intelligence/learningLoop.js';
import { assessAntifragility } from './intelligence/stressHarness.js';

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
  .option('--projected-rewards <amount>', 'Projected reward pool for the next epoch (decimal)')
  .option('--metrics-port <port>', 'Expose Prometheus metrics on the specified port')
  .action(async (options) => {
    const logger = pino({ level: 'info', name: 'status' });
    try {
      const config = loadConfig({
        RPC_URL: options.rpc,
        NODE_LABEL: options.label,
        OPERATOR_ADDRESS: options.address,
        STAKE_MANAGER_ADDRESS: options.stakeManager,
        PLATFORM_INCENTIVES_ADDRESS: options.incentives,
        METRICS_PORT: options.metricsPort
      });
      const diagnostics = await runNodeDiagnostics({
        rpcUrl: config.RPC_URL,
        label: config.NODE_LABEL,
        parentDomain: config.ENS_PARENT_DOMAIN,
        operatorAddress: config.OPERATOR_ADDRESS,
        stakeManagerAddress: config.STAKE_MANAGER_ADDRESS,
        incentivesAddress: config.PLATFORM_INCENTIVES_ADDRESS,
        projectedRewards: options.projectedRewards,
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
        console.table({
          minimumStake: diagnostics.stakeStatus.minimumStake ? formatTokenAmount(diagnostics.stakeStatus.minimumStake) : 'N/A',
          operatorStake: diagnostics.stakeStatus.operatorStake ? formatTokenAmount(diagnostics.stakeStatus.operatorStake) : 'N/A',
          active: diagnostics.stakeStatus.active,
          healthy: threshold?.meets ?? 'unknown'
        });
      }

      if (diagnostics.rewardsProjection) {
        console.table({
          projectedPool: formatTokenAmount(diagnostics.rewardsProjection.pool),
          operatorShare: formatTokenAmount(diagnostics.rewardsProjection.operatorPortion),
          shareBps: diagnostics.rewardsProjection.operatorShareBps
        });
      }

      if (options.metricsPort) {
        await launchMonitoring({ port: Number(options.metricsPort), stakeStatus: diagnostics.stakeStatus, logger });
        console.log(`Metrics available on :${options.metricsPort}/metrics`);
      }
    } catch (error) {
      logger.error(error, 'Diagnostics failed');
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
  .command('pause')
  .description('Build pause or resume transaction payload for the SystemPause contract')
  .requiredOption('-c, --contract <address>', 'SystemPause contract address')
  .option('-a, --action <action>', 'pause | resume | unpause', 'pause')
  .action((options) => {
    try {
      const tx = buildSystemPauseTx({ systemPauseAddress: options.contract, action: options.action });
      console.log('SystemPause transaction payload');
      console.table({ to: tx.to, method: tx.method, data: tx.data });
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    }
  });

governance
  .command('set-min-stake')
  .description('Encode a setMinimumStake call for the StakeManager')
  .requiredOption('-s, --stake-manager <address>', 'StakeManager contract address')
  .requiredOption('-m, --amount <amount>', 'Minimum stake amount (decimal)')
  .option('-d, --decimals <decimals>', 'Token decimals', '18')
  .action((options) => {
    try {
      const tx = buildMinimumStakeTx({
        stakeManagerAddress: options.stakeManager,
        amount: options.amount,
        decimals: Number.parseInt(options.decimals, 10)
      });
      console.log('StakeManager setMinimumStake payload');
      console.table({ to: tx.to, data: tx.data, amount: tx.amount.toString() });
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    }
  });

governance
  .command('set-role-share')
  .description('Encode setRoleShare for the RewardEngine contract')
  .requiredOption('-r, --reward-engine <address>', 'RewardEngine contract address')
  .requiredOption('-o, --role <role>', 'Role identifier or alias (e.g. node, validator, treasury)')
  .requiredOption('-b, --bps <bps>', 'Share allocation in basis points')
  .action((options) => {
    try {
      const tx = buildRoleShareTx({
        rewardEngineAddress: options.rewardEngine,
        role: options.role,
        shareBps: Number.parseInt(options.bps, 10)
      });
      console.log('RewardEngine setRoleShare payload');
      console.table({ to: tx.to, role: tx.role, shareBps: tx.shareBps, data: tx.data });
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    }
  });

governance
  .command('set-global-shares')
  .description('Encode setGlobalShares for operator / validator / treasury splits')
  .requiredOption('-r, --reward-engine <address>', 'RewardEngine contract address')
  .requiredOption('--operator-bps <bps>', 'Operator share in basis points')
  .requiredOption('--validator-bps <bps>', 'Validator share in basis points')
  .requiredOption('--treasury-bps <bps>', 'Treasury share in basis points')
  .action((options) => {
    try {
      const tx = buildGlobalSharesTx({
        rewardEngineAddress: options.rewardEngine,
        operatorShareBps: Number.parseInt(options.operatorBps, 10),
        validatorShareBps: Number.parseInt(options.validatorBps, 10),
        treasuryShareBps: Number.parseInt(options.treasuryBps, 10)
      });
      console.log('RewardEngine setGlobalShares payload');
      console.table({
        to: tx.to,
        operatorShareBps: tx.shares.operatorShare,
        validatorShareBps: tx.shares.validatorShare,
        treasuryShareBps: tx.shares.treasuryShare,
        data: tx.data
      });
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
