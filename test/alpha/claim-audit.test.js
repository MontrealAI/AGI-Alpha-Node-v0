import { it, expect } from 'vitest';
import { Interface, Wallet } from 'ethers';
import { auditPaidClaim } from '../../src/alpha/runtime/claim-audit.js';
import { AGIALPHA_TOKEN_ADDRESS } from '../../src/constants/token.js';
import { digest } from '../../src/alpha/mission.js';
const iface = new Interface([
  'event MissionPaid(bytes32 indexed workId,address indexed node,uint256 amount)',
  'event Transfer(address indexed from,address indexed to,uint256 value)',
]);
function setup() {
  const config = { address: Wallet.createRandom().address },
    escrow = Wallet.createRandom().address;
  const run = { hash: digest('signed-run'), workId: digest('work') },
    tx = digest('tx');
  const log = (name, args, address) => ({
    address,
    ...iface.encodeEventLog(iface.getEvent(name), args),
  });
  const receipt = {
    transactionHash: tx,
    status: '0x1',
    from: config.address,
    to: escrow,
    blockNumber: '0x5',
    blockHash: digest('block'),
    logs: [
      log('MissionPaid', [run.workId, config.address, 100n], escrow),
      log('Transfer', [escrow, config.address, 100n], AGIALPHA_TOKEN_ADDRESS),
    ],
  };
  const calls = [];
  const rpc = {
    snapshot: async () => ({ number: '0x10' }),
    pin: async (...a) => calls.push(['pin', ...a]),
    both: async (...a) => {
      calls.push(a);
      return [receipt, structuredClone(receipt)];
    },
    agree: async (...a) => {
      calls.push(a);
      return { hash: receipt.blockHash };
    },
  };
  const state = { status: 'paid', rewardBaseUnits: '100' };
  return {
    config,
    run,
    tx,
    receipt,
    rpc,
    state,
    calls,
    policy: {
      escrow: { address: escrow, codeHash: digest('escrow-code') },
      tokenCodeHash: digest('token-code'),
    },
    observe: async () => state,
  };
}
const audit = (f) =>
  auditPaidClaim(f.config, f.run, f.tx, f.policy, [], {
    rpc: f.rpc,
    observe: f.observe,
  });
it('re-audits finalized payment and exact canonical token transfer without sending transactions', async () => {
  const f = setup();
  const result = await audit(f);
  expect(result.rewardBaseUnits).toBe('100');
  expect(result.runHash).toBe(f.run.hash);
  expect(f.calls.some((c) => String(c[0]).includes('send'))).toBe(false);
  expect(
    f.calls.some((c) => c[0] === 'pin' && c[1] === AGIALPHA_TOKEN_ADDRESS),
  ).toBe(true);
});
it('rejects absent, divergent, reverted, substituted and unfinalized receipts', async () => {
  for (const mutate of [
    (f) => {
      f.rpc.both = async () => [null, null];
    },
    (f) => {
      f.rpc.both = async () => [f.receipt, { ...f.receipt, status: '0x0' }];
    },
    (f) => {
      f.receipt.status = '0x0';
    },
    (f) => {
      f.receipt.transactionHash = digest('other');
    },
    (f) => {
      f.receipt.blockNumber = '0x11';
    },
    (f) => {
      f.receipt.from = Wallet.createRandom().address;
    },
    (f) => {
      f.receipt.to = Wallet.createRandom().address;
    },
  ]) {
    const f = setup();
    mutate(f);
    await expect(audit(f)).rejects.toThrow();
  }
});
it('rejects reorgs, unpaid escrow state, missing transfers, wrong work and wrong amount', async () => {
  for (const mutate of [
    (f) => {
      f.rpc.agree = async () => ({ hash: digest('reorg') });
    },
    (f) => {
      f.state.status = 'accepted';
    },
    (f) => {
      f.receipt.logs.pop();
    },
    (f) => {
      f.run.workId = digest('different-work');
    },
    (f) => {
      f.state.rewardBaseUnits = '99';
    },
    (f) => {
      f.receipt.logs = [
        { address: f.policy.escrow.address, topics: [], data: '0x' },
      ];
    },
  ]) {
    const f = setup();
    mutate(f);
    await expect(audit(f)).rejects.toThrow();
  }
});
