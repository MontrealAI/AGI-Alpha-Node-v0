import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import chalk from 'chalk';
import pino from 'pino';
import { formatTokenAmount, parseTokenAmount } from '../utils/formatters.js';
import { acknowledgeStakeAndActivate } from '../services/stakeActivation.js';
import { AGIALPHA_TOKEN_DECIMALS, AGIALPHA_TOKEN_SYMBOL } from '../constants/token.js';

function buildDefaultStakeAmount(diagnostics, config) {
  if (diagnostics?.stakeEvaluation?.deficit) {
    return formatTokenAmount(diagnostics.stakeEvaluation.deficit, AGIALPHA_TOKEN_DECIMALS);
  }
  if (config?.DESIRED_MINIMUM_STAKE) {
    return config.DESIRED_MINIMUM_STAKE;
  }
  return '0';
}

function describeFundingInstructions(operatorAddress) {
  return [
    `1. Transfer ${AGIALPHA_TOKEN_SYMBOL} to the operator address ${operatorAddress}.`,
    '2. Ensure ETH is available to cover gas fees for the activation transaction.',
    '3. Re-run the container with AUTO_STAKE=true or invoke `npx agi-alpha-node stake-activate` manually.'
  ];
}

async function promptForStakeAmount(defaultAmount, logger) {
  if (!output.isTTY) {
    logger.warn('TTY unavailable – cannot prompt for stake amount interactively.');
    return null;
  }

  const rl = readline.createInterface({ input, output });
  try {
    const amount = await rl.question(
      chalk.cyan(`Enter the amount of ${AGIALPHA_TOKEN_SYMBOL} to stake [default ${defaultAmount}]: `)
    );
    const normalized = amount.trim().length ? amount.trim() : defaultAmount;
    const confirmation = await rl.question(
      chalk.yellow(`Send ${normalized} ${AGIALPHA_TOKEN_SYMBOL} now? (y/N): `)
    );
    if (!['y', 'yes'].includes(confirmation.trim().toLowerCase())) {
      logger.info('Stake activation cancelled by operator.');
      return null;
    }
    return normalized;
  } finally {
    rl.close();
  }
}

export async function handleStakeActivation({
  diagnostics,
  config,
  logger = pino({ level: 'info', name: 'stake-activation' })
}) {
  if (!diagnostics?.stakeStatus || !config) {
    return;
  }

  const needsActivation =
    diagnostics.stakeEvaluation?.meets === false || diagnostics.stakeStatus?.active === false;

  if (!needsActivation) {
    logger.info('Stake posture meets minimum requirements – activation helper skipped.');
    return;
  }

  if (!config.PLATFORM_INCENTIVES_ADDRESS) {
    logger.warn('PlatformIncentives address missing – cannot assist with stake activation.');
    return;
  }

  const defaultAmount = config.STAKE_AMOUNT ?? buildDefaultStakeAmount(diagnostics, config);
  logger.warn(
    {
      deficit: diagnostics.stakeEvaluation?.deficit
        ? formatTokenAmount(diagnostics.stakeEvaluation.deficit, AGIALPHA_TOKEN_DECIMALS)
        : 'unknown',
      active: diagnostics.stakeStatus?.active ?? null
    },
    'Operator stake below threshold – activation required.'
  );

  describeFundingInstructions(config.OPERATOR_ADDRESS).forEach((step) => logger.warn(step));

  if (config.DRY_RUN) {
    logger.warn('DRY_RUN is enabled – stake activation transactions will not be broadcast.');
  }

  if (!config.OPERATOR_PRIVATE_KEY) {
    logger.error(
      'OPERATOR_PRIVATE_KEY not provided – set this secret to allow automated stake activation.'
    );
    return;
  }

  const autoStakeEnabled = config.AUTO_STAKE === true;
  const interactiveAllowed = config.INTERACTIVE_STAKE !== false;

  if (!autoStakeEnabled && !interactiveAllowed) {
    logger.warn(
      'AUTO_STAKE disabled and INTERACTIVE_STAKE disabled – skipping stake activation broadcast.'
    );
    return;
  }

  let amountToStake = defaultAmount;

  if (!autoStakeEnabled) {
    const prompted = await promptForStakeAmount(defaultAmount, logger);
    if (!prompted) {
      return;
    }
    amountToStake = prompted;
  }

  if (!amountToStake) {
    logger.error('Stake amount unavailable – aborting activation.');
    return;
  }

  try {
    const parsed = parseTokenAmount(String(amountToStake), AGIALPHA_TOKEN_DECIMALS);
    if (parsed <= 0n) {
      throw new Error('Stake amount must be greater than zero');
    }
  } catch (error) {
    logger.error({ amount: amountToStake, error: error.message }, 'Invalid stake amount');
    return;
  }

  if (config.DRY_RUN) {
    logger.info(
      { amount: amountToStake },
      'DRY_RUN enabled – not broadcasting acknowledgeStakeAndActivate transaction.'
    );
    return;
  }

  try {
    const result = await acknowledgeStakeAndActivate({
      rpcUrl: config.RPC_URL,
      privateKey: config.OPERATOR_PRIVATE_KEY,
      incentivesAddress: config.PLATFORM_INCENTIVES_ADDRESS,
      amount: amountToStake,
      logger
    });
    logger.info(
      {
        transactionHash: result.transactionHash,
        method: result.method,
        amount: amountToStake
      },
      'Stake activation transaction broadcasted'
    );
  } catch (error) {
    logger.error(error, 'Failed to broadcast stake activation transaction');
  }
}
