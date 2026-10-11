import { describe, it, expect } from "vitest";
import { Wallet, Transaction } from "ethers";
import { verifyPlannedTransaction } from "../../scripts/deploy/lib.mjs";

// Public synthetic test signer; never funded or used by deployment tooling.
const signer = new Wallet(`0x${"11".repeat(32)}`);
const reviewed = {
  chainId: 1,
  type: 2,
  nonce: 7,
  to: "0x2222222222222222222222222222222222222222",
  data: "0x1234",
  value: "0",
  gasLimit: "150000",
  maxFeePerGas: "20000000000",
  maxPriorityFeePerGas: "1000000000",
};
const signed = async (patch = {}) =>
  Transaction.from(await signer.signTransaction({ ...reviewed, ...patch }));

describe("Finalized deployment transaction policy", () => {
  it("accepts the exact signed EIP-1559 transaction", async () => {
    const tx = await signed();
    expect(() =>
      verifyPlannedTransaction(tx, reviewed, signer.address),
    ).not.toThrow();
  });

  it("accepts contract creation with the exact approved fields", async () => {
    const tx = await signed({ to: null });
    expect(() =>
      verifyPlannedTransaction(tx, { ...reviewed, to: null }, signer.address),
    ).not.toThrow();
  });

  it.each([
    ["higher gas limit", { gasLimit: "150001" }],
    ["lower gas limit", { gasLimit: "149999" }],
    ["higher maximum fee", { maxFeePerGas: "20000000001" }],
    ["lower maximum fee", { maxFeePerGas: "19999999999" }],
    ["higher priority fee", { maxPriorityFeePerGas: "1000000001" }],
    ["lower priority fee", { maxPriorityFeePerGas: "999999999" }],
    ["different chain", { chainId: 31337 }],
    ["different nonce", { nonce: 8 }],
    ["different recipient", { to: signer.address }],
    ["different calldata", { data: "0x1235" }],
    ["nonzero value", { value: "1" }],
    [
      "unapproved access list",
      { accessList: [{ address: reviewed.to, storageKeys: [] }] },
    ],
    [
      "legacy fee transaction",
      {
        type: 0,
        gasPrice: reviewed.maxFeePerGas,
        maxFeePerGas: undefined,
        maxPriorityFeePerGas: undefined,
      },
    ],
  ])("rejects a signed replacement with %s", async (_, patch) => {
    const tx = await signed(patch);
    expect(() =>
      verifyPlannedTransaction(tx, reviewed, signer.address),
    ).toThrow("differs from reviewed plan");
  });

  it("rejects a different sender or missing transaction", async () => {
    const tx = await signed();
    expect(() => verifyPlannedTransaction(tx, reviewed, reviewed.to)).toThrow();
    expect(() =>
      verifyPlannedTransaction(null, reviewed, signer.address),
    ).toThrow();
  });
});
