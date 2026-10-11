import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { JsonRpcProvider } from "ethers";
import {
  validateRpcUrls,
  verifyNetwork,
  inspectContracts,
  createPlan,
  digest,
  requireThat,
} from "./lib.mjs";

try {
  const [journalPath, outputPath] = process.argv.slice(2);
  requireThat(
    journalPath && outputPath,
    "Usage: npm run deploy:verify -- /private/journal /private/verification.json",
  );
  const { planHash, ...plan } = JSON.parse(
    await readFile(resolve(journalPath, "plan.json"), "utf8"),
  );
  requireThat(
    planHash === digest(plan),
    "Deployment journal plan hash mismatch",
  );
  const { observedFinalizedBlock, ...original } = plan;
  // Completed deployments can be inspected after their broadcast window expires.
  requireThat(
    digest(
      await createPlan(plan.config, Date.parse(plan.config.validUntil) - 1),
    ) === digest(original),
    "Journal plan does not match the reviewed source/build policy",
  );
  const urls = [process.env.ALPHA_RPC_URL, process.env.ALPHA_RPC_URL_SECONDARY];
  validateRpcUrls(urls);
  const providers = urls.map(
    (url) => new JsonRpcProvider(url, undefined, { cacheTimeout: -1 }),
  );
  try {
    const finalized = await verifyNetwork(providers, plan.config),
      receipts = [];
    for (let i = 0; i < plan.transactions.length; i++) {
      const { hash } = JSON.parse(
        await readFile(resolve(journalPath, `${i}-signed.json`), "utf8"),
      );
      const found = await Promise.all(
        providers.map((p) => p.getTransactionReceipt(hash)),
      );
      requireThat(
        found.every(
          (r) => r?.status === 1 && r.blockNumber <= finalized.number,
        ) && found[0].blockHash === found[1].blockHash,
        `Transaction ${i} is not consistently finalized`,
      );
      for (const provider of providers) {
        const block = await provider.getBlock(found[0].blockNumber);
        requireThat(
          block.hash === found[0].blockHash,
          "Receipt is not canonical",
        );
        const tx = await provider.getTransaction(hash),
          expected = plan.transactions[i];
        requireThat(
          tx &&
            tx.chainId === 1n &&
            tx.from.toLowerCase() === plan.config.deployer.toLowerCase() &&
            (tx.to ?? "").toLowerCase() === (expected.to ?? "").toLowerCase() &&
            tx.data === expected.data &&
            tx.nonce === expected.nonce &&
            tx.value === 0n,
          "On-chain transaction differs from reviewed plan",
        );
      }
      receipts.push({
        hash,
        blockNumber: found[0].blockNumber,
        blockHash: found[0].blockHash,
      });
    }
    const results = await Promise.all(
      providers.map((p) => inspectContracts(p, plan, finalized.number)),
    );
    requireThat(
      digest(results[0]) === digest(results[1]),
      "Contract state disagreement",
    );
    await writeFile(
      outputPath,
      JSON.stringify(
        {
          schema: 1,
          chainId: 1,
          planHash,
          sourceDigest: plan.sourceDigest,
          finalized,
          receipts,
          contracts: results[0],
          explorerSourceVerified: false,
          ownerControlProven: false,
          fundedLifecycleQualified: false,
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600, flag: "wx" },
    );
    console.log(
      "Finalized deployment checks passed. Explorer verification, owner control and funded commissioning remain separate requirements.",
    );
  } finally {
    providers.forEach((p) => p.destroy());
  }
} catch (error) {
  console.error(
    `Deployment verification stopped: ${error.shortMessage ?? error.message}`,
  );
  process.exitCode = 1;
}
