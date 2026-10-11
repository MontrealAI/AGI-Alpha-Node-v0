import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { JsonRpcProvider, Wallet, keccak256 } from "ethers";
import {
  createPlan,
  validateRpcUrls,
  verifyNetwork,
  inspectContracts,
  requireThat,
  digest,
} from "./lib.mjs";

// Transactions are saved before broadcast. Existing journals require manual
// reconciliation; this script never retries or replaces an uncertain transaction.
try {
  const [planPath, journalPath] = process.argv.slice(2);
  requireThat(
    planPath && journalPath,
    "Usage: npm run deploy:send -- /private/plan.json /private/new-journal",
  );
  const { planHash, ...bundle } = JSON.parse(await readFile(planPath, "utf8"));
  requireThat(
    planHash === digest(bundle) &&
      process.env.ALPHA_APPROVED_PLAN_HASH === planHash,
    "Explicit approval of the exact plan hash is required",
  );
  requireThat(
    process.env.ALPHA_DEPLOY_CONFIRM === "ethereum-mainnet",
    "Set ALPHA_DEPLOY_CONFIRM=ethereum-mainnet only after reviewing the plan",
  );
  const rebuilt = await createPlan(bundle.config),
    { observedFinalizedBlock, ...original } = bundle;
  requireThat(
    digest(rebuilt) === digest(original),
    "Plan no longer matches source, artifacts or deployment policy",
  );
  const urls = [process.env.ALPHA_RPC_URL, process.env.ALPHA_RPC_URL_SECONDARY];
  validateRpcUrls(urls);
  const keyPath = process.env.ALPHA_DEPLOY_KEYSTORE;
  requireThat(
    keyPath && process.env.ALPHA_KEYSTORE_PASSWORD,
    "Provide an encrypted deployment keystore and password through a protected environment",
  );
  requireThat(
    ((await stat(keyPath)).mode & 0o077) === 0,
    "Keystore must not be group/world accessible (chmod 600)",
  );
  const wallet = await Wallet.fromEncryptedJson(
    await readFile(keyPath, "utf8"),
    process.env.ALPHA_KEYSTORE_PASSWORD,
  );
  delete process.env.ALPHA_KEYSTORE_PASSWORD;
  requireThat(
    wallet.address.toLowerCase() === bundle.config.deployer.toLowerCase(),
    "Keystore does not match the reviewed deployer",
  );
  const providers = urls.map(
    (url) => new JsonRpcProvider(url, undefined, { cacheTimeout: -1 }),
  );
  try {
    await verifyNetwork(providers, bundle.config);
    for (const provider of providers) {
      requireThat(
        (await provider.getTransactionCount(wallet.address, "pending")) ===
          bundle.config.nonce,
        "Deployer nonce changed; generate a new plan",
      );
      requireThat(
        (await provider.getBalance(wallet.address)) >=
          BigInt(bundle.maximumCostWei),
        "Insufficient ETH for all deployment transactions",
      );
    }
    const path = resolve(journalPath);
    await mkdir(path, { mode: 0o700 });
    await writeFile(
      resolve(path, "plan.json"),
      JSON.stringify({ ...bundle, planHash }, null, 2) + "\n",
      { mode: 0o600, flag: "wx" },
    );
    for (let index = 0; index < bundle.transactions.length; index++) {
      requireThat(
        Date.now() < Date.parse(bundle.config.validUntil),
        "Plan expired; stop and reconcile the journal",
      );
      const { action, ...request } = bundle.transactions[index];
      for (const provider of providers)
        requireThat(
          (await provider.getTransactionCount(wallet.address, "pending")) ===
            request.nonce,
          "Nonce drift; stop and reconcile",
        );
      const estimate = await providers[0].estimateGas({
        ...request,
        from: wallet.address,
      });
      requireThat(
        estimate <= BigInt(request.gasLimit),
        `${action}: estimated gas exceeds reviewed ceiling`,
      );
      const raw = await wallet.signTransaction(request),
        hash = keccak256(raw);
      await writeFile(
        resolve(path, `${index}-signed.json`),
        JSON.stringify({ action, hash, raw }) + "\n",
        { mode: 0o600, flag: "wx" },
      );
      console.log(
        `${index + 1}/${bundle.transactions.length}: ${action} — ${hash}`,
      );
      await providers[0].broadcastTransaction(raw);
      const receipt = await providers[0].waitForTransaction(
        hash,
        12,
        30 * 60 * 1000,
      );
      requireThat(
        receipt?.status === 1,
        `${action}: transaction unconfirmed or reverted; reconcile journal`,
      );
      const second = await providers[1].getTransactionReceipt(hash);
      requireThat(
        second?.status === 1 && second.blockHash === receipt.blockHash,
        `${action}: RPC receipt disagreement; reconcile journal`,
      );
      await writeFile(
        resolve(path, `${index}-receipt.json`),
        JSON.stringify(receipt, null, 2) + "\n",
        { mode: 0o600, flag: "wx" },
      );
    }
    const results = await Promise.all(
      providers.map((p) => inspectContracts(p, bundle)),
    );
    requireThat(
      digest(results[0]) === digest(results[1]),
      "Deployed contract inspection disagreement",
    );
    await writeFile(
      resolve(path, "inspection.json"),
      JSON.stringify(
        { contracts: results[0], sourceVerified: false, commissioned: false },
        null,
        2,
      ) + "\n",
      { mode: 0o600, flag: "wx" },
    );
    console.log(
      "Deployment confirmed and paused. Complete explorer source verification, finalized receipt checks, ownership-control proof and commissioning before enabling funds.",
    );
  } finally {
    providers.forEach((p) => p.destroy());
  }
} catch (error) {
  console.error(
    `Deployment stopped: ${error.shortMessage ?? error.message}. If a journal exists, reconcile its transaction hashes before any further deployment.`,
  );
  process.exitCode = 1;
}
