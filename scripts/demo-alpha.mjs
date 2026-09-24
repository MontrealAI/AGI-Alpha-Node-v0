import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Wallet } from 'ethers';
import { initializeNode, runMission, pauseNode, loadNode, exportMission, signDetachedReview, importDetachedReview } from '../src/alpha/node.js';
const dir = await mkdtemp(join(tmpdir(), 'alpha-demo-'));
const output = resolve(process.argv[2] ?? 'alpha-output');
try {
  const reviewer = Wallet.createRandom();
  await initializeNode(dir, { ensName: 'demo.alpha.node.agi.eth', reviewer: reviewer.address });
  const mission = JSON.parse(await readFile(new URL('../examples/alpha/opportunity-scan.json', import.meta.url), 'utf8'));
  const result = await runMission(dir, mission);
  const replay = await runMission(dir, mission);
  if (!replay.replay || replay.hash !== result.hash) throw new Error('Replay check failed');
  await pauseNode(dir, true);
  const exported = await exportMission(dir, mission.id, output);
  const bundle = JSON.parse(await readFile(exported.evidence, 'utf8'));
  const review = await signDetachedReview(bundle, 'accepted', 'DEMONSTRATION ONLY: separate test key, synthetic evidence. Arithmetic and policy checked; no external human review or payment.', reviewer.privateKey);
  await importDetachedReview(dir, review);
  await pauseNode(dir, false);
  const state = await loadNode(dir);
  if (state.runs.get(mission.id).review.decision !== 'accepted') throw new Error('Review verification failed');
  await exportMission(dir, mission.id, output);
  console.log(JSON.stringify({ demonstration: true, syntheticInputs: true, liveProvider: false, externalReviewer: false, paidSettlement: false, replayVerified: true, pauseResumeVerified: true, ledgerVerified: true, evidenceHash: result.hash, output }, null, 2));
} finally { await rm(dir, { recursive: true, force: true }); }
