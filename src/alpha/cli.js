#!/usr/bin/env node
import { Command } from 'commander';
import { resolve, join } from 'node:path';
import { readdir, writeFile } from 'node:fs/promises';
import { signOutcome, importOutcome, outcomeSummary, recordOperation, initializeNode, loadNode, readJson, runMission, reviewMission, pauseNode, exportMission, settlementPlan, verifyIdentity, signDetachedReview, importDetachedReview } from './node.js';
import { cycle, operationStatus } from './operations.js';
import { observeSettlement } from './settlement.js';
import { operatorServer } from './operator.js';
const cli = new Command().name('alpha-node').description('$AGIALPHA standalone opportunity and evidence node').version('2.1.0');
cli.option('--home <directory>', 'Private node data directory', '.alpha-node');
const home = () => resolve(cli.opts().home);
const print = x => console.log(JSON.stringify(x, null, 2));
cli.command('init').requiredOption('--ens <name>', 'Your alpha.node.agi.eth subname').option('--reviewer <address>', 'Independent reviewer address').option('--live', 'Require Ethereum ENS verification').action(async o => print(await initializeNode(home(), { ensName: o.ens, reviewer: o.reviewer, mode: o.live ? 'live' : 'local', rpcUrl: process.env.ALPHA_RPC_URL, privateKey: process.env.ALPHA_NODE_PRIVATE_KEY })));
cli.command('run <mission>').description('Analyze supplied evidence; sign and persist the deliverable').action(async file => { const r = await runMission(home(), await readJson(resolve(file), 2_000_000)); print({ id: r.mission.id, workId: r.workId, evidenceHash: r.hash, recommendation: r.analysis.recommendation, status: r.status, replay: r.replay ?? false }); });
cli.command('status').action(async () => { const n = await loadNode(home()); print({ mode: n.config.mode, ens: n.config.ensName, address: n.config.address, reviewer: n.config.reviewer, paused: n.paused, ledgerVerified: true, head: n.head, missions: [...n.runs.values()].map(r => ({ id: r.mission.id, decision: r.review?.decision ?? 'awaiting-review', reward: r.reward })) }); });
cli.command('doctor').action(async () => { const n = await loadNode(home()); print({ nodeVersion: process.version, ledgerVerified: true, identity: await verifyIdentity(n.config), providerConfigured: !!n.config.provider, reviewerConfigured: !!n.config.reviewer }); });
cli.command('pause').action(async () => print(await pauseNode(home(), true)));
cli.command('resume').action(async () => print(await pauseNode(home(), false)));
cli.command('review <missionId>').requiredOption('--decision <decision>', 'accepted or rejected').requiredOption('--notes <notes>', 'Review evidence and limitations').action(async (missionId, o) => { if (!process.env.ALPHA_REVIEWER_PRIVATE_KEY) throw new Error('Set ALPHA_REVIEWER_PRIVATE_KEY in the reviewer environment'); const r = await reviewMission(home(), missionId, o.decision, o.notes, process.env.ALPHA_REVIEWER_PRIVATE_KEY); print({ decision: r.decision, reviewHash: r.hash }); });
cli.command('export <missionId>').requiredOption('--out <directory>', 'Deliverable directory').action(async (missionId, o) => print(await exportMission(home(), missionId, resolve(o.out))));
cli.command('review-sign <evidence>').requiredOption('--decision <decision>', 'accepted or rejected').requiredOption('--notes <notes>', 'Independent review findings').requiredOption('--out <file>', 'Signed review file').action(async (file, o) => {
  if (!process.env.ALPHA_REVIEWER_PRIVATE_KEY) throw new Error('Set ALPHA_REVIEWER_PRIVATE_KEY on the reviewer machine');
  const signed = await signDetachedReview(await readJson(resolve(file)), o.decision, o.notes, process.env.ALPHA_REVIEWER_PRIVATE_KEY);
  await writeFile(resolve(o.out), JSON.stringify(signed, null, 2), { flag: 'wx', mode: 0o600 }); print({ review: resolve(o.out) });
});
cli.command('review-import <file>').action(async file => print(await importDetachedReview(home(), await readJson(resolve(file), 10000))));
cli.command('settlement-plan <missionId>').requiredOption('--treasury <address>', 'Deployed AlphaMissionEscrow address').action(async (missionId, o) => { const n = await loadNode(home()); const r = n.runs.get(missionId); if (!r) throw new Error('Unknown mission'); print(settlementPlan(n.config, r, o.treasury)); });
cli.command('watch <inbox>').description('Process JSON missions sequentially until interrupted').option('--interval <seconds>', 'Polling interval', '10').action(async (inbox, o) => {
  const seconds = Number(o.interval); if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) throw new Error('Interval must be 1–3600 seconds');
  let stopped = false; const stop = () => { stopped = true; }; process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try { while (!stopped) { const n = await loadNode(home()); if (!n.paused) for (const file of (await readdir(resolve(inbox))).filter(f => f.endsWith('.json')).sort()) {
    if (stopped) break;
    try { const result = await runMission(home(), await readJson(join(resolve(inbox), file), 2_000_000)); if (!result.replay) print({ mission: result.mission.id, status: result.status, evidenceHash: result.hash }); }
    catch (e) { console.error(JSON.stringify({ file, error: e.message })); }
  } for (let i = 0; i < seconds * 4 && !stopped; i++) await new Promise(r => setTimeout(r, 250)); } }
  finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
});
cli.command('settlement-observe <missionId>').requiredOption('--escrow <address>', 'Deployed escrow').requiredOption('--code-hash <hash>', 'Independently verified deployed bytecode hash').action(async (missionId, o) => {
  const n = await loadNode(home()); const run = n.runs.get(missionId); if (!run) throw new Error('Unknown mission');
  if (!process.env.ALPHA_RPC_URL || !process.env.ALPHA_SECOND_RPC_URL) throw new Error('Set two independent HTTPS RPC endpoints');
  print(await observeSettlement(n.config, run, { escrow: o.escrow, codeHash: o.codeHash, rpcUrls: [process.env.ALPHA_RPC_URL, process.env.ALPHA_SECOND_RPC_URL] }));
});
cli.command('outcomes').action(async () => print(outcomeSummary(await loadNode(home()))));
cli.command('outcome-sign <evidence> <measurement>').requiredOption('--out <file>', 'Signed measurement output').action(async (evidence, measurement, o) => {
  if (!process.env.ALPHA_REVIEWER_PRIVATE_KEY) throw new Error('Reviewer key required');
  const signed = await signOutcome(await readJson(resolve(evidence)), await readJson(resolve(measurement), 12000), process.env.ALPHA_REVIEWER_PRIVATE_KEY);
  await writeFile(resolve(o.out), JSON.stringify(signed, null, 2), { flag: 'wx', mode: 0o600 }); print({ outcome: resolve(o.out) });
});
cli.command('outcome-import <file>').action(async file => { const result = await importOutcome(home(), await readJson(resolve(file), 20000)); print({ outcomeHash: result.hash }); });
cli.command('recover-reservation <cycle>').description('Close an interrupted reservation as failed, retaining its cost and preventing retries').action(async cycleId => {
  const n = await loadNode(home()); if (!n.paused) throw new Error('Pause and stop workers before recovery');
  const pending = operationStatus(n).unresolved.find(r => r.cycle === cycleId); if (!pending) throw new Error('Unknown unresolved reservation');
  print(await recordOperation(home(), { phase: 'failed', cycle: cycleId, missionId: pending.missionId, reservedMicroUsd: 0, reason: 'Operator acknowledged interrupted execution; reservation retained' }));
});
cli.command('cycle').description('Discover candidates from pipeline.json and fresh usage measurements').action(async () => print(await cycle(home())));
cli.command('operations').action(async () => print(operationStatus(await loadNode(home()))));
cli.command('serve').description('Open the authenticated loopback operator interface').option('--port <port>', 'Local port; 0 selects an available port', '0').action(async o => {
  const port = Number(o.port); if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
  await loadNode(home()); const { server, url } = await operatorServer(home(), { port });
  console.log(`Private operator URL (do not share): ${url}`);
  const stop = () => { server.close(); server.closeIdleConnections(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
});
cli.command('autopilot').description('Run configured usage discovery sequentially, with backoff on failure').option('--interval <seconds>', 'Cycle interval, 10–3600 seconds', '60').action(async o => {
  const interval = Number(o.interval); if (!Number.isInteger(interval) || interval < 10 || interval > 3600) throw new Error('Interval must be 10–3600 seconds');
  let stopped = false; let failures = 0; const stop = () => { stopped = true; }; process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try { while (!stopped) {
    try { if (!(await loadNode(home())).paused) print(await cycle(home())); failures = 0; }
    catch (e) { failures++; console.error(JSON.stringify({ error: e.message, consecutiveFailures: failures })); }
    if (failures >= 5) { await pauseNode(home(), true); console.error('Paused after five consecutive failures; inspect and resume explicitly.'); failures = 0; }
    const delay = Math.min(3600, interval * 2 ** Math.min(failures, 5));
    for (let i = 0; i < delay * 4 && !stopped; i++) await new Promise(r => setTimeout(r, 250));
  } } finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
});
cli.parseAsync().catch(e => { console.error(`Alpha Node: ${e.message}`); process.exitCode = 1; });
