import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AbiCoder } from "ethers";
import { artifact, ROOT, TOKEN, NAMES, requireThat } from "./lib.mjs";

const output = process.argv[2];
requireThat(
  output,
  "Usage: npm run deploy:export -- /private/new-verification-directory",
);
await mkdir(output, { mode: 0o700 });
for (const name of NAMES) {
  const compiled = await artifact(name),
    build = JSON.parse(
      await readFile(
        resolve(
          ROOT,
          `build/hardhat/artifacts/build-info/${compiled.buildInfoId}.json`,
        ),
        "utf8",
      ),
    );
  await writeFile(
    resolve(output, `${name}.standard-input.json`),
    JSON.stringify(build.input, null, 2) + "\n",
    { flag: "wx" },
  );
  await writeFile(
    resolve(output, `${name}.verification.json`),
    JSON.stringify(
      {
        compiler: build.solcLongVersion,
        contract: `${compiled.inputSourceName}:${name}`,
        constructorArguments:
          name === "AlphaNodeManager"
            ? AbiCoder.defaultAbiCoder().encode(["address"], [TOKEN]).slice(2)
            : "",
        license: "MIT",
        optimizerRuns: 200,
        evmVersion: "paris",
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
}
console.log(
  "Standard JSON inputs and constructor arguments exported. Verify each deployed address with its exact input on the explorer.",
);
