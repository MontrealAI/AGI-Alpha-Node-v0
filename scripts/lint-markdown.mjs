import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { lint } from "markdownlint/promise";

// Use the maintained lint engine directly. File enumeration needs no glob parser
// and cannot recurse through symlinks or downloaded/generated dependency trees.
const excluded = new Set([
  "node_modules",
  ".git",
  "build",
  "coverage",
  "dist",
  "evidence",
  "alpha-output",
  "alpha-runtime-output",
  "alpha-measured-output",
  "alpha-operations-output",
  "alpha-work-output",
]);
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory() && !excluded.has(entry.name)) await walk(path);
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(path);
  }
}
await walk(".");
const results = await lint({ files: files.sort() });
const output = Object.entries(results)
  .flatMap(([file, errors]) =>
    errors.map(
      (error) =>
        `${file}:${error.lineNumber} ${error.ruleNames[0]} ${error.ruleDescription}${error.errorDetail ? `: ${error.errorDetail}` : ""}`,
    ),
  )
  .join("\n");
if (output) {
  console.error(output);
  process.exitCode = 1;
} else
  console.log(
    `Markdown lint passed: ${files.length} documents (default rules and existing inline configuration).`,
  );
