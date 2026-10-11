# Your first Alpha Node, step by step

<!-- markdownlint-disable MD013 -->

**[Open the visual guide](https://montrealai.github.io/AGI-Alpha-Node-v0/)** · **[Lire en français](getting-started.fr.md)**

You can explore the website without an account, a wallet, or an installation. Running a node means installing a program on your own computer. The examples are free to run and use fictional inputs; your computer and internet connection have their usual costs. Optional model services and later Ethereum transactions can cost money.

## 1. Choose a computer

Use a Mac or a supported Linux computer. The release checks Linux and macOS installation and local workflows. This does not establish unattended reliability on every machine. Windows, WSL and mobile devices are not qualified by those checks. You can still read the website on them.

Install **Node.js 22.14 or later in a supported LTS line**, with **npm 10 or later**, from [Node.js](https://nodejs.org/en/download). The repository's automated release checks use Node.js 22. Avoid obsolete Node versions.

## 2. Download and extract

Open the [latest release](https://github.com/MontrealAI/AGI-Alpha-Node-v0/releases/latest). Under **Assets**, download `AGI_Alpha_Node_v3.3.0.zip` and `SHA256SUMS.txt` from that same release. These are source files with installation instructions, not an app-store installer. No account is required to download a public release.

### Verify your download

Keep both files together. In a terminal opened in your download folder, run the appropriate command:

| Computer | Command |
| --- | --- |
| Mac | `shasum -a 256 -c SHA256SUMS.txt` |
| Linux | `sha256sum -c SHA256SUMS.txt` |

The named ZIP should report **OK**. A checksum checks download integrity against the published checksum; it does not substitute for source review. If the check fails, stop and download both files again. Do not install a mismatched archive.

Double-click the ZIP to extract it. Keep the extracted folder somewhere easy to find. If an extra outer folder appears, use the inner folder containing `package.json`.

## 3. Open the terminal in that folder

On a **Mac**, open **Applications → Utilities → Terminal**. Type `cd` followed by a space, drag the extracted folder onto the Terminal window, and press Return. On **Linux**, your file manager may offer **Open in Terminal** inside the folder; otherwise use `cd` followed by the quoted full folder path.

Check the installed tools:

```bash
node --version
npm --version
```

If a command is not found, finish installing Node.js, close the terminal, and open a new terminal. You may ask a trusted helper to assist with this installation. They do not need a seed phrase or wallet to run the examples.

## 4. Run two commands

Run each line separately and wait for it to finish:

```bash
npm ci
npm run demo:work
```

`npm ci` downloads the exact dependencies in the lockfile. The second command runs three local workflows: invoice reconciliation, resource allocation, and data-quality checks. It uses supplied data, separate test signing roles, and local evidence. It does not send token payments, connect an AI provider, or establish independent human review.

## 5. Read what happened

Open `alpha-work-output` in the project folder. Its `invoices`, `allocation` and `quality` folders contain `report.md`, evidence and result files. Open `.md` files in a text editor. JSON is structured data; CSV files can be opened in a spreadsheet program.

These outputs show how the software works. They are not real customer work or evidence of income. To rerun a demo, preserve the previous output and move its output directory elsewhere first; demonstrations refuse to overwrite evidence.

## 6. Set up your own private workspace

When you are comfortable with the examples, follow [START HERE](../START_HERE.md). It explains source formats, a separate reviewer, limits, private setup and the local operator interface. Do not copy commands containing placeholder addresses without replacing and checking them.

The `serve` command prints a private browser URL for your node. It is different from the public welcome website. Keep that URL and the node directory private. If you configure an AI provider, task inputs may be sent to that provider. Set provider-side spending limits as well as local limits.

Transactions and external changes start disabled. [Ethereum deployment](ethereum-deployment.md) is a separate operator procedure. This software release does not deploy contracts on your behalf.

## If something does not work

| What you see | What to do |
| --- | --- |
| `package.json` not found | Open a terminal in the extracted inner project folder. |
| Node version or engine error | Check `node --version`; install a supported Node.js 22.14+ LTS version. |
| Native build error on Mac | Install Apple's Command Line Tools with `xcode-select --install`, then rerun `npm ci`. |
| Native build error on Linux | Install the distribution's C/C++ compiler, make and Python build tools, then rerun `npm ci`. |
| Existing demo output | Preserve and move the old output folder; use a fresh output location. |
| Permission denied | Use a folder you own. Do not run the node or `npm ci` with `sudo`. |
| Private interface cannot open | Keep `serve` running and use its exact printed URL on the same computer. |
| Qualification is incomplete | Follow the missing-evidence list; a demo cannot establish real payments or external assessments. |

Ask for help through [GitHub issues](https://github.com/MontrealAI/AGI-Alpha-Node-v0/issues). Share the command, error, operating system and Node version. Remove keys, tokens, RPC credentials, private files and private operator URLs. GitHub issues are public.

Before upgrading an existing node, read [backup and recovery](alpha-recovery.md). Stop workers, make an encrypted backup, retain a trusted ledger-head checkpoint and keep a tested restoration path.
