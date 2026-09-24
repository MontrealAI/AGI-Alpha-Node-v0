import { Interface, getAddress } from 'ethers';
import { AGIALPHA_TOKEN_ADDRESS } from '../../constants/token.js';
import { digest } from '../mission.js';
import { observeSettlement } from '../settlement.js';
import { rpcQuorum } from './rpc.js';
const address = (x) => getAddress(x).toLowerCase();
const events = new Interface([
  'event MissionPaid(bytes32 indexed workId,address indexed node,uint256 amount)',
  'event Transfer(address indexed from,address indexed to,uint256 value)',
]);
export async function auditPaidClaim(
  config,
  run,
  transactionHash,
  policy,
  rpcUrls,
  { rpc, observe = observeSettlement } = {},
) {
  const q = rpc ?? rpcQuorum(rpcUrls);
  const state = await observe(config, run, {
    escrow: policy.escrow.address,
    codeHash: policy.escrow.codeHash,
    rpcUrls,
  });
  if (state.status !== 'paid')
    throw new Error('Escrow is not paid in the finalized state');
  const block = await q.snapshot();
  await q.pin(AGIALPHA_TOKEN_ADDRESS, policy.tokenCodeHash, block);
  const receipts = await q.both('eth_getTransactionReceipt', [transactionHash]);
  const fields = (r) =>
    r && {
      transactionHash: r.transactionHash,
      blockNumber: r.blockNumber,
      blockHash: r.blockHash,
      status: r.status,
      from: r.from,
      to: r.to,
      logs: r.logs,
    };
  if (
    !receipts[0] ||
    !receipts[1] ||
    digest(fields(receipts[0])) !== digest(fields(receipts[1]))
  )
    throw new Error('Claim receipt absent or RPCs disagree');
  const r = receipts[0];
  if (
    r.transactionHash.toLowerCase() !== transactionHash.toLowerCase() ||
    BigInt(r.status) !== 1n ||
    address(r.from) !== address(config.address) ||
    address(r.to) !== address(policy.escrow.address) ||
    BigInt(r.blockNumber) > BigInt(block.number)
  )
    throw new Error('Claim receipt binding or finality failure');
  const canonical = await q.agree('eth_getBlockByNumber', [
    r.blockNumber,
    false,
  ]);
  if (!canonical || canonical.hash !== r.blockHash)
    throw new Error('Claim receipt is no longer canonical');
  const amount = BigInt(state.rewardBaseUnits);
  const matches = (contract, name, predicate) =>
    r.logs.some((log) => {
      try {
        const parsed = events.parseLog(log);
        return (
          address(log.address) === address(contract) &&
          parsed?.name === name &&
          predicate(parsed.args)
        );
      } catch {
        return false;
      }
    });
  if (
    !matches(
      policy.escrow.address,
      'MissionPaid',
      (a) =>
        a.workId === run.workId &&
        address(a.node) === address(config.address) &&
        a.amount === amount,
    ) ||
    !matches(
      AGIALPHA_TOKEN_ADDRESS,
      'Transfer',
      (a) =>
        address(a.from) === address(policy.escrow.address) &&
        address(a.to) === address(config.address) &&
        a.value === amount,
    )
  )
    throw new Error(
      'Claim lacks matching escrow and canonical-token transfer events',
    );
  return {
    runHash: run.hash,
    transactionHash,
    blockNumber: r.blockNumber,
    blockHash: r.blockHash,
    rewardBaseUnits: state.rewardBaseUnits,
    observedAt: new Date().toISOString(),
    finalizedAtBlock: block.number,
  };
}
