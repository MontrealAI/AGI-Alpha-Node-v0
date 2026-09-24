#!/usr/bin/env node
import { Command } from 'commander';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { readdir, writeFile, mkdir } from 'node:fs/promises';
import {
  signOutcome,
  importOutcome,
  outcomeSummary,
  recordOperation,
  atomicJson,
  initializeNode,
  loadNode,
  readJson,
  runMission,
  reviewMission,
  pauseNode,
  exportMission,
  settlementPlan,
  verifyIdentity,
  signDetachedReview,
  importDetachedReview,
} from './node.js';
import { operate, engineSchema } from './runtime/engine.js';
import { specialistServer } from './runtime/specialists.js';
import {
  backupNode,
  restoreNode,
  serviceConfiguration,
} from './runtime/maintenance.js';
import { settleAndReinvest } from './runtime/transactions.js';
import { cycle, operationStatus, usageSchema } from './operations.js';
import { missionSourceSchema } from './operations.js';
import { verifyEvidenceBundle } from './node.js';
import {
  assuranceContext,
  signAssurance,
  verifyAssurance,
  qualifyNode,
  softwareFingerprint,
} from './qualification.js';
import { verifyMeasurementArtifacts } from './measurement.js';
import { importExpense } from './node.js';
import { signExpense } from './expenses.js';
import { observeSettlement } from './settlement.js';
import { operatorServer } from './operator.js';
const cli = new Command()
  .name('alpha-node')
  .description('$AGIALPHA standalone opportunity and evidence node')
  .version('3.1.0');
cli.option('--home <directory>', 'Private node data directory', '.alpha-node');
const home = () => resolve(cli.opts().home);
const print = (x) => console.log(JSON.stringify(x, null, 2));
cli
  .command('init')
  .requiredOption('--ens <name>', 'Your alpha.node.agi.eth subname')
  .option('--reviewer <address>', 'Independent reviewer address')
  .option('--live', 'Require Ethereum ENS verification')
  .action(async (o) =>
    print(
      await initializeNode(home(), {
        ensName: o.ens,
        reviewer: o.reviewer,
        mode: o.live ? 'live' : 'local',
        rpcUrl: process.env.ALPHA_RPC_URL,
        privateKey: process.env.ALPHA_NODE_PRIVATE_KEY,
      }),
    ),
  );
cli
  .command('run <mission>')
  .description('Analyze supplied evidence; sign and persist the deliverable')
  .action(async (file) => {
    const r = await runMission(
      home(),
      await readJson(resolve(file), 2_000_000),
    );
    print({
      id: r.mission.id,
      workId: r.workId,
      evidenceHash: r.hash,
      recommendation: r.analysis.recommendation,
      status: r.status,
      replay: r.replay ?? false,
    });
  });
cli.command('status').action(async () => {
  const n = await loadNode(home());
  print({
    mode: n.config.mode,
    ens: n.config.ensName,
    address: n.config.address,
    reviewer: n.config.reviewer,
    paused: n.paused,
    ledgerVerified: true,
    head: n.head,
    missions: [...n.runs.values()].map((r) => ({
      id: r.mission.id,
      decision: r.review?.decision ?? 'awaiting-review',
      reward: r.reward,
    })),
  });
});
cli.command('doctor').action(async () => {
  const n = await loadNode(home());
  print({
    nodeVersion: process.version,
    ledgerVerified: true,
    identity: await verifyIdentity(n.config),
    providerConfigured: !!n.config.provider,
    reviewerConfigured: !!n.config.reviewer,
  });
});
cli.command('pause').action(async () => print(await pauseNode(home(), true)));
cli.command('resume').action(async () => print(await pauseNode(home(), false)));
cli
  .command('review <missionId>')
  .requiredOption('--decision <decision>', 'accepted or rejected')
  .requiredOption('--notes <notes>', 'Review evidence and limitations')
  .action(async (missionId, o) => {
    if (!process.env.ALPHA_REVIEWER_PRIVATE_KEY)
      throw new Error(
        'Set ALPHA_REVIEWER_PRIVATE_KEY in the reviewer environment',
      );
    const r = await reviewMission(
      home(),
      missionId,
      o.decision,
      o.notes,
      process.env.ALPHA_REVIEWER_PRIVATE_KEY,
    );
    print({ decision: r.decision, reviewHash: r.hash });
  });
cli
  .command('export <missionId>')
  .requiredOption('--out <directory>', 'Deliverable directory')
  .action(async (missionId, o) =>
    print(await exportMission(home(), missionId, resolve(o.out))),
  );
cli
  .command('review-sign <evidence>')
  .requiredOption('--decision <decision>', 'accepted or rejected')
  .requiredOption('--notes <notes>', 'Independent review findings')
  .requiredOption('--out <file>', 'Signed review file')
  .option(
    '--escrow <address>',
    'Also authorize a domain-bound on-chain acceptance relay',
  )
  .option('--expires-at <seconds>', 'Settlement approval expiry, Unix seconds')
  .action(async (file, o) => {
    if (!process.env.ALPHA_REVIEWER_PRIVATE_KEY)
      throw new Error('Set ALPHA_REVIEWER_PRIVATE_KEY on the reviewer machine');
    const signed = await signDetachedReview(
      await readJson(resolve(file)),
      o.decision,
      o.notes,
      process.env.ALPHA_REVIEWER_PRIVATE_KEY,
      o.escrow ? { escrow: o.escrow, expiresAt: Number(o.expiresAt) } : null,
    );
    await writeFile(resolve(o.out), JSON.stringify(signed, null, 2), {
      flag: 'wx',
      mode: 0o600,
    });
    print({ review: resolve(o.out) });
  });
cli
  .command('review-import <file>')
  .action(async (file) =>
    print(
      await importDetachedReview(home(), await readJson(resolve(file), 10000)),
    ),
  );
cli
  .command('settlement-plan <missionId>')
  .requiredOption('--treasury <address>', 'Deployed AlphaMissionEscrow address')
  .action(async (missionId, o) => {
    const n = await loadNode(home());
    const r = n.runs.get(missionId);
    if (!r) throw new Error('Unknown mission');
    print(settlementPlan(n.config, r, o.treasury));
  });
cli
  .command('watch <inbox>')
  .description('Process JSON missions sequentially until interrupted')
  .option('--interval <seconds>', 'Polling interval', '10')
  .action(async (inbox, o) => {
    const seconds = Number(o.interval);
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600)
      throw new Error('Interval must be 1–3600 seconds');
    let stopped = false;
    const stop = () => {
      stopped = true;
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    try {
      while (!stopped) {
        const n = await loadNode(home());
        if (!n.paused)
          for (const file of (await readdir(resolve(inbox)))
            .filter((f) => f.endsWith('.json'))
            .sort()) {
            if (stopped) break;
            try {
              const result = await runMission(
                home(),
                await readJson(join(resolve(inbox), file), 2_000_000),
              );
              if (!result.replay)
                print({
                  mission: result.mission.id,
                  status: result.status,
                  evidenceHash: result.hash,
                });
            } catch (e) {
              console.error(JSON.stringify({ file, error: e.message }));
            }
          }
        for (let i = 0; i < seconds * 4 && !stopped; i++)
          await new Promise((r) => setTimeout(r, 250));
      }
    } finally {
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
    }
  });
cli
  .command('settlement-observe <missionId>')
  .requiredOption('--escrow <address>', 'Deployed escrow')
  .requiredOption(
    '--code-hash <hash>',
    'Independently verified deployed bytecode hash',
  )
  .action(async (missionId, o) => {
    const n = await loadNode(home());
    const run = n.runs.get(missionId);
    if (!run) throw new Error('Unknown mission');
    if (!process.env.ALPHA_RPC_URL || !process.env.ALPHA_SECOND_RPC_URL)
      throw new Error('Set two independent HTTPS RPC endpoints');
    print(
      await observeSettlement(n.config, run, {
        escrow: o.escrow,
        codeHash: o.codeHash,
        rpcUrls: [process.env.ALPHA_RPC_URL, process.env.ALPHA_SECOND_RPC_URL],
      }),
    );
  });
cli
  .command('outcomes')
  .action(async () => print(outcomeSummary(await loadNode(home()))));
cli
  .command('outcome-sign <evidence> <measurement>')
  .requiredOption('--out <file>', 'Signed measurement output')
  .action(async (evidence, measurement, o) => {
    if (!process.env.ALPHA_REVIEWER_PRIVATE_KEY)
      throw new Error('Reviewer key required');
    const signed = await signOutcome(
      await readJson(resolve(evidence)),
      await readJson(resolve(measurement), 12000),
      process.env.ALPHA_REVIEWER_PRIVATE_KEY,
    );
    await writeFile(resolve(o.out), JSON.stringify(signed, null, 2), {
      flag: 'wx',
      mode: 0o600,
    });
    print({ outcome: resolve(o.out) });
  });
cli.command('outcome-import <file>').action(async (file) => {
  const result = await importOutcome(
    home(),
    await readJson(resolve(file), 20000),
  );
  print({ outcomeHash: result.hash });
});
cli
  .command('recover-reservation <cycle>')
  .description(
    'Close an interrupted reservation as failed, retaining its cost and preventing retries',
  )
  .action(async (cycleId) => {
    const n = await loadNode(home());
    if (!n.paused) throw new Error('Pause and stop workers before recovery');
    const pending = operationStatus(n).unresolved.find(
      (r) => r.cycle === cycleId,
    );
    if (!pending) throw new Error('Unknown unresolved reservation');
    print(
      await recordOperation(home(), {
        phase: 'failed',
        cycle: cycleId,
        missionId: pending.missionId,
        reservedMicroUsd: 0,
        reason:
          'Operator acknowledged interrupted execution; reservation retained',
      }),
    );
  });
cli
  .command('cycle')
  .description(
    'Discover candidates from pipeline.json and fresh usage measurements',
  )
  .action(async () => print(await cycle(home())));
cli
  .command('operations')
  .action(async () => print(operationStatus(await loadNode(home()))));
cli
  .command('serve')
  .description('Open the authenticated loopback operator interface')
  .option('--port <port>', 'Local port; 0 selects an available port', '0')
  .action(async (o) => {
    const port = Number(o.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535)
      throw new Error('Invalid port');
    await loadNode(home());
    const { server, url } = await operatorServer(home(), { port });
    console.log(`Private operator URL (do not share): ${url}`);
    const stop = () => {
      server.close();
      server.closeIdleConnections();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
cli
  .command('autopilot')
  .option(
    '--runtime',
    'Run the integrated planner, specialists, execution and settlement loop',
  )
  .description(
    'Run configured usage discovery sequentially, with backoff on failure',
  )
  .option('--interval <seconds>', 'Cycle interval, 10–3600 seconds', '60')
  .action(async (o) => {
    const interval = Number(o.interval);
    if (!Number.isInteger(interval) || interval < 10 || interval > 3600)
      throw new Error('Interval must be 10–3600 seconds');
    let stopped = false;
    let failures = 0;
    const stop = () => {
      stopped = true;
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    try {
      while (!stopped) {
        try {
          if (!(await loadNode(home())).paused)
            print(
              o.runtime
                ? await operate(home(), {
                    rpcUrls: [
                      process.env.ALPHA_RPC_URL,
                      process.env.ALPHA_SECOND_RPC_URL,
                    ],
                  })
                : await cycle(home()),
            );
          failures = 0;
        } catch (e) {
          failures++;
          console.error(
            JSON.stringify({ error: e.message, consecutiveFailures: failures }),
          );
        }
        if (failures >= 5) {
          await pauseNode(home(), true);
          console.error(
            'Paused after five consecutive failures; inspect and resume explicitly.',
          );
          failures = 0;
        }
        const delay = Math.min(3600, interval * 2 ** Math.min(failures, 5));
        for (let i = 0; i < delay * 4 && !stopped; i++)
          await new Promise((r) => setTimeout(r, 250));
      }
    } finally {
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
    }
  });
cli
  .command('setup')
  .requiredOption('--ens <name>', 'Node ENS label')
  .requiredOption('--reviewer <address>', 'Separate reviewer address')
  .option('--usage <file>', 'Authorized structured usage file')
  .option('--mission <file>', 'Fresh general mission envelope')
  .option('--live', 'Verify the supplied owner signer against mainnet ENS')
  .action(async (o) => {
    if (!!o.usage === !!o.mission)
      throw new Error('Supply exactly one of --usage or --mission');
    (o.mission ? missionSourceSchema : usageSchema).parse(
      await readJson(
        resolve(o.usage ?? o.mission),
        o.mission ? 1000000 : 100000,
      ),
    );
    const initialized = await initializeNode(home(), {
      ensName: o.ens,
      reviewer: o.reviewer,
      mode: o.live ? 'live' : 'local',
      rpcUrl: process.env.ALPHA_RPC_URL,
      privateKey: process.env.ALPHA_NODE_PRIVATE_KEY,
    });
    const pipeline = await readJson(
      new URL('../../examples/alpha/pipeline.json', import.meta.url),
    );
    pipeline.source = resolve(o.usage ?? o.mission);
    pipeline.sourceKind = o.mission ? 'mission' : 'usage';
    await atomicJson(join(home(), 'pipeline.json'), pipeline);
    await atomicJson(
      join(home(), 'engine.json'),
      engineSchema.parse({ schema: 1, adaptive: { enabled: true } }),
    );
    print({
      ...initialized,
      configured: true,
      transactionsEnabled: false,
      next: 'Review pipeline assumptions, then use operate or serve. Add explicit owner-authorized actions and peers to engine.json.',
    });
  });
cli
  .command('operate')
  .action(async () =>
    print(
      await operate(home(), {
        rpcUrls: [process.env.ALPHA_RPC_URL, process.env.ALPHA_SECOND_RPC_URL],
      }),
    ),
  );
cli
  .command('specialist')
  .option('--port <port>', 'Loopback listener port', '0')
  .action(async (o) => {
    const port = Number(o.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535)
      throw new Error('Invalid port');
    const result = await specialistServer(
      home(),
      await readJson(join(home(), 'specialist.json'), 20000),
      { port },
    );
    print({ url: result.url, address: result.address });
    const stop = () => {
      result.server.close();
      result.server.closeIdleConnections();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
cli
  .command('settle <missionId>')
  .description(
    'Execute only the enabled, pinned and bounded engine.json token policy',
  )
  .action(async (missionId) => {
    const config = engineSchema.parse(
      await readJson(join(home(), 'engine.json')),
    );
    if (!config.transactions)
      throw new Error('Configure an explicit transaction policy first');
    print(
      await settleAndReinvest(home(), missionId, config.transactions, [
        process.env.ALPHA_RPC_URL,
        process.env.ALPHA_SECOND_RPC_URL,
      ]),
    );
  });
cli
  .command('backup <file>')
  .action(async (file) =>
    print(
      await backupNode(
        home(),
        resolve(file),
        process.env.ALPHA_BACKUP_PASSWORD,
      ),
    ),
  );
cli
  .command('restore <file>')
  .description(
    'Restore an encrypted backup into a new --home directory; keep it paused',
  )
  .action(async (file) =>
    print(
      await restoreNode(
        resolve(file),
        home(),
        process.env.ALPHA_BACKUP_PASSWORD,
      ),
    ),
  );
cli
  .command('service-config <platform>')
  .requiredOption('--out <file>', 'New launchd plist or systemd user service')
  .action(async (platform, o) => {
    await loadNode(home());
    const content = serviceConfiguration(platform, {
      nodePath: process.execPath,
      cliPath: fileURLToPath(import.meta.url),
      home: home(),
    });
    await writeFile(resolve(o.out), content, { flag: 'wx', mode: 0o600 });
    print({
      file: resolve(o.out),
      installed: false,
      note: 'Review and install with your platform service manager; provide secrets through its protected environment.',
    });
  });
cli
  .command('verify-bundle <file>')
  .option('--expected-node <address>', 'Node address verified out of band')
  .option(
    '--expected-reviewer <address>',
    'Reviewer address verified out of band',
  )
  .option(
    '--artifacts <directory>',
    'Verify measurement bytes named SHA256.bin',
  )
  .action(async (file, o) => {
    const bundle = await readJson(resolve(file)),
      report = verifyEvidenceBundle(bundle, o);
    if (o.artifacts)
      report.artifacts = await verifyMeasurementArtifacts(
        bundle.run.outcome?.measurement,
        resolve(o.artifacts),
      );
    print(report);
  });
cli
  .command('fingerprint')
  .action(async () => print(await softwareFingerprint()));
cli
  .command('qualify')
  .option('--out <file>', 'Save a new qualification report')
  .option('--enforce', 'Exit 2 when any evidence gate is unmet')
  .action(async (o) => {
    const report = await qualifyNode(home());
    if (o.out)
      await writeFile(resolve(o.out), JSON.stringify(report, null, 2) + '\n', {
        flag: 'wx',
        mode: 0o600,
      });
    print(report);
    if (o.enforce && !report.gatePassed) process.exitCode = 2;
  });
cli
  .command('assurance-request')
  .requiredOption(
    '--role <role>',
    'security, recovery, operations or reviewer-independence',
  )
  .requiredOption('--out <file>', 'Request for an external assessor')
  .action(async (o) => {
    if (
      !['security', 'recovery', 'operations', 'reviewer-independence'].includes(
        o.role,
      )
    )
      throw new Error('Unknown assurance role');
    const c = await assuranceContext(home());
    const request = {
      type: 'agialpha-assurance-v1',
      node: c.node.config.address,
      role: o.role,
      softwareDigest: c.softwareDigest,
      configurationDigest: c.configurationDigest,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      artifactHash: 'REPLACE_WITH_0x_PREFIXED_SHA256_OF_ASSESSMENT',
      statement: 'REPLACE_WITH_ACTUAL_ASSESSOR_FINDINGS_AND_LIMITATIONS',
    };
    await writeFile(resolve(o.out), JSON.stringify(request, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
    print({ request: resolve(o.out), signed: false });
  });
cli
  .command('assurance-sign <file>')
  .requiredOption('--out <file>', 'Signed assessment')
  .action(async (file, o) => {
    if (!process.env.ALPHA_ASSESSOR_PRIVATE_KEY)
      throw new Error(
        'Set ALPHA_ASSESSOR_PRIVATE_KEY only in the assessor environment',
      );
    const signed = await signAssurance(
      await readJson(resolve(file), 12000),
      process.env.ALPHA_ASSESSOR_PRIVATE_KEY,
    );
    await writeFile(resolve(o.out), JSON.stringify(signed, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
    print({ assurance: resolve(o.out) });
  });
cli.command('assurance-import <file>').action(async (file) => {
  const signed = await readJson(resolve(file), 12000),
    context = await assuranceContext(home());
  const verified = verifyAssurance(signed, context);
  await mkdir(join(home(), 'assurances'), { recursive: true, mode: 0o700 });
  await atomicJson(join(home(), 'assurances', `${verified.hash}.json`), signed);
  print(verified);
});
cli
  .command('expense-request <cycle>')
  .requiredOption('--out <file>', 'Unsigned failed-attempt expense request')
  .action(async (cycle, o) => {
    const n = await loadNode(home());
    const failed = operationStatus(n).failedAttempts.find(
      (e) => e.cycle === cycle && !e.expenseHash,
    );
    if (!failed)
      throw new Error('No unaccounted failed attempt for this cycle');
    const request = {
      type: 'expense-attestation-v1',
      node: n.config.address,
      ensName: n.config.ensName,
      reviewer: n.config.reviewer,
      cycle,
      costUsd: null,
      humanMinutes: null,
      evidenceHash: 'REPLACE_WITH_0x_PREFIXED_SHA256_OF_COST_RECORDS',
      observedAt: new Date().toISOString(),
      notes:
        'REPLACE_WITH_ACTUAL_COSTS_AND_HUMAN_EFFORT_INCLUDING_ZERO_COST_JUSTIFICATION',
    };
    await writeFile(resolve(o.out), JSON.stringify(request, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
    print({ request: resolve(o.out), signed: false });
  });
cli
  .command('expense-sign <file>')
  .requiredOption('--out <file>', 'Signed expense')
  .action(async (file, o) => {
    if (!process.env.ALPHA_REVIEWER_PRIVATE_KEY)
      throw new Error(
        'Set ALPHA_REVIEWER_PRIVATE_KEY only in the reviewer environment',
      );
    const signed = await signExpense(
      await readJson(resolve(file), 12000),
      process.env.ALPHA_REVIEWER_PRIVATE_KEY,
    );
    await writeFile(resolve(o.out), JSON.stringify(signed, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
    print({ expense: resolve(o.out) });
  });
cli.command('expense-import <file>').action(async (file) => {
  const result = await importExpense(
    home(),
    await readJson(resolve(file), 12000),
  );
  print({ expenseHash: result.attestation.hash });
});
cli.parseAsync().catch((e) => {
  console.error(`Alpha Node: ${e.message}`);
  process.exitCode = 1;
});
