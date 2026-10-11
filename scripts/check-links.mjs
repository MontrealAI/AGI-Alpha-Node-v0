import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, ".."),
  directory = await mkdtemp(join(tmpdir(), "alpha-links-"));
try {
  const config = JSON.parse(
    await readFile(resolve(root, ".markdown-link-check.json"), "utf8"),
  );
  // A new Pages version cannot be live before its validating PR is merged.
  // Validate the exact checked-out target; inspect HTTPS delivery after publishing.
  config.replacementPatterns = [
    {
      pattern:
        "^https://montrealai\\.github\\.io/AGI-Alpha-Node-v0/(?:\\?lang=fr)?$",
      replacement: pathToFileURL(resolve(root, "site/index.html")).href,
    },
  ];
  const path = join(directory, "config.json");
  await writeFile(path, JSON.stringify(config));
  const files = [
    "README.md",
    "docs/README.md",
    "docs/manifesto.md",
    "docs/economics.md",
    "docs/identity.md",
    "docs/getting-started.md",
    "docs/getting-started.fr.md",
    "docs/ethereum-deployment.md",
    "docs/website.md",
  ];
  const result = spawnSync(
    process.execPath,
    [
      resolve(root, "node_modules/markdown-link-check/markdown-link-check"),
      "-c",
      path,
      ...files,
      "--quiet",
    ],
    { cwd: root, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(directory, { recursive: true, force: true });
}
