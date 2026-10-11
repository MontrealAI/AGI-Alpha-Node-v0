import assert from "node:assert/strict";
import { readFile, readdir, stat, access } from "node:fs/promises";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";

const root = resolve(import.meta.dirname, "../site");
const pkg = JSON.parse(
  await readFile(resolve(root, "../package.json"), "utf8"),
);
const html = await readFile(resolve(root, "index.html"), "utf8"),
  dom = new JSDOM(html),
  d = dom.window.document;
assert.ok(html.includes(`v${pkg.version}`), "Site version must match release");
assert.equal(d.querySelectorAll("h1").length, 1);
assert.ok(
  d
    .querySelector('meta[http-equiv="Content-Security-Policy"]')
    .content.includes("connect-src 'none'"),
);
assert.ok(d.querySelector("noscript"));
for (const el of d.querySelectorAll("[src],[href]")) {
  const value = el.getAttribute("src") ?? el.getAttribute("href");
  if (value.startsWith("#"))
    assert.ok(d.getElementById(value.slice(1)), `Missing anchor ${value}`);
  else if (value.startsWith("https://")) continue;
  else {
    assert.ok(
      !value.includes(":") && !value.startsWith("//"),
      `Unexpected URL ${value}`,
    );
    await access(resolve(root, value));
  }
}
let bytes = 0;
for (const file of await readdir(root)) {
  const s = await stat(resolve(root, file));
  if (s.isFile()) bytes += s.size;
}
assert.ok(bytes < 150000, `Site exceeds 150 KB source budget: ${bytes}`);
dom.window.close();
console.log(
  `Static site checks passed; ${bytes} bytes; release v${pkg.version}.`,
);
