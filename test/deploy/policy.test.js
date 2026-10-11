import { describe, it, expect } from "vitest";
import {
  validateConfig,
  validateRpcUrls,
  createPlan,
  verifyNetwork,
  TOKEN,
} from "../../scripts/deploy/lib.mjs";
import { keccak256, AbiCoder } from "ethers";
const config = () => ({
  chainId: 1,
  deployer: "0x1111111111111111111111111111111111111111",
  owner: "0x2222222222222222222222222222222222222222",
  tokenCodeHash: keccak256("0x00"),
  nonce: 7,
  maxFeeGwei: "20",
  maxPriorityFeeGwei: "1",
  maxTotalCostEth: "0.25",
  validUntil: new Date(Date.now() + 3600000).toISOString(),
});
describe("Ethereum deployment guards", () => {
  it.each([
    { chainId: 11155111 },
    { owner: "0x0000000000000000000000000000000000000000" },
    { owner: "0x1111111111111111111111111111111111111111" },
    { nonce: -1 },
    { nonce: 1.5 },
    { tokenCodeHash: "0x" },
    { maxFeeGwei: "0" },
    { maxPriorityFeeGwei: "30" },
    { validUntil: "2020-01-01T00:00:00Z" },
  ])("rejects invalid policy %j", (patch) =>
    expect(() => validateConfig({ ...config(), ...patch })).toThrow(),
  );
  it("requires independent HTTPS origins", () => {
    expect(() =>
      validateRpcUrls(["http://a.example", "https://b.example"]),
    ).toThrow();
    expect(() =>
      validateRpcUrls(["https://a.example/x", "https://a.example/y"]),
    ).toThrow();
    expect(() =>
      validateRpcUrls(["https://u:p@a.example", "https://b.example"]),
    ).toThrow();
    expect(() =>
      validateRpcUrls(["https://a.example", "https://b.example"]),
    ).not.toThrow();
  });
  it("rejects wrong chain and finalized RPC disagreement before transactions", async () => {
    await expect(
      verifyNetwork(
        [{ getNetwork: async () => ({ chainId: 31337n }) }],
        config(),
      ),
    ).rejects.toThrow("non-mainnet");
    const provider = (hash) => ({
      getNetwork: async () => ({ chainId: 1n }),
      getBlock: async () => ({ number: 1, hash, timestamp: Date.now() / 1000 }),
    });
    await expect(
      verifyNetwork([provider("a"), provider("b")], config()),
    ).rejects.toThrow("disagreement");
  });
  it("checks token code, decimals and block freshness on both providers", async () => {
    const provider = () => ({
      getNetwork: async () => ({ chainId: 1n }),
      getBlock: async () => ({
        number: 10,
        hash: "block",
        timestamp: Math.floor(Date.now() / 1000),
      }),
      getCode: async (address) => {
        expect(address).toBe(TOKEN);
        return "0x00";
      },
      call: async () => AbiCoder.defaultAbiCoder().encode(["uint8"], [18]),
    });
    expect(await verifyNetwork([provider(), provider()], config())).toEqual({
      number: 10,
      hash: "block",
    });
    await expect(
      verifyNetwork(
        [provider(), { ...provider(), getCode: async () => "0x01" }],
        config(),
      ),
    ).rejects.toThrow("code");
    await expect(
      verifyNetwork(
        [
          provider(),
          {
            ...provider(),
            call: async () => AbiCoder.defaultAbiCoder().encode(["uint8"], [6]),
          },
        ],
        config(),
      ),
    ).rejects.toThrow("decimals");
    const stale = {
      ...provider(),
      getBlock: async () => ({ number: 10, hash: "block", timestamp: 1 }),
    };
    await expect(verifyNetwork([stale, stale], config())).rejects.toThrow(
      "stale",
    );
  });
});
