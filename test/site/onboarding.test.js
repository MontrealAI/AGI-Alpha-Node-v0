import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
const html = readFileSync(
  new URL("../../site/index.html", import.meta.url),
  "utf8",
);
const script = readFileSync(
  new URL("../../site/app.js", import.meta.url),
  "utf8",
);
function app(options = {}) {
  const dom = new JSDOM(html, {
    url: "https://montrealai.github.io/AGI-Alpha-Node-v0/",
    runScripts: "outside-only",
  });
  if (options.noStorage)
    Object.defineProperty(dom.window, "localStorage", {
      get() {
        throw new Error("blocked");
      },
    });
  dom.window.eval(script);
  return dom;
}
function click(doc, selector) {
  doc.querySelector(selector).click();
}
describe("public onboarding", () => {
  it("keeps setup blocked until choices are made and gives a useful Mac plan", () => {
    const dom = app(),
      d = dom.window.document;
    expect(d.querySelector("#next").disabled).toBe(true);
    click(d, "input[value=try]");
    click(d, "#next");
    expect(d.querySelector("#next").disabled).toBe(true);
    click(d, "input[value=mac]");
    click(d, "#next");
    expect(d.querySelector("#wizard-content").textContent).toContain(
      "npm run demo:work",
    );
    expect(d.activeElement.id).toBe("wizard-content");
    click(d, "#back");
    expect(d.querySelector("input[value=mac]").checked).toBe(true);
    dom.window.close();
  });
  it.each(["try", "operate", "review"])(
    "provides all device paths for %s without inventing Windows support",
    (goal) => {
      for (const device of ["mac", "linux", "windows"]) {
        const dom = app(),
          d = dom.window.document;
        click(d, `input[value=${goal}]`);
        click(d, "#next");
        click(d, `input[value=${device}]`);
        click(d, "#next");
        expect(d.querySelector("#wizard-content a")?.href).toMatch(/^https:/);
        if (device === "windows")
          expect(d.querySelector("#wizard-content").textContent).toContain(
            "not qualified",
          );
        click(d, "#next");
        expect(d.querySelector("#next").disabled).toBe(true);
        dom.window.close();
      }
    },
  );
  it("switches the complete flow to French without losing the current selection", () => {
    const dom = app(),
      d = dom.window.document;
    click(d, "input[value=try]");
    click(d, "#next");
    click(d, "input[value=linux]");
    click(d, "#language");
    expect(d.documentElement.lang).toBe("fr");
    expect(d.querySelector("input[value=linux]").checked).toBe(true);
    click(d, "#next");
    expect(d.querySelector("#wizard-content").textContent).toContain(
      "Vos prochaines étapes",
    );
    expect(d.querySelector("#written-guide").href).toContain(
      "getting-started.fr.md",
    );
    expect(d.querySelectorAll("[data-i18n]")).not.toHaveLength(0);
    dom.window.close();
  });
  it("labels the example and does not ask for a wallet or upload", () => {
    const dom = app(),
      d = dom.window.document;
    click(d, "#check-example");
    expect(d.querySelector("#example-result").textContent).toContain(
      "$30 difference found",
    );
    expect(d.querySelector("input[type=file]")).toBeNull();
    expect(script).not.toMatch(/fetch\(|XMLHttpRequest|ethereum\.request/);
    dom.window.close();
  });
  it("works with storage blocked and exposes the larger text state", () => {
    const dom = app({ noStorage: true }),
      d = dom.window.document;
    click(d, "#large-text");
    expect(d.documentElement.classList.contains("large-text")).toBe(true);
    expect(d.querySelector("#large-text").getAttribute("aria-pressed")).toBe(
      "true",
    );
    click(d, "#language");
    expect(d.documentElement.lang).toBe("fr");
    dom.window.close();
  });
  it("provides a no-script guide and validates all local links", () => {
    const dom = app(),
      d = dom.window.document;
    expect(d.querySelector("noscript")).not.toBeNull();
    for (const a of d.querySelectorAll('a[href^="#"]'))
      expect(d.getElementById(a.hash.slice(1))).not.toBeNull();
    for (const id of [...d.querySelectorAll("[id]")].map((e) => e.id))
      expect(d.querySelectorAll(`[id="${id}"]`).length).toBe(1);
    dom.window.close();
  });
});
