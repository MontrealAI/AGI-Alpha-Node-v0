import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { network } from "hardhat";
import { BrowserProvider, ContractFactory } from "ethers";
import {
  artifact,
  TOKEN,
  inspectContracts,
  sourcesDigest,
  createPlan,
} from "./lib.mjs";

const connection = await network.create("simulated");
const provider = new BrowserProvider(connection.provider);
try {
  assert.equal(
    Number((await provider.getNetwork()).chainId),
    31337,
    "Rehearsal is local only",
  );
  const deployer = await provider.getSigner(0),
    owner = await provider.getSigner(1),
    outsider = await provider.getSigner(2),
    contracts = [];
  for (const name of ["AlphaMissionEscrow", "AlphaNodeManager"]) {
    const compiled = await artifact(name),
      args = name === "AlphaNodeManager" ? [TOKEN] : [];
    const contract = await new ContractFactory(
      compiled.abi,
      compiled.bytecode,
      deployer,
    ).deploy(...args);
    await contract.waitForDeployment();
    await assert.rejects(
      name === "AlphaMissionEscrow"
        ? contract.connect(outsider).setPaused(true)
        : contract.connect(outsider).pause(),
    );
    await (
      await (name === "AlphaMissionEscrow"
        ? contract.setPaused(true)
        : contract.pause())
    ).wait();
    await (await contract.transferOwnership(await owner.getAddress())).wait();
    await assert.rejects(
      name === "AlphaMissionEscrow"
        ? contract.setPaused(false)
        : contract.unpause(),
    );
    await (
      await (name === "AlphaMissionEscrow"
        ? contract.connect(owner).setPaused(false)
        : contract.connect(owner).unpause())
    ).wait();
    await (
      await (name === "AlphaMissionEscrow"
        ? contract.connect(owner).setPaused(true)
        : contract.connect(owner).pause())
    ).wait();
    contracts.push({
      name,
      address: await contract.getAddress(),
      constructorArguments: args,
    });
  }
  const checked = await inspectContracts(provider, {
    contracts,
    config: { owner: await owner.getAddress() },
  });
  const policy = {
    chainId: 1,
    deployer: await deployer.getAddress(),
    owner: await owner.getAddress(),
    tokenCodeHash: `0x${"1".repeat(64)}`,
    nonce: 10,
    maxFeeGwei: "20",
    maxPriorityFeeGwei: "1",
    maxTotalCostEth: "0.25",
    validUntil: new Date(Date.now() + 3600000).toISOString(),
  };
  const plan = await createPlan(policy);
  assert.equal(plan.transactions.length, 6);
  assert.deepEqual(
    plan.transactions.map((tx) => tx.nonce),
    [10, 11, 12, 13, 14, 15],
  );
  assert.ok(
    plan.transactions.every((tx) => tx.chainId === 1 && tx.value === "0"),
  );
  await assert.rejects(
    createPlan({ ...policy, maxTotalCostEth: "0.001" }),
    /ceilings/,
  );
  const result = {
    chainId: 31337,
    localOnly: true,
    sourceDigest: await sourcesDigest(),
    contracts: checked,
    checks: [
      "optimized deployment",
      "runtime bytecode comparison",
      "canonical token",
      "unauthorized pause rejected",
      "owner handover",
      "old owner rejected",
      "new owner pause control",
    ],
    mainnetCommissioned: false,
  };
  await mkdir("build/deployment", { recursive: true });
  await writeFile(
    "build/deployment/local-rehearsal.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  provider.destroy();
  await connection.close();
}
