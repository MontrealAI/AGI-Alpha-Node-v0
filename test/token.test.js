import { Interface, MaxUint256, getAddress } from 'ethers';
import { describe, expect, it } from 'vitest';
import {
  buildTokenApproveTx,
  describeAgialphaToken,
  getTokenAllowance,
  getTokenBalance
} from '../src/services/token.js';
import {
  AGIALPHA_TOKEN_CHECKSUM_ADDRESS,
  AGIALPHA_TOKEN_DECIMALS,
  AGIALPHA_TOKEN_SYMBOL
} from '../src/constants/token.js';

const iface = new Interface(['function approve(address spender, uint256 amount) returns (bool)']);

describe('token services', () => {
  it('builds approve transaction for canonical $AGIALPHA amount', () => {
    const spender = '0x1111111111111111111111111111111111111111';
    const tx = buildTokenApproveTx({ spender, amount: '42.5' });
    const decoded = iface.decodeFunctionData('approve', tx.data);
    expect(tx.to).toBe(AGIALPHA_TOKEN_CHECKSUM_ADDRESS);
    expect(tx.token).toBe(AGIALPHA_TOKEN_CHECKSUM_ADDRESS);
    expect(decoded[0]).toBe(getAddress(spender));
    expect(decoded[1]).toBe(BigInt(tx.amount));
  });

  it('supports max sentinel for allowances', () => {
    const spender = '0x2222222222222222222222222222222222222222';
    const tx = buildTokenApproveTx({ spender, amount: 'MAX' });
    const decoded = iface.decodeFunctionData('approve', tx.data);
    expect(decoded[1]).toBe(MaxUint256);
    expect(tx.amount).toBe(MaxUint256);
  });

  it('rejects non-canonical token address by default', () => {
    expect(() =>
      buildTokenApproveTx({
        spender: '0x3333333333333333333333333333333333333333',
        amount: '1',
        tokenAddress: '0x0000000000000000000000000000000000000001'
      })
    ).toThrow(/canonical/);
  });

  it('reads token allowance via injected factory', async () => {
    const owner = '0x4444444444444444444444444444444444444444';
    const spender = '0x5555555555555555555555555555555555555555';
    const allowance = 123456789n;
    const factory = (address) => {
      expect(address).toBe(AGIALPHA_TOKEN_CHECKSUM_ADDRESS);
      return {
        allowance: async (ownerArg, spenderArg) => {
          expect(ownerArg).toBe(getAddress(owner));
          expect(spenderArg).toBe(getAddress(spender));
          return allowance;
        },
        balanceOf: async () => 0n
      };
    };
    const result = await getTokenAllowance({
      provider: null,
      owner,
      spender,
      contractFactory: factory
    });
    expect(result).toBe(allowance);
  });

  it('reads balances via injected factory', async () => {
    const account = '0x6666666666666666666666666666666666666666';
    const balance = 987654321n;
    const factory = (address) => {
      expect(address).toBe(AGIALPHA_TOKEN_CHECKSUM_ADDRESS);
      return {
        balanceOf: async (acct) => {
          expect(acct).toBe(getAddress(account));
          return balance;
        }
      };
    };
    const result = await getTokenBalance({
      provider: null,
      account,
      contractFactory: factory
    });
    expect(result).toBe(balance);
  });

  it('describes canonical metadata', () => {
    const meta = describeAgialphaToken();
    expect(meta.symbol).toBe(AGIALPHA_TOKEN_SYMBOL);
    expect(meta.address).toBe(AGIALPHA_TOKEN_CHECKSUM_ADDRESS);
    expect(meta.decimals).toBe(AGIALPHA_TOKEN_DECIMALS);
    expect(meta.canonical).toBe(true);
  });
});
