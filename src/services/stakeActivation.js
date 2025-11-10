import { Contract } from 'ethers';
import pino from 'pino';
import { parseTokenAmount } from '../utils/formatters.js';
import { AGIALPHA_TOKEN_DECIMALS } from '../constants/token.js';
import { PLATFORM_INCENTIVES_ABI } from './staking.js';
import { createProvider, createWallet } from './provider.js';

const defaultContractFactory = (address, abi, signer) => new Contract(address, abi, signer);

function selectActivationMethod(contract) {
  if (typeof contract.acknowledgeStakeAndActivate === 'function') {
    return 'acknowledgeStakeAndActivate';
  }
  if (typeof contract.stakeAndActivate === 'function') {
    return 'stakeAndActivate';
  }
  throw new Error('PlatformIncentives contract does not expose a supported activation method');
}

export async function acknowledgeStakeAndActivate({
  rpcUrl,
  privateKey,
  incentivesAddress,
  amount,
  decimals = AGIALPHA_TOKEN_DECIMALS,
  logger = pino({ level: 'info', name: 'stake-activation' }),
  providerFactory = createProvider,
  walletFactory = createWallet,
  contractFactory = defaultContractFactory,
  waitForReceipt
}) {
  if (!rpcUrl) throw new Error('rpcUrl is required for stake activation');
  if (!privateKey) throw new Error('privateKey is required for stake activation');
  if (!incentivesAddress) throw new Error('incentivesAddress is required for stake activation');
  if (amount === undefined || amount === null) throw new Error('amount is required for stake activation');

  const provider = providerFactory(rpcUrl);
  const wallet = walletFactory(privateKey, provider);
  const contract = contractFactory(incentivesAddress, PLATFORM_INCENTIVES_ABI, wallet);
  const method = selectActivationMethod(contract);

  const parsedAmount = parseTokenAmount(String(amount), decimals);
  if (parsedAmount <= 0n) {
    throw new Error('amount must be greater than zero');
  }

  logger.info({ amount, method }, 'Broadcasting stake activation transaction');

  const txResponse = await contract[method](parsedAmount);
  const wait = typeof waitForReceipt === 'function' ? waitForReceipt : (tx) => tx.wait();
  const receipt = await wait(txResponse);

  return {
    transactionHash: txResponse.hash,
    receipt,
    method
  };
}

export { selectActivationMethod };
