import { Contract, Interface, MaxUint256, getAddress, parseUnits } from 'ethers';
import {
  AGIALPHA_TOKEN_CHECKSUM_ADDRESS,
  AGIALPHA_TOKEN_DECIMALS,
  AGIALPHA_TOKEN_SYMBOL,
  assertCanonicalAgialphaAddress,
  isCanonicalAgialphaAddress,
  normalizeTokenAddress
} from '../constants/token.js';

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
];

const erc20Interface = new Interface(ERC20_ABI);

const defaultFactory = (address, abi, provider) => new Contract(address, abi, provider);

function resolveAmount(amount, decimals) {
  if (amount === undefined || amount === null) {
    throw new Error('amount is required');
  }
  if (typeof amount === 'string') {
    const normalized = amount.trim();
    if (normalized.length === 0) {
      throw new Error('amount is required');
    }
    if (normalized.toLowerCase() === 'max') {
      return MaxUint256;
    }
    return parseUnits(normalized, decimals);
  }
  if (typeof amount === 'number') {
    return parseUnits(amount.toString(), decimals);
  }
  if (typeof amount === 'bigint') {
    return amount;
  }
  throw new TypeError('Unsupported amount type for approve transaction');
}

export function buildTokenApproveTx({
  spender,
  amount,
  tokenAddress = AGIALPHA_TOKEN_CHECKSUM_ADDRESS,
  decimals = AGIALPHA_TOKEN_DECIMALS,
  allowNonCanonical = false
}) {
  if (!spender) {
    throw new Error('spender is required');
  }
  if (!allowNonCanonical) {
    assertCanonicalAgialphaAddress(tokenAddress);
    if (decimals !== AGIALPHA_TOKEN_DECIMALS) {
      throw new Error(`${AGIALPHA_TOKEN_SYMBOL} uses fixed decimals ${AGIALPHA_TOKEN_DECIMALS}`);
    }
  }
  const normalizedToken = normalizeTokenAddress(tokenAddress);
  const normalizedSpender = getAddress(spender);
  const approveAmount = resolveAmount(amount, decimals);
  const data = erc20Interface.encodeFunctionData('approve', [normalizedSpender, approveAmount]);
  return {
    to: normalizedToken,
    token: normalizedToken,
    spender: normalizedSpender,
    amount: approveAmount,
    decimals,
    data,
    value: 0n
  };
}

export async function getTokenAllowance({
  provider,
  owner,
  spender,
  tokenAddress = AGIALPHA_TOKEN_CHECKSUM_ADDRESS,
  allowNonCanonical = false,
  contractFactory = defaultFactory
}) {
  if (!owner) {
    throw new Error('owner is required');
  }
  if (!spender) {
    throw new Error('spender is required');
  }
  const normalizedToken = normalizeTokenAddress(tokenAddress);
  if (!allowNonCanonical) {
    assertCanonicalAgialphaAddress(normalizedToken);
  }
  const normalizedOwner = getAddress(owner);
  const normalizedSpender = getAddress(spender);
  const contract = contractFactory(normalizedToken, ERC20_ABI, provider);
  const allowance = await contract.allowance(normalizedOwner, normalizedSpender);
  return typeof allowance === 'bigint' ? allowance : BigInt(allowance);
}

export async function getTokenBalance({
  provider,
  account,
  tokenAddress = AGIALPHA_TOKEN_CHECKSUM_ADDRESS,
  allowNonCanonical = false,
  contractFactory = defaultFactory
}) {
  if (!account) {
    throw new Error('account is required');
  }
  const normalizedToken = normalizeTokenAddress(tokenAddress);
  if (!allowNonCanonical) {
    assertCanonicalAgialphaAddress(normalizedToken);
  }
  const normalizedAccount = getAddress(account);
  const contract = contractFactory(normalizedToken, ERC20_ABI, provider);
  const balance = await contract.balanceOf(normalizedAccount);
  return typeof balance === 'bigint' ? balance : BigInt(balance);
}

export function describeAgialphaToken({
  tokenAddress = AGIALPHA_TOKEN_CHECKSUM_ADDRESS,
  decimals = AGIALPHA_TOKEN_DECIMALS
} = {}) {
  const normalizedToken = normalizeTokenAddress(tokenAddress);
  const canonical = isCanonicalAgialphaAddress(normalizedToken);
  return {
    symbol: AGIALPHA_TOKEN_SYMBOL,
    address: normalizedToken,
    decimals,
    canonical
  };
}

export { ERC20_ABI };
