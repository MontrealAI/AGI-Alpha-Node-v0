import { open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Wallet, Transaction, Interface, getAddress, keccak256 } from 'ethers';
import { z } from 'zod';
import { AGIALPHA_TOKEN_ADDRESS } from '../../constants/token.js';
import { verifyIdentity, loadNode, readJson, recordRuntime } from '../node.js';
import { digest } from '../mission.js';
import { verifySettlementApproval } from './review-approval.js';
import { rpcQuorum } from './rpc.js';
const uint = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,77})$/)
  .refine((x) => BigInt(x) < 2n ** 256n);
const contract = z
  .object({
    address: z.string().transform(getAddress),
    codeHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  })
  .strict();
export const transactionPolicySchema = z
  .object({
    enabled: z.boolean(),
    escrow: contract,
    tokenCodeHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    manager: contract.optional(),
    maxGasLimit: uint,
    maxFeePerGasWei: uint,
    priorityFeePerGasWei: uint,
    maxDailyGasWei: uint,
    reinvestBps: z.number().int().min(0).max(10000).default(0),
    maxReinvestPerMission: uint.default('0'),
    minLiquidBalance: uint.default('0'),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (
      BigInt(p.maxGasLimit) < 21000n ||
      BigInt(p.maxFeePerGasWei) === 0n ||
      BigInt(p.priorityFeePerGasWei) > BigInt(p.maxFeePerGasWei) ||
      (p.reinvestBps > 0 && !p.manager)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Invalid gas or reinvestment bounds',
      });
  });
const escrowAbi = new Interface([
  'function TOKEN() view returns (address)',
  'function missions(bytes32) view returns (address node,address reviewer,address funder,uint256 reward,uint256 deadline,bytes32 evidenceHash,uint8 status)',
  'function submit(bytes32,bytes32)',
  'function claim(bytes32)',
  'function reviewWithSignature(bytes32,bytes32,bool,uint256,bytes)',
  'event MissionPaid(bytes32 indexed workId,address indexed node,uint256 amount)',
]);
const tokenAbi = new Interface([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns(bool)',
  'event Transfer(address indexed from,address indexed to,uint256 value)',
]);
const managerAbi = new Interface([
  'function stakingToken() view returns (address)',
  'function isIdentityActive(address) view returns (bool)',
  'function stakedBalance(address) view returns (uint256)',
  'function stake(uint256)',
  'event StakeDeposited(address indexed account,uint256 amount)',
]);
const addr = (value) => getAddress(value).toLowerCase();
async function read(rpc, abi, to, fn, args, block) {
  return abi.decodeFunctionResult(
    fn,
    await rpc.agree('eth_call', [
      { to, data: abi.encodeFunctionData(fn, args) },
      block.selector,
    ]),
  );
}
function eventMatch(logs, abi, contractAddress, name, predicate) {
  return logs.some((log) => {
    try {
      if (addr(log.address) !== addr(contractAddress) || log.removed)
        return false;
      const parsed = abi.parseLog(log);
      return parsed?.name === name && predicate(parsed.args);
    } catch {
      return false;
    }
  });
}
async function sendStep(dir, rpc, policy, key, call, validateReceipt) {
  let node = await loadNode(dir);
  if (node.paused || !policy.enabled)
    throw new Error('Transactions paused or disabled');
  const existing = node.runtime.get(`${key}:result`);
  if (existing) return existing.data;
  let prepared = node.runtime.get(`${key}:prepared`);
  const wallet = new Wallet(
    (await readJson(join(dir, 'identity.key.json'))).privateKey,
  );
  if (addr(wallet.address) !== addr(node.config.address))
    throw new Error('Transaction signer mismatch');
  if (!prepared) {
    const pending = await rpc.agree('eth_getTransactionCount', [
      wallet.address,
      'pending',
    ]);
    const latest = await rpc.agree('eth_getTransactionCount', [
      wallet.address,
      'latest',
    ]);
    if (BigInt(pending) !== BigInt(latest))
      throw new Error(
        'Existing pending nonce; use a dedicated node transaction signer',
      );
    if (BigInt(pending) > BigInt(Number.MAX_SAFE_INTEGER))
      throw new Error('Nonce exceeds safe range');
    const estimate = (
      await rpc.both('eth_estimateGas', [
        { from: wallet.address, to: call.to, data: call.data, value: '0x0' },
      ])
    )
      .map(BigInt)
      .reduce((a, b) => (a > b ? a : b));
    const gasLimit = (estimate * 120n + 99n) / 100n;
    if (gasLimit > BigInt(policy.maxGasLimit))
      throw new Error('Gas estimate exceeds owner cap');
    const reservedGasWei = gasLimit * BigInt(policy.maxFeePerGasWei);
    const balance = BigInt(
      await rpc.agree('eth_getBalance', [wallet.address, 'latest']),
    );
    if (balance < reservedGasWei)
      throw new Error(
        'Insufficient native balance for bounded gas reservation',
      );
    const unsigned = {
      type: 2,
      chainId: 1,
      nonce: Number(BigInt(pending)),
      to: call.to,
      data: call.data,
      value: 0n,
      gasLimit,
      maxFeePerGas: BigInt(policy.maxFeePerGasWei),
      maxPriorityFeePerGas: BigInt(policy.priorityFeePerGasWei),
    };
    const raw = await wallet.signTransaction(unsigned);
    const hash = keccak256(raw);
    prepared = await recordRuntime(
      dir,
      'transaction-prepared',
      `${key}:prepared`,
      {
        raw,
        hash,
        to: call.to,
        data: call.data,
        reservedGasWei: String(reservedGasWei),
        purpose: call.purpose,
        amountBaseUnits: call.amountBaseUnits ?? null,
      },
      (n) => {
        if (n.paused) throw new Error('Node paused');
        const today = new Date().toISOString().slice(0, 10);
        const used = [...n.runtime.values()]
          .filter(
            (e) =>
              e.topic === 'transaction-prepared' &&
              (e.at.slice(0, 10) >= today ||
                !n.runtime.has(e.id.replace(/:prepared$/, ':result')) ||
                n.runtime
                  .get(e.id.replace(/:prepared$/, ':result'))
                  .at.slice(0, 10) >= today),
          )
          .reduce((sum, e) => sum + BigInt(e.data.reservedGasWei), 0n);
        if (used + reservedGasWei > BigInt(policy.maxDailyGasWei))
          throw new Error('Daily gas reservation exhausted');
        const unresolved = [...n.runtime.values()].filter(
          (e) =>
            e.topic === 'transaction-prepared' &&
            !n.runtime.has(e.id.replace(/:prepared$/, ':result')),
        );
        if (unresolved.length)
          throw new Error('Unresolved transaction blocks a new nonce');
      },
    );
  }
  const transaction = Transaction.from(prepared.data.raw);
  if (
    transaction.hash !== prepared.data.hash ||
    addr(transaction.from) !== addr(wallet.address) ||
    transaction.chainId !== 1n ||
    addr(transaction.to) !== addr(call.to) ||
    transaction.data !== call.data ||
    transaction.value !== 0n
  )
    throw new Error(
      'Persisted transaction does not match authorized operation',
    );
  const receipts = await rpc.both('eth_getTransactionReceipt', [
    transaction.hash,
  ]);
  if (!receipts[0] || !receipts[1]) {
    if ((await loadNode(dir)).paused)
      throw new Error('Paused before broadcast');
    try {
      const hash = await rpc.one(0, 'eth_sendRawTransaction', [
        prepared.data.raw,
      ]);
      if (hash.toLowerCase() !== transaction.hash.toLowerCase())
        throw new Error('Broadcast hash mismatch');
    } catch {
      return {
        status: 'pending',
        transactionHash: transaction.hash,
        reason:
          'Broadcast unconfirmed; retry the same operation to reconcile or rebroadcast the identical signed transaction',
      };
    }
    return { status: 'pending', transactionHash: transaction.hash };
  }
  const a = receipts[0],
    b = receipts[1];
  const fields = (r) => ({
    transactionHash: r.transactionHash,
    blockHash: r.blockHash,
    blockNumber: r.blockNumber,
    status: r.status,
    from: r.from,
    to: r.to,
    logs: r.logs,
  });
  if (digest(fields(a)) !== digest(fields(b)))
    throw new Error('Transaction receipt disagreement');
  if (
    a.transactionHash.toLowerCase() !== transaction.hash.toLowerCase() ||
    addr(a.from) !== addr(wallet.address) ||
    addr(a.to) !== addr(call.to)
  )
    throw new Error('Receipt transaction binding mismatch');
  const block = await rpc.snapshot();
  if (BigInt(a.blockNumber) > BigInt(block.number))
    return { status: 'pending-finality', transactionHash: transaction.hash };
  const canonical = await rpc.agree('eth_getBlockByNumber', [
    a.blockNumber,
    false,
  ]);
  if (!canonical || canonical.hash !== a.blockHash)
    throw new Error('Receipt is not in the agreed canonical chain');
  const result = {
    status: BigInt(a.status) === 1n ? 'confirmed' : 'reverted',
    transactionHash: transaction.hash,
    blockNumber: a.blockNumber,
    blockHash: a.blockHash,
    purpose: call.purpose,
    amountBaseUnits: prepared.data.amountBaseUnits ?? null,
  };
  if (result.status === 'confirmed') await validateReceipt(a, block);
  await recordRuntime(dir, 'transaction-result', `${key}:result`, result);
  return result;
}
export async function settleAndReinvest(
  dir,
  missionId,
  inputPolicy,
  rpcUrls,
  dependencies = {},
) {
  const policy = transactionPolicySchema.parse(inputPolicy);
  if (!policy.enabled)
    throw new Error('Owner has not enabled transaction execution');
  const lock = join(dir, 'transaction.lock');
  let handle;
  try {
    handle = await open(lock, 'wx', 0o600);
  } catch (e) {
    if (e.code === 'EEXIST')
      throw new Error('Transaction executor busy or interrupted');
    throw e;
  }
  try {
    await handle.writeFile(String(process.pid));
    await handle.sync();
    const node = await loadNode(dir);
    const run = node.runs.get(missionId);
    if (
      node.paused ||
      node.config.mode !== 'live' ||
      !run?.identity.verified ||
      run.review?.decision !== 'accepted'
    )
      throw new Error('Unpaused accepted live mission required');
    await verifyIdentity(node.config, {
      provider: dependencies.identityProvider,
    });
    if (
      run.runtimeContext?.action &&
      node.runtime.get(`action:${run.hash}:result`)?.data.status !== 'applied'
    )
      throw new Error('Reviewed action has not completed successfully');
    const rpc = dependencies.rpc ?? rpcQuorum(rpcUrls);
    const block = await rpc.snapshot();
    await rpc.pin(policy.escrow.address, policy.escrow.codeHash, block);
    await rpc.pin(AGIALPHA_TOKEN_ADDRESS, policy.tokenCodeHash, block);
    if (
      addr(
        (
          await read(rpc, escrowAbi, policy.escrow.address, 'TOKEN', [], block)
        )[0],
      ) !== addr(AGIALPHA_TOKEN_ADDRESS)
    )
      throw new Error('Escrow token mismatch');
    const mission = await read(
      rpc,
      escrowAbi,
      policy.escrow.address,
      'missions',
      [run.workId],
      block,
    );
    if (
      addr(mission.node) !== addr(node.config.address) ||
      addr(mission.reviewer) !== addr(node.config.reviewer) ||
      mission.reward <= 0n
    )
      throw new Error('Funded mission binding mismatch');
    const pendingStep = [...node.runtime.values()].find(
      (e) =>
        e.topic === 'transaction-prepared' &&
        e.id.startsWith(`tx:${run.hash}:`) &&
        !node.runtime.has(e.id.replace(/:prepared$/, ':result')),
    );
    // Reconcile any prepared step before advancing state, including transactions already mined.
    let operation = pendingStep?.data.purpose;
    if (!operation)
      operation =
        mission.status === 1n
          ? 'submit'
          : mission.status === 3n
            ? 'claim'
            : mission.status === 2n && run.review.settlementApproval
              ? 'review'
              : null;
    if (operation === 'submit') {
      const result = await sendStep(
        dir,
        rpc,
        policy,
        `tx:${run.hash}:submit`,
        {
          to: policy.escrow.address,
          data: escrowAbi.encodeFunctionData('submit', [run.workId, run.hash]),
          purpose: 'submit',
        },
        async (_, finalized) => {
          const current = await read(
            rpc,
            escrowAbi,
            policy.escrow.address,
            'missions',
            [run.workId],
            finalized,
          );
          if (
            current.evidenceHash.toLowerCase() !== run.hash.toLowerCase() ||
            current.status < 2n
          )
            throw new Error('Submission postcondition failed');
        },
      );
      return { phase: 'submit', ...result };
    }
    if (
      mission.status >= 2n &&
      mission.evidenceHash.toLowerCase() !== run.hash.toLowerCase()
    )
      throw new Error('Funded evidence binding mismatch');
    if (operation === 'review') {
      const approval = verifySettlementApproval(
        run.review.settlementApproval,
        run,
        node.config.reviewer,
        policy.escrow.address,
      );
      const result = await sendStep(
        dir,
        rpc,
        policy,
        `tx:${run.hash}:review`,
        {
          to: policy.escrow.address,
          data: escrowAbi.encodeFunctionData('reviewWithSignature', [
            run.workId,
            run.hash,
            true,
            approval.expiresAt,
            approval.signature,
          ]),
          purpose: 'review',
        },
        async (_, finalized) => {
          const current = await read(
            rpc,
            escrowAbi,
            policy.escrow.address,
            'missions',
            [run.workId],
            finalized,
          );
          if (
            current.evidenceHash.toLowerCase() !== run.hash.toLowerCase() ||
            ![3n, 5n].includes(current.status)
          )
            throw new Error('Review relay postcondition failed');
        },
      );
      return { phase: 'review', ...result };
    }
    if (operation === 'claim') {
      const result = await sendStep(
        dir,
        rpc,
        policy,
        `tx:${run.hash}:claim`,
        {
          to: policy.escrow.address,
          data: escrowAbi.encodeFunctionData('claim', [run.workId]),
          purpose: 'claim',
        },
        async (receipt) => {
          const paid = eventMatch(
            receipt.logs,
            escrowAbi,
            policy.escrow.address,
            'MissionPaid',
            (a) =>
              a.workId === run.workId &&
              addr(a.node) === addr(node.config.address) &&
              a.amount === mission.reward,
          );
          const transferred = eventMatch(
            receipt.logs,
            tokenAbi,
            AGIALPHA_TOKEN_ADDRESS,
            'Transfer',
            (a) =>
              addr(a.from) === addr(policy.escrow.address) &&
              addr(a.to) === addr(node.config.address) &&
              a.value === mission.reward,
          );
          if (!paid || !transferred)
            throw new Error(
              'Claim lacks matching escrow and canonical-token transfer receipts',
            );
        },
      );
      return { phase: 'claim', ...result };
    }
    if (mission.status !== 5n)
      return {
        phase: 'escrow',
        status:
          [
            'none',
            'funded',
            'awaiting-onchain-review',
            'accepted',
            'rejected',
            'paid',
            'refunded',
          ][Number(mission.status)] ?? 'unknown',
      };
    const claim = node.runtime.get(`tx:${run.hash}:claim:result`);
    if (claim?.data.status !== 'confirmed')
      throw new Error(
        "Reinvestment requires this executor's verified canonical payment receipt",
      );
    if (policy.reinvestBps === 0)
      return {
        phase: 'paid',
        status: 'complete',
        rewardBaseUnits: String(mission.reward),
        reinvestedBaseUnits: '0',
      };
    await rpc.pin(policy.manager.address, policy.manager.codeHash, block);
    if (
      addr(
        (
          await read(
            rpc,
            managerAbi,
            policy.manager.address,
            'stakingToken',
            [],
            block,
          )
        )[0],
      ) !== addr(AGIALPHA_TOKEN_ADDRESS) ||
      !(
        await read(
          rpc,
          managerAbi,
          policy.manager.address,
          'isIdentityActive',
          [node.config.address],
          block,
        )
      )[0]
    )
      throw new Error('Staking manager token or identity mismatch');
    const target = (mission.reward * BigInt(policy.reinvestBps)) / 10000n;
    const amount =
      target < BigInt(policy.maxReinvestPerMission)
        ? target
        : BigInt(policy.maxReinvestPerMission);
    if (amount === 0n)
      return {
        phase: 'paid',
        status: 'complete',
        rewardBaseUnits: String(mission.reward),
        reinvestedBaseUnits: '0',
      };
    const staked = node.runtime.get(`tx:${run.hash}:stake:result`);
    if (staked)
      return {
        phase: 'reinvestment',
        ...staked.data,
        reinvestedBaseUnits:
          staked.data.status === 'confirmed'
            ? staked.data.amountBaseUnits
            : '0',
      };
    const balance = (
      await read(
        rpc,
        tokenAbi,
        AGIALPHA_TOKEN_ADDRESS,
        'balanceOf',
        [node.config.address],
        block,
      )
    )[0];
    if (!pendingStep && balance < amount + BigInt(policy.minLiquidBalance))
      throw new Error('Reinvestment would breach liquid reserve');
    const allowance = (
      await read(
        rpc,
        tokenAbi,
        AGIALPHA_TOKEN_ADDRESS,
        'allowance',
        [node.config.address, policy.manager.address],
        block,
      )
    )[0];
    if (
      operation === 'approve' ||
      (allowance !== amount && operation !== 'stake')
    ) {
      if (allowance !== 0n && allowance !== amount)
        throw new Error(
          'Unexpected token allowance; revoke outside the node before continuing',
        );
      const result = await sendStep(
        dir,
        rpc,
        policy,
        `tx:${run.hash}:approve`,
        {
          to: AGIALPHA_TOKEN_ADDRESS,
          data: tokenAbi.encodeFunctionData('approve', [
            policy.manager.address,
            amount,
          ]),
          purpose: 'approve',
        },
        async (_, finalized) => {
          if (
            (
              await read(
                rpc,
                tokenAbi,
                AGIALPHA_TOKEN_ADDRESS,
                'allowance',
                [node.config.address, policy.manager.address],
                finalized,
              )
            )[0] !== amount
          )
            throw new Error('Approval postcondition failed');
        },
      );
      return { phase: 'approve', ...result };
    }
    const result = await sendStep(
      dir,
      rpc,
      policy,
      `tx:${run.hash}:stake`,
      {
        to: policy.manager.address,
        data: managerAbi.encodeFunctionData('stake', [amount]),
        purpose: 'stake',
        amountBaseUnits: String(amount),
      },
      async (receipt) => {
        if (
          !eventMatch(
            receipt.logs,
            managerAbi,
            policy.manager.address,
            'StakeDeposited',
            (a) =>
              addr(a.account) === addr(node.config.address) &&
              a.amount === amount,
          ) ||
          !eventMatch(
            receipt.logs,
            tokenAbi,
            AGIALPHA_TOKEN_ADDRESS,
            'Transfer',
            (a) =>
              addr(a.from) === addr(node.config.address) &&
              addr(a.to) === addr(policy.manager.address) &&
              a.value === amount,
          )
        )
          throw new Error(
            'Stake receipt does not prove the authorized token movement',
          );
      },
    );
    return {
      phase: 'stake',
      ...result,
      reinvestedBaseUnits: result.status === 'confirmed' ? String(amount) : '0',
    };
  } finally {
    await handle.close();
    await unlink(lock);
  }
}
