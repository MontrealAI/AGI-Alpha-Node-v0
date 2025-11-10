#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import pino from 'pino';
import { loadConfig } from './config/env.js';
import { createProvider } from './services/provider.js';
import { verifyNodeOwnership, buildNodeNameFromLabel } from './services/ensVerifier.js';
import { buildStakeAndActivateTx, validateStakeThreshold } from './services/staking.js';
import { calculateRewardShare } from './services/rewards.js';
import { formatTokenAmount } from './utils/formatters.js';
import { runNodeDiagnostics, launchMonitoring } from './orchestrator/nodeRuntime.js';
import {
  buildSystemPauseTx,
  buildMinimumStakeTx,
  buildRoleShareTx,
  buildGlobalSharesTx
} from './services/governance.js';

const program = new Command();
program
  .name('agi-alpha-node')
  .description('AGI Alpha Node sovereign runtime CLI')
  .version('1.1.0');

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

await program.parseAsync(process.argv);
