#!/usr/bin/env node
import { readFileSync } from 'fs';
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
import {
  buildApplyForJobTx,
  buildCompleteJobTx,
  buildReleasePaymentTx,
  buildAcknowledgeWorkTx,
  buildRecordHeartbeatTx,
  encodeGetJobCall,
  decodeJobStatus
} from './services/jobs.js';

const program = new Command();
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

const jobs = program.command('jobs').description('AGI Jobs protocol integration payloads and telemetry');

function loadOptionalFile(path) {
  if (!path) return null;
  const buffer = readFileSync(path);
  return new Uint8Array(buffer);
}

jobs
  .command('apply')
  .description('Encode applyForJob transaction payload')
  .requiredOption('-r, --registry <address>', 'JobRegistry contract address')
  .requiredOption('-j, --job-id <id>', 'Job identifier')
  .option('-m, --metadata <metadata>', 'Metadata string payload')
  .option('--metadata-file <path>', 'Path to metadata file (binary safe)')
  .action((options) => {
    try {
      const metadataFile = loadOptionalFile(options.metadataFile);
      const tx = buildApplyForJobTx({
        jobRegistryAddress: options.registry,
        jobId: options.jobId,
        metadata: metadataFile ?? options.metadata
      });
      console.log('JobRegistry applyForJob payload');
      console.table({ to: tx.to, jobId: tx.jobId.toString(), metadata: tx.metadata, data: tx.data });
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    }
  });

jobs
  .command('complete')
  .description('Encode completeJob transaction payload')
  .requiredOption('-r, --registry <address>', 'JobRegistry contract address')
  .requiredOption('-j, --job-id <id>', 'Job identifier')
  .option('-u, --result-uri <uri>', 'URI pointing to result artifact')
  .option('-h, --result-hash <hash>', 'Precomputed 32-byte result hash')
  .option('--result-file <path>', 'Path to result artifact to hash client-side')
  .option('--result-data <data>', 'Raw result data string to hash when no file/hash provided')
  .action((options) => {
    try {
      const resultFile = loadOptionalFile(options.resultFile);
      const tx = buildCompleteJobTx({
        jobRegistryAddress: options.registry,
        jobId: options.jobId,
        resultHash: options.resultHash,
        resultData: resultFile ?? options.resultData,
        resultURI: options.resultUri
      });
      console.log('JobRegistry completeJob payload');
      console.table({
        to: tx.to,
        jobId: tx.jobId.toString(),
        resultHash: tx.resultHash,
        resultURI: tx.resultURI,
        data: tx.data
      });
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    }
  });

jobs
  .command('release')
  .description('Encode releasePayment transaction payload')
  .requiredOption('-r, --registry <address>', 'JobRegistry contract address')
  .requiredOption('-j, --job-id <id>', 'Job identifier')
  .action((options) => {
    try {
      const tx = buildReleasePaymentTx({ jobRegistryAddress: options.registry, jobId: options.jobId });
      console.log('JobRegistry releasePayment payload');
      console.table({ to: tx.to, jobId: tx.jobId.toString(), data: tx.data });
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    }
  });

jobs
  .command('acknowledge')
  .description('Encode acknowledgeWork transaction payload')
  .requiredOption('-r, --registry <address>', 'JobRegistry contract address')
  .requiredOption('-j, --job-id <id>', 'Job identifier')
  .requiredOption('-w, --work-hash <hash>', 'Work product hash (32 bytes, hex)')
  .action((options) => {
    try {
      const tx = buildAcknowledgeWorkTx({
        jobRegistryAddress: options.registry,
        jobId: options.jobId,
        workHash: options.workHash
      });
      console.log('JobRegistry acknowledgeWork payload');
      console.table({ to: tx.to, jobId: tx.jobId.toString(), workHash: tx.workHash, data: tx.data });
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    }
  });

jobs
  .command('heartbeat')
  .description('Encode recordHeartbeat transaction payload')
  .requiredOption('-r, --registry <address>', 'JobRegistry contract address')
  .requiredOption('-j, --job-id <id>', 'Job identifier')
  .action((options) => {
    try {
      const tx = buildRecordHeartbeatTx({ jobRegistryAddress: options.registry, jobId: options.jobId });
      console.log('JobRegistry recordHeartbeat payload');
      console.table({ to: tx.to, jobId: tx.jobId.toString(), data: tx.data });
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exitCode = 1;
    }
  });

jobs
  .command('status')
  .description('Fetch and decode job status via RPC call')
  .requiredOption('-r, --registry <address>', 'JobRegistry contract address')
  .requiredOption('-j, --job-id <id>', 'Job identifier')
  .requiredOption('--rpc <url>', 'Ethereum RPC URL for the call')
  .action(async (options) => {
    const logger = pino({ level: 'info', name: 'jobs-status' });
    try {
      const provider = createProvider(options.rpc);
      const callData = encodeGetJobCall({ jobId: options.jobId });
      const raw = await provider.call({ to: options.registry, data: callData });
      const decoded = decodeJobStatus({ data: raw });
      console.log(chalk.bold('Job status snapshot'));
      console.table({ status: decoded.status, worker: decoded.worker, expiresAt: decoded.expiresAt.toString() });
    } catch (error) {
      logger.error(error, 'Failed to fetch job status');
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

await program.parseAsync(process.argv);
