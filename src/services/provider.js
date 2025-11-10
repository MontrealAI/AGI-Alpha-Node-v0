import { JsonRpcProvider, Wallet } from 'ethers';

export function createProvider(rpcUrl) {
  if (!rpcUrl) {
    throw new Error('RPC URL is required to create a provider');
  }
  return new JsonRpcProvider(rpcUrl);
}

export function createWallet(privateKey, provider) {
  if (!privateKey) {
    throw new Error('Private key is required to create a wallet');
  }
  return new Wallet(privateKey, provider);
}
