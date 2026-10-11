import { readFile, writeFile } from "node:fs/promises";
import { JsonRpcProvider } from "ethers";
import {
  createPlan,
  validateRpcUrls,
  verifyNetwork,
  requireThat,
  digest,
} from "./lib.mjs";

try {
  const [configPath, outputPath] = process.argv.slice(2);
  requireThat(
    configPath && outputPath,
    "Usage: npm run deploy:plan -- /private/config.json /private/plan.json",
  );
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const plan = await createPlan(config);
  const urls = [process.env.ALPHA_RPC_URL, process.env.ALPHA_RPC_URL_SECONDARY];
  validateRpcUrls(urls);
  const providers = urls.map(
    (url) => new JsonRpcProvider(url, undefined, { cacheTimeout: -1 }),
  );
  try {
    const block = await verifyNetwork(providers, config);
    for (const provider of providers) {
      requireThat(
        (await provider.getTransactionCount(config.deployer, "pending")) ===
          config.nonce,
        "Configured deployer nonce differs from pending RPC nonce",
      );
      requireThat(
        (await provider.getBalance(config.deployer)) >=
          BigInt(plan.maximumCostWei),
        "Insufficient ETH for the full bounded deployment",
      );
    }
    const bundle = { ...plan, observedFinalizedBlock: block };
    await writeFile(
      outputPath,
      JSON.stringify({ ...bundle, planHash: digest(bundle) }, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    console.log(
      `Read-only plan saved. Review every address, transaction, fee ceiling, expiry and plan hash before signing.\nPlan hash: ${digest(bundle)}`,
    );
  } finally {
    providers.forEach((p) => p.destroy());
  }
} catch (error) {
  console.error(
    `Deployment plan stopped: ${error.shortMessage ?? error.message}`,
  );
  process.exitCode = 1;
}
