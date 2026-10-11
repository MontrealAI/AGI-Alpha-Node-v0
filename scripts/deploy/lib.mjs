import { readFile, readdir } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { createHash } from "node:crypto";
import {
  Contract,
  ContractFactory,
  Interface,
  getAddress,
  getCreateAddress,
  keccak256,
  parseEther,
  parseUnits,
  ZeroAddress,
} from "ethers";

export const TOKEN = "0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA";
export const ROOT = resolve(import.meta.dirname, "../..");
export const NAMES = ["AlphaMissionEscrow", "AlphaNodeManager"];
export const requireThat = (condition, message) => {
  if (!condition) throw new Error(message);
};
export const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function sourcesDigest() {
  const files = [];
  async function walk(dir) {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.endsWith(".sol"))
        files.push([relative(ROOT, path), await readFile(path, "utf8")]);
    }
  }
  await walk(resolve(ROOT, "contracts"));
  return digest(files);
}
export async function artifact(name) {
  const compiled = JSON.parse(
    await readFile(
      resolve(
        ROOT,
        `build/hardhat/artifacts/contracts/${name}.sol/${name}.json`,
      ),
      "utf8",
    ),
  );
  const build = JSON.parse(
    await readFile(
      resolve(
        ROOT,
        `build/hardhat/artifacts/build-info/${compiled.buildInfoId}.json`,
      ),
      "utf8",
    ),
  );
  requireThat(
    build.solcVersion === "0.8.37" &&
      build.input.settings.optimizer?.enabled === true &&
      build.input.settings.optimizer.runs === 200 &&
      build.input.settings.evmVersion === "paris",
    "Unexpected compiler settings; rebuild with the committed Hardhat configuration",
  );
  for (const [path, source] of Object.entries(build.input.sources)) {
    requireThat(
      path.startsWith("project/contracts/") && !path.includes(".."),
      "Unexpected build source path",
    );
    requireThat(
      source.content ===
        (await readFile(resolve(ROOT, path.slice("project/".length)), "utf8")),
      "Artifacts are stale; rebuild contracts",
    );
  }
  const output = JSON.parse(
    await readFile(
      resolve(
        ROOT,
        `build/hardhat/artifacts/build-info/${compiled.buildInfoId}.output.json`,
      ),
      "utf8",
    ),
  );
  const contract = output.output.contracts[compiled.inputSourceName][name];
  requireThat(
    `0x${contract.evm.bytecode.object}` === compiled.bytecode &&
      `0x${contract.evm.deployedBytecode.object}` === compiled.deployedBytecode,
    "Artifact/build output mismatch",
  );
  requireThat(
    digest(contract.abi) === digest(compiled.abi),
    "Artifact ABI/build output mismatch",
  );
  return compiled;
}
export function validateConfig(config, now = Date.now()) {
  requireThat(
    config.chainId === 1,
    "Only Ethereum mainnet chainId 1 is accepted",
  );
  const deployer = getAddress(config.deployer),
    owner = getAddress(config.owner);
  requireThat(
    deployer !== ZeroAddress && owner !== ZeroAddress,
    "Zero deployer/owner rejected",
  );
  requireThat(
    deployer !== owner,
    "Use a separate verified owner; the deployment signer is temporary",
  );
  requireThat(
    /^0x[0-9a-fA-F]{64}$/.test(config.tokenCodeHash) &&
      config.tokenCodeHash !== `0x${"0".repeat(64)}`,
    "A verified tokenCodeHash is required",
  );
  requireThat(
    Number.isSafeInteger(config.nonce) &&
      config.nonce >= 0 &&
      config.nonce <= Number.MAX_SAFE_INTEGER - 6,
    "An explicit safe nonce is required",
  );
  const deadline = Date.parse(config.validUntil);
  requireThat(
    Number.isFinite(deadline) &&
      deadline > now &&
      deadline <= now + 24 * 60 * 60 * 1000,
    "Plan expiry must be in the next 24 hours",
  );
  const maxFeePerGas = parseUnits(config.maxFeeGwei, "gwei"),
    maxPriorityFeePerGas = parseUnits(config.maxPriorityFeeGwei, "gwei");
  const maxTotalCost = parseEther(config.maxTotalCostEth);
  requireThat(
    maxFeePerGas > 0n &&
      maxPriorityFeePerGas > 0n &&
      maxPriorityFeePerGas <= maxFeePerGas &&
      maxTotalCost > 0n,
    "Invalid fee or spending limits",
  );
  return {
    deployer,
    owner,
    maxFeePerGas,
    maxPriorityFeePerGas,
    maxTotalCost,
    deadline,
  };
}
export function validateRpcUrls(urls) {
  requireThat(
    urls.length === 2 && urls.every(Boolean),
    "Two independent HTTPS RPC endpoints are required",
  );
  const parsed = urls.map((value) => new URL(value));
  requireThat(
    parsed.every(
      (url) => url.protocol === "https:" && !url.username && !url.password,
    ),
    "RPC URLs must use HTTPS without embedded user credentials",
  );
  requireThat(
    parsed[0].origin !== parsed[1].origin,
    "Use distinct RPC origins and independently operated providers",
  );
}
export async function verifyNetwork(providers, config) {
  for (const provider of providers)
    requireThat(
      Number((await provider.getNetwork()).chainId) === 1,
      "RPC returned a non-mainnet chain",
    );
  const blocks = await Promise.all(
    providers.map((p) => p.getBlock("finalized")),
  );
  requireThat(blocks.every(Boolean), "Finalized block is unavailable");
  const height = Math.min(...blocks.map((b) => b.number));
  const canonical = await Promise.all(providers.map((p) => p.getBlock(height)));
  requireThat(
    canonical[0]?.hash && canonical[0].hash === canonical[1]?.hash,
    "RPC finalized block disagreement",
  );
  requireThat(
    Date.now() / 1000 - canonical[0].timestamp < 3600 &&
      canonical[0].timestamp <= Date.now() / 1000 + 60,
    "RPC finalized block is stale or from the future",
  );
  for (const provider of providers) {
    const code = await provider.getCode(TOKEN, height);
    requireThat(
      code !== "0x" && keccak256(code) === config.tokenCodeHash,
      "Canonical token code does not match the reviewed hash",
    );
    const token = new Contract(
      TOKEN,
      ["function decimals() view returns(uint8)"],
      provider,
    );
    requireThat(
      (await token.decimals({ blockTag: height })) === 18n,
      "Canonical token decimals are not 18",
    );
  }
  return { number: height, hash: canonical[0].hash };
}
export async function createPlan(config, now = Date.now()) {
  const policy = validateConfig(config, now),
    transactions = [],
    contracts = [];
  for (const name of NAMES) {
    const compiled = await artifact(name),
      args = name === "AlphaNodeManager" ? [TOKEN] : [];
    requireThat(
      (compiled.deployedBytecode.length - 2) / 2 <= 24576,
      `${name} exceeds EIP-170`,
    );
    requireThat(
      (compiled.bytecode.length - 2) / 2 <= 49152,
      `${name} exceeds EIP-3860`,
    );
    const factory = new ContractFactory(compiled.abi, compiled.bytecode);
    const address = getCreateAddress({
      from: policy.deployer,
      nonce: config.nonce + transactions.length,
    });
    const iface = new Interface(compiled.abi),
      deploy = await factory.getDeployTransaction(...args);
    const entries = [
      {
        action: `deploy ${name}`,
        to: null,
        data: deploy.data,
        gasLimit: "5000000",
      },
      {
        action: `pause ${name}`,
        to: address,
        data: iface.encodeFunctionData(
          name === "AlphaMissionEscrow" ? "setPaused" : "pause",
          name === "AlphaMissionEscrow" ? [true] : [],
        ),
        gasLimit: "150000",
      },
      {
        action: `transfer ${name} ownership`,
        to: address,
        data: iface.encodeFunctionData("transferOwnership", [policy.owner]),
        gasLimit: "100000",
      },
    ];
    for (const entry of entries)
      transactions.push({
        ...entry,
        chainId: 1,
        type: 2,
        value: "0",
        nonce: config.nonce + transactions.length,
        maxFeePerGas: policy.maxFeePerGas.toString(),
        maxPriorityFeePerGas: policy.maxPriorityFeePerGas.toString(),
      });
    contracts.push({
      name,
      address,
      constructorArguments: args,
      creationCodeHash: keccak256(compiled.bytecode),
    });
  }
  const maxCost = transactions.reduce(
    (sum, tx) => sum + BigInt(tx.gasLimit) * BigInt(tx.maxFeePerGas),
    0n,
  );
  requireThat(
    maxCost <= policy.maxTotalCost,
    "Transaction gas ceilings exceed maxTotalCostEth",
  );
  return {
    schema: 1,
    chainId: 1,
    config,
    sourceDigest: await sourcesDigest(),
    compiler: "0.8.37",
    optimizerRuns: 200,
    evmVersion: "paris",
    contracts,
    transactions,
    maximumCostWei: maxCost.toString(),
  };
}
export async function inspectContracts(provider, plan, blockTag = "latest") {
  const result = [];
  for (const item of plan.contracts) {
    const compiled = await artifact(item.name),
      code = await provider.getCode(item.address, blockTag);
    requireThat(code !== "0x", `${item.name}: no deployed code`);
    // The manager embeds an immutable canonical-token address. Compare all bytes
    // except declared immutable positions, then independently verify the getter.
    const expected = compiled.deployedBytecode.slice(2).toLowerCase().split("");
    const actual = code.slice(2).toLowerCase().split("");
    requireThat(
      expected.length === actual.length,
      `${item.name}: runtime length mismatch`,
    );
    // Hardhat's build output carries immutable positions separately from artifacts.
    const buildInfo = JSON.parse(
      await readFile(
        resolve(
          ROOT,
          "build/hardhat/artifacts/build-info",
          `${compiled.buildInfoId}.output.json`,
        ),
        "utf8",
      ),
    );
    const output =
      buildInfo.output.contracts[compiled.inputSourceName][item.name];
    for (const refs of Object.values(
      output.evm.deployedBytecode.immutableReferences ?? {},
    ))
      for (const { start, length } of refs)
        for (let i = start * 2; i < (start + length) * 2; i++) {
          expected[i] = "0";
          actual[i] = "0";
        }
    requireThat(
      expected.join("") === actual.join(""),
      `${item.name}: runtime bytecode mismatch`,
    );
    const contract = new Contract(item.address, compiled.abi, provider);
    requireThat(
      getAddress(await contract.owner({ blockTag })) ===
        getAddress(plan.config.owner),
      `${item.name}: owner mismatch`,
    );
    requireThat(
      await contract.paused({ blockTag }),
      `${item.name}: expected paused state`,
    );
    const token =
      item.name === "AlphaMissionEscrow"
        ? await contract.TOKEN({ blockTag })
        : await contract.stakingToken({ blockTag });
    requireThat(getAddress(token) === TOKEN, `${item.name}: token mismatch`);
    result.push({
      ...item,
      runtimeCodeHash: keccak256(code),
      owner: await contract.owner({ blockTag }),
      paused: true,
    });
  }
  return result;
}
