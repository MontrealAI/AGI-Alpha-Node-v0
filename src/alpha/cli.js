#!/usr/bin/env node
import { Command } from 'commander';
import { resolve, join } from 'node:path';
import { readdir, writeFile } from 'node:fs/promises';
import { initializeNode, loadNode, readJson, runMission, reviewMission, pauseNode, exportMission, settlementPlan, verifyIdentity, signDetachedReview, importDetachedReview } from './node.js';
const cli = new Command().name('alpha-node').description('$AGIALPHA standalone opportunity and evidence node').version('2.0.0');
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
cli.parseAsync().catch(e => { console.error(`Alpha Node: ${e.message}`); process.exitCode = 1; });
