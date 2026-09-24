import { mkdir, writeFile, rename, open, unlink, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Wallet, verifyMessage, getAddress, JsonRpcProvider, Contract, Interface, namehash, FetchRequest, id as ethersId } from 'ethers';
import { canonicalJson } from '../utils/canonicalize.js';
import { AGIALPHA_TOKEN_ADDRESS } from '../constants/token.js';
import { analyzeMission, missionSchema, renderReport, inferNarrative, digest } from './mission.js';

const MAX_STATE = 32 * 1024 * 1024;
const address = x => getAddress(x).toLowerCase();
export const workId = (identity, missionId) => ethersId(`agialpha:mission:v2:${identity.ensName}:${address(identity.address)}:${missionId}`);
const exists = async p => { try { await stat(p); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
export async function readJson(path, maxBytes = MAX_STATE) {
  const handle = await open(path, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > maxBytes) throw new Error('File exceeds size limit or is not a regular file');
    const chunks = []; let size = 0;
    for (;;) {
      const buffer = Buffer.alloc(Math.min(65536, maxBytes - size + 1));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      size += bytesRead;
      if (size > maxBytes) throw new Error('File exceeds size limit');
      chunks.push(buffer.subarray(0, bytesRead));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { await handle.close(); }
}
export async function atomicJson(path, value) {
  const temp = `${path}.${process.pid}.tmp`;
  const handle = await open(temp, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
  await rename(temp, path);
  const directory = await open(resolve(path, '..'), 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}
export async function locked(dir, fn) {
  const lock = join(dir, 'writer.lock');
  let handle;
  try { handle = await open(lock, 'wx', 0o600); } catch (e) { if (e.code === 'EEXIST') throw new Error('Node busy or interrupted. Check status and recovery guide before removing writer.lock.'); throw e; }
  try { await handle.writeFile(String(process.pid)); return await fn(); }
  finally { await handle.close(); await unlink(lock); }
}

export async function initializeNode(dir, { ensName, reviewer = null, mode = 'local', rpcUrl = null, privateKey = null } = {}) {
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.alpha\.node\.agi\.eth$/.test(ensName ?? '')) throw new Error('Use a direct subname of alpha.node.agi.eth');
  if (!['local', 'live'].includes(mode)) throw new Error('Mode must be local or live');
  if (mode === 'live' && (!rpcUrl || !privateKey)) throw new Error('Live initialization requires RPC URL and ALPHA_NODE_PRIVATE_KEY');
  const wallet = privateKey ? new Wallet(privateKey) : Wallet.createRandom();
  if (reviewer && address(reviewer) === address(wallet.address)) throw new Error('Reviewer must differ from node signer');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  return locked(dir, async () => {
    if (await exists(join(dir, 'config.json')) || await exists(join(dir, 'identity.key.json'))) throw new Error('Node already initialized or partially initialized; use a new directory');
    const config = { schema: 2, mode, ensName, address: wallet.address, reviewer: reviewer ? getAddress(reviewer) : null,
      rpcUrl, chainId: 1, token: AGIALPHA_TOKEN_ADDRESS, provider: null };
    if (mode === 'live') await verifyIdentity(config);
    await atomicJson(join(dir, 'identity.key.json'), { privateKey: wallet.privateKey });
    await atomicJson(join(dir, 'state.json'), { schema: 2, events: [] });
    await atomicJson(join(dir, 'config.json'), config);
    return { ...config, rpcUrl: config.rpcUrl ? '[configured]' : null, identityStatus: mode === 'live' ? 'ENS verified at initialization; rechecked on each run' : 'LOCAL ONLY: name is an unverified label' };
  });
}

export async function verifyIdentity(config, { provider: supplied } = {}) {
  if (config.mode === 'local') return { verified: false, mode: 'local', ensName: config.ensName, address: config.address };
  if (config.mode !== 'live' || config.chainId !== 1 || address(config.token) !== address(AGIALPHA_TOKEN_ADDRESS)) throw new Error('Invalid live identity configuration');
  const request = new FetchRequest(config.rpcUrl);
  request.timeout = 15000;
  const provider = supplied ?? new JsonRpcProvider(request);
  try {
    const network = await provider.getNetwork();
    if (network.chainId !== 1n) throw new Error('Ethereum mainnet chain ID required');
    const resolved = await provider.resolveName(config.ensName);
    if (!resolved || address(resolved) !== address(config.address)) throw new Error('ENS address does not match node signer');
    const code = await provider.getCode(AGIALPHA_TOKEN_ADDRESS);
    if (code === '0x') throw new Error('Canonical token contract is absent');
    const token = new Contract(AGIALPHA_TOKEN_ADDRESS, ['function decimals() view returns (uint8)', 'function balanceOf(address) view returns (uint256)'], provider);
    if (await token.decimals() !== 18n) throw new Error('Unexpected token decimals');
    return { verified: true, mode: 'live', chainId: 1, ensName: config.ensName, ensNode: namehash(config.ensName), address: config.address,
      token: AGIALPHA_TOKEN_ADDRESS, tokenBalance: String(await token.balanceOf(config.address)), observedAt: new Date().toISOString() };
  } finally { if (!supplied) provider.destroy(); }
}

export async function loadNode(dir) {
  const config = await readJson(join(dir, 'config.json'));
  if (config.schema !== 2 || !['local', 'live'].includes(config.mode)) throw new Error('Unsupported node configuration');
  const state = await readJson(join(dir, 'state.json'));
  const verified = verifyState(config, state);
  return { config, state, ...verified, paused: await exists(join(dir, 'PAUSED')) };
}
export function verifyState(config, state) {
  if (state.schema !== 2 || !Array.isArray(state.events)) throw new Error('Invalid state');
  let previous = null;
  const runs = new Map();
  const operations = new Map();
  for (const event of state.events) {
    const { signature, hash, ...payload } = event;
    if (payload.previous !== previous || digest(payload) !== hash) throw new Error('Ledger integrity failure');
    const signer = address(verifyMessage(hash, signature));
    if (payload.type === 'run') {
      if (signer !== address(config.address) || runs.has(payload.mission.id)) throw new Error('Invalid run signer or duplicate mission');
      const recomputed = analyzeMission(payload.mission);
      if (canonicalJson(recomputed) !== canonicalJson(payload.analysis) || payload.report !== renderReport(payload.mission, recomputed, payload.provider)) throw new Error('Artifact verification failure');
      if (payload.workId !== workId(config, payload.mission.id)) throw new Error('Work identity mismatch');
      runs.set(payload.mission.id, { ...payload, hash, signature, review: null });
    } else if (payload.type === 'review-v3') {
      if (signer !== address(config.address)) throw new Error('Invalid review envelope signer');
      const attestation = payload.attestation;
      const run = runs.get(attestation.missionId);
      verifyReview(config, run, attestation);
      run.review = { ...attestation, envelopeHash: hash };
    } else if (payload.type === 'outcome') {
      if (signer !== address(config.address)) throw new Error('Invalid outcome envelope signer');
      const run = runs.get(payload.attestation.missionId);
      verifyOutcome(config, run, payload.attestation);
      run.outcome = payload.attestation;
    } else if (payload.type === 'operation') {
      if (signer !== address(config.address) || !['reserved', 'completed', 'failed'].includes(payload.phase) || !/^0x[a-f0-9]{64}$/.test(payload.cycle) || !Number.isSafeInteger(payload.reservedMicroUsd) || payload.reservedMicroUsd < 0) throw new Error('Invalid operation event');
      if (!Number.isFinite(Date.parse(payload.at)) || typeof payload.missionId !== 'string') throw new Error('Invalid operation metadata');
      const prior = operations.get(payload.cycle);
      if (payload.phase === 'reserved') {
        if (prior) throw new Error('Duplicate cycle reservation');
        operations.set(payload.cycle, payload);
      } else {
        if (!prior || prior.phase !== 'reserved' || prior.missionId !== payload.missionId || payload.reservedMicroUsd !== 0) throw new Error('Invalid reservation transition');
        if (payload.phase === 'completed' && !runs.has(payload.missionId)) throw new Error('Completed operation lacks a run');
        operations.set(payload.cycle, payload);
      }
    } else if (payload.type === 'review') {
      const run = runs.get(payload.missionId);
      if (!config.reviewer || signer !== address(config.reviewer) || signer === address(config.address) || !run || run.hash !== payload.runHash || run.review || !['accepted', 'rejected'].includes(payload.decision)) throw new Error('Invalid reviewer, decision or review binding');
      run.review = { ...payload, hash, signature };
    } else throw new Error('Unknown ledger event');
    previous = hash;
  }
  return { runs, head: previous };
}
async function appendEvent(dir, loaded, payload, wallet) {
  const full = { ...payload, previous: loaded.head, at: new Date().toISOString() };
  const hash = digest(full);
  const event = { ...full, hash, signature: await wallet.signMessage(hash) };
  loaded.state.events.push(event);
  verifyState(loaded.config, loaded.state);
  if (Buffer.byteLength(JSON.stringify(loaded.state)) > MAX_STATE) throw new Error('Ledger capacity reached; archive node before continuing');
  await atomicJson(join(dir, 'state.json'), loaded.state);
  return event;
}
export async function runMission(dir, input) {
  const mission = missionSchema.parse(input);
  return locked(dir, async () => {
    const loaded = await loadNode(dir);
    if (loaded.paused) throw new Error('Node paused');
    const existing = loaded.runs.get(mission.id);
    if (existing) {
      if (existing.analysis.missionDigest !== digest(mission)) throw new Error('Mission ID already bound to different inputs');
      return { ...existing, replay: true };
    }
    const wallet = new Wallet((await readJson(join(dir, 'identity.key.json'))).privateKey);
    if (address(wallet.address) !== address(loaded.config.address)) throw new Error('Node signing key mismatch');
    const identity = await verifyIdentity(loaded.config);
    const analysis = analyzeMission(mission);
    const provider = loaded.config.provider ? await inferNarrative(mission, analysis, loaded.config.provider) : null;
    if (await exists(join(dir, 'PAUSED'))) throw new Error('Node paused during execution; result not committed');
    return appendEvent(dir, loaded, { type: 'run', workId: workId(loaded.config, mission.id), mission, identity, analysis, provider,
      report: renderReport(mission, analysis, provider), status: 'awaiting-review', reward: 'unfunded-unverified' }, wallet);
  });
}
export async function reviewMission(dir, missionId, decision, notes, privateKey) {
  if (!['accepted', 'rejected'].includes(decision) || typeof notes !== 'string' || !notes.trim() || notes.length > 4000) throw new Error('Review requires accepted/rejected and meaningful notes (up to 4000 characters)');
  const wallet = new Wallet(privateKey);
  return locked(dir, async () => {
    const loaded = await loadNode(dir);
    const run = loaded.runs.get(missionId);
    if (!run || run.review) throw new Error('Mission absent or already reviewed');
    if (!loaded.config.reviewer || address(wallet.address) !== address(loaded.config.reviewer) || address(wallet.address) === address(loaded.config.address)) throw new Error('Signer is not the designated independent reviewer');
    return appendEvent(dir, loaded, { type: 'review', missionId, runHash: run.hash, decision, notes }, wallet);
  });
}
export async function pauseNode(dir, paused) {
  await loadNode(dir);
  if (paused) await writeFile(join(dir, 'PAUSED'), new Date().toISOString(), { mode: 0o600 });
  else { try { await unlink(join(dir, 'PAUSED')); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
  return { paused };
}
export async function exportMission(dir, missionId, outDir) {
  const loaded = await loadNode(dir); const run = loaded.runs.get(missionId);
  if (!run) throw new Error('Unknown mission');
  await mkdir(outDir, { recursive: true, mode: 0o700 });
  await writeFile(join(outDir, 'report.md'), run.report, { mode: 0o600 });
  await atomicJson(join(outDir, 'evidence.json'), { schema: 2, ledgerHead: loaded.head, identity: { ensName: loaded.config.ensName, address: loaded.config.address, reviewer: loaded.config.reviewer }, run });
  return { report: join(outDir, 'report.md'), evidence: join(outDir, 'evidence.json') };
}
export function settlementPlan(config, run, treasuryAddress) {
  if (config.mode !== 'live' || !run.identity.verified) throw new Error('Live ENS-verified run required for settlement plan');
  if (run.review?.decision !== 'accepted') throw new Error('Independent acceptance required');
  const iface = new Interface(['function submit(bytes32 workId,bytes32 evidenceHash)', 'function review(bytes32 workId,bytes32 evidenceHash,bool accepted)', 'function claim(bytes32 workId)']);
  return { chainId: 1, token: AGIALPHA_TOKEN_ADDRESS, treasury: getAddress(treasuryAddress), workId: run.workId, evidenceHash: run.hash,
    status: 'UNSENT: verify escrow funding, deployed bytecode, node/reviewer and deadlines before signing',
    transactions: [
      { from: config.address, to: getAddress(treasuryAddress), data: iface.encodeFunctionData('submit', [run.workId, run.hash]), value: '0' },
      { from: config.reviewer, to: getAddress(treasuryAddress), data: iface.encodeFunctionData('review', [run.workId, run.hash, true]), value: '0' },
      { from: config.address, to: getAddress(treasuryAddress), data: iface.encodeFunctionData('claim', [run.workId]), value: '0' }
    ] };
}

export async function signDetachedReview(bundle, decision, notes, privateKey) {
  const wallet = new Wallet(privateKey);
  const { signature, hash, review, outcome, ...run } = bundle.run;
  if (digest(run) !== hash || address(verifyMessage(hash, signature)) !== address(bundle.identity.address)) throw new Error('Exported run signature is invalid');
  if (address(wallet.address) !== address(bundle.identity.reviewer) || address(wallet.address) === address(bundle.identity.address)) throw new Error('Not the designated independent reviewer');
  if (!['accepted', 'rejected'].includes(decision) || !notes?.trim() || notes.length > 4000) throw new Error('Decision and review notes required');
  const payload = { type: 'review-attestation-v3', node: address(bundle.identity.address), ensName: bundle.identity.ensName, missionId: run.mission.id, runHash: hash, decision, notes, at: new Date().toISOString() };
  const reviewHash = digest(payload);
  return { ...payload, hash: reviewHash, signature: await wallet.signMessage(reviewHash) };
}
export async function importDetachedReview(dir, event) {
  return locked(dir, async () => {
    const loaded = await loadNode(dir);
    if (event.type === 'review-attestation-v3') {
      verifyReview(loaded.config, loaded.runs.get(event.missionId), event);
      const wallet = new Wallet((await readJson(join(dir, 'identity.key.json'))).privateKey);
      if (address(wallet.address) !== address(loaded.config.address)) throw new Error('Node signing key mismatch');
      const receipt = await appendEvent(dir, loaded, { type: 'review-v3', attestation: event }, wallet);
      return { mission: event.missionId, decision: event.decision, reviewHash: event.hash, envelopeHash: receipt.hash };
    }
    if (event.type !== 'review' || event.previous !== loaded.head) throw new Error('Stale review or invalid event: export the current evidence and sign again');
    loaded.state.events.push(event);
    verifyState(loaded.config, loaded.state);
    if (Buffer.byteLength(JSON.stringify(loaded.state)) > MAX_STATE) throw new Error('Ledger capacity reached; archive node before continuing');
    await atomicJson(join(dir, 'state.json'), loaded.state);
    return { mission: event.missionId, decision: event.decision, reviewHash: event.hash };
  });
}

function verifyReview(config, run, attestation) {
  const { hash, signature, ...payload } = attestation;
  if (!run || run.review) throw new Error('Stale review: mission absent or already reviewed');
  if (payload.type !== 'review-attestation-v3' || digest(payload) !== hash || payload.node !== address(config.address) || payload.ensName !== config.ensName || payload.runHash !== run.hash || !['accepted', 'rejected'].includes(payload.decision) || typeof payload.notes !== 'string' || !payload.notes.trim() || payload.notes.length > 4000) throw new Error('Invalid review binding');
  const signer = address(verifyMessage(hash, signature));
  if (!config.reviewer || signer !== address(config.reviewer) || signer === address(config.address)) throw new Error('Invalid independent reviewer');
}
export async function recordOperation(dir, payload, check = () => {}) {
  return locked(dir, async () => {
    const loaded = await loadNode(dir);
    await check(loaded);
    const wallet = new Wallet((await readJson(join(dir, 'identity.key.json'))).privateKey);
    if (address(wallet.address) !== address(loaded.config.address)) throw new Error('Node signing key mismatch');
    const event = { ...payload, type: 'operation' };
    return appendEvent(dir, loaded, event, wallet);
  });
}

function verifyOutcome(config, run, attestation) {
  const { hash, signature, ...payload } = attestation;
  if (!run || run.review?.decision !== 'accepted' || run.outcome) throw new Error('Outcome requires an accepted mission with no previous outcome');
  if (payload.type !== 'outcome-attestation-v1' || digest(payload) !== hash || payload.node !== address(config.address) || payload.runHash !== run.hash || payload.ensName !== config.ensName) throw new Error('Invalid outcome binding');
  const signer = address(verifyMessage(hash, signature));
  if (!config.reviewer || signer !== address(config.reviewer) || signer === address(config.address)) throw new Error('Outcome requires independent reviewer');
  for (const value of [payload.measuredBenefitUsd, payload.measuredCostUsd]) if (!Number.isFinite(value) || value < 0 || value > 1e12) throw new Error('Invalid measured outcome');
  if (typeof payload.evidence !== 'string' || !payload.evidence.trim() || payload.evidence.length > 10000 || !Number.isFinite(Date.parse(payload.observedAt))) throw new Error('Outcome requires dated measurement evidence');
}
export async function signOutcome(bundle, measurement, privateKey) {
  const wallet = new Wallet(privateKey);
  const { signature, hash, review, outcome, ...run } = bundle.run;
  if (digest(run) !== hash || address(verifyMessage(hash, signature)) !== address(bundle.identity.address)) throw new Error('Exported run signature is invalid');
  const payload = { ...measurement, type: 'outcome-attestation-v1', node: address(bundle.identity.address), ensName: bundle.identity.ensName, missionId: run.mission.id, runHash: hash };
  const outcomeHash = digest(payload); const attestation = { ...payload, hash: outcomeHash, signature: await wallet.signMessage(outcomeHash) };
  verifyOutcome(bundle.identity, bundle.run, attestation);
  return attestation;
}
export async function importOutcome(dir, attestation) {
  return locked(dir, async () => {
    const loaded = await loadNode(dir); verifyOutcome(loaded.config, loaded.runs.get(attestation.missionId), attestation);
    const wallet = new Wallet((await readJson(join(dir, 'identity.key.json'))).privateKey);
    if (address(wallet.address) !== address(loaded.config.address)) throw new Error('Node signing key mismatch');
    return appendEvent(dir, loaded, { type: 'outcome', attestation }, wallet);
  });
}
export function outcomeSummary(node) {
  const measured = [...node.runs.values()].filter(r => r.outcome);
  return { acceptedMissions: [...node.runs.values()].filter(r => r.review?.decision === 'accepted').length,
    measuredMissions: measured.length,
    reviewerReportedNetUsd: measured.reduce((sum, r) => sum + r.outcome.measuredBenefitUsd - r.outcome.measuredCostUsd, 0),
    outcomes: measured.map(r => ({ missionId: r.mission.id, projectedExpectedNet: r.analysis.rankings.find(x => x.id === r.analysis.recommendation)?.expectedNet ?? null,
      measuredNetUsd: r.outcome.measuredBenefitUsd - r.outcome.measuredCostUsd, observedAt: r.outcome.observedAt })),
    limitation: 'Reviewer-attested measurements, not independently audited profit. Compare only equivalent observation periods. No automatic policy mutation or reinvestment.' };
}
