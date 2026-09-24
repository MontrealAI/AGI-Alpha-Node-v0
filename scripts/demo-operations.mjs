import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Wallet } from 'ethers';
import { initializeNode, exportMission, signDetachedReview, importDetachedReview, signOutcome, importOutcome, loadNode, outcomeSummary } from '../src/alpha/node.js';
import { cycle, operationStatus } from '../src/alpha/operations.js';
const dir = await mkdtemp(join(tmpdir(), 'alpha-operations-demo-'));
const reviewer = Wallet.createRandom();
try {
  await initializeNode(dir, { ensName: 'demo.alpha.node.agi.eth', reviewer: reviewer.address });
  const pipeline = JSON.parse(await readFile(new URL('../examples/alpha/pipeline.json', import.meta.url), 'utf8'));
  await writeFile(join(dir, 'pipeline.json'), JSON.stringify(pipeline));
  await writeFile(join(dir, 'usage.json'), JSON.stringify({ schema: 1, observedAt: new Date().toISOString(), period: 'Synthetic demonstration month', services: [{ id: 'model', name: 'Example inference', requests: 1000, repeatedRequests: 600, costUsd: 500 }] }));
  const first = await cycle(dir); const replay = await cycle(dir);
  const out = resolve(process.argv[2] ?? 'dist/operations-demo');
  let exported = await exportMission(dir, first.missionId, out);
  let bundle = JSON.parse(await readFile(exported.evidence, 'utf8'));
  await importDetachedReview(dir, await signDetachedReview(bundle, 'accepted', 'Synthetic role-separated test; no independent person or real economic validation.', reviewer.privateKey));
  exported = await exportMission(dir, first.missionId, out); bundle = JSON.parse(await readFile(exported.evidence, 'utf8'));
  await importOutcome(dir, await signOutcome(bundle, { measuredBenefitUsd: 100, measuredCostUsd: 30, observedAt: new Date().toISOString(), evidence: 'Synthetic outcome for exercising the signature and aggregation path; not actual savings.' }, reviewer.privateKey));
  await exportMission(dir, first.missionId, out);
  const node = await loadNode(dir);
  const result = { fixture: true, liveInference: false, mainnetPayment: false, independentHumanReview: false, first, replay, operations: operationStatus(node), outcomes: outcomeSummary(node), ledgerVerified: true };
  await writeFile(join(out, 'summary.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally { await rm(dir, { recursive: true, force: true }); }
