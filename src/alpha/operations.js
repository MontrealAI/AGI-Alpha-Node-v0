import { open, unlink, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { missionSchema, digest } from './mission.js';
import { readJson, loadNode, recordOperation, runMission, exportMission } from './node.js';

const money = z.number().finite().nonnegative().max(1e9);
export const pipelineSchema = z.object({
  schema: z.literal(1), source: z.string().min(1),
  maxAgeSeconds: z.number().int().min(60).max(604800),
  maxPendingReviews: z.number().int().min(1).max(100),
  maxDailyRuns: z.number().int().min(1).max(1000),
  maxDailyReservedMicroUsd: z.number().int().min(0).max(1e12),
  reserveMicroUsdPerRun: z.number().int().min(0).max(1e12),
  assumptions: z.object({ implementationCost: money, probability: z.number().min(0).max(1), downside: money }).strict(),
  policy: z.object({ maxCost: money, maxDownside: money, minExpectedNet: money, stressBenefitBps: z.number().int().min(0).max(10000) }).strict()
}).strict();
export const usageSchema = z.object({
  schema: z.literal(1), observedAt: z.string().datetime(), period: z.string().min(1).max(200),
  services: z.array(z.object({ id: z.string().regex(/^[a-z0-9-]{1,50}$/), name: z.string().min(1).max(150),
    requests: z.number().int().min(1).max(1e12), repeatedRequests: z.number().int().min(0).max(1e12), costUsd: money
  }).strict()).min(1).max(100)
}).strict().superRefine((data, ctx) => {
  if (new Set(data.services.map(s => s.id)).size !== data.services.length) ctx.addIssue({ code: 'custom', message: 'Duplicate service ID' });
  if (data.services.some(s => s.repeatedRequests > s.requests)) ctx.addIssue({ code: 'custom', message: 'Repeated requests exceed total requests' });
});
export function discoverUsage(input, pipeline, now = Date.now()) {
  const usage = usageSchema.parse(input);
  const age = now - Date.parse(usage.observedAt);
  if (age < -60000 || age > pipeline.maxAgeSeconds * 1000) throw new Error('Usage evidence is stale or future dated');
  const sources = usage.services.map(s => ({ id: s.id, title: `${s.name}: ${usage.period}`.slice(0, 200), text: JSON.stringify({ ...s, observedAt: usage.observedAt, period: usage.period }) }));
  const opportunities = usage.services.filter(s => s.repeatedRequests > 0 && s.costUsd > 0).map(s => ({
    id: `cache-${s.id}`, title: `Evaluate caching for ${s.name}`,
    benefit: Math.round(s.costUsd * s.repeatedRequests / s.requests * 1e6) / 1e6,
    cost: pipeline.assumptions.implementationCost, probability: pipeline.assumptions.probability,
    downside: pipeline.assumptions.downside, sourceIds: [s.id],
    rationale: 'Observed repeated-request share multiplied by total cost estimates a savings ceiling, not measured savings. Assumes uniform request cost and cache eligibility. Validate privacy, correctness, freshness and implementation cost before deployment.'
  }));
  if (!opportunities.length) return null;
  const fingerprint = digest({ usage, assumptions: pipeline.assumptions, policy: pipeline.policy });
  return missionSchema.parse({ id: `usage-${fingerprint.slice(0, 40)}`, title: 'Usage-derived caching opportunities',
    objective: 'Discover and rank caching experiments from supplied usage measurements. Produce a reviewable analysis; do not modify production systems.',
    sources, opportunities, policy: pipeline.policy, unit: 'USD per observation period' });
}
export function operationStatus(node, now = Date.now()) {
  const events = node.state.events.filter(e => e.type === 'operation');
  const today = new Date(now).toISOString().slice(0, 10);
  const reservations = events.filter(e => e.phase === 'reserved');
  const daily = reservations.filter(e => e.at.slice(0, 10) >= today);
  const finished = new Set(events.filter(e => e.phase !== 'reserved').map(e => e.cycle));
  return { dailyRuns: daily.length, dailyReservedMicroUsd: daily.reduce((sum, e) => sum + e.reservedMicroUsd, 0),
    unresolved: reservations.filter(e => !finished.has(e.cycle)).map(e => ({ cycle: e.cycle, missionId: e.missionId })),
    pendingReviews: [...node.runs.values()].filter(r => !r.review).length };
}
export async function cycle(dir, pipelineFile = join(dir, 'pipeline.json')) {
  const lockPath = join(dir, 'pipeline.lock');
  let handle;
  try { handle = await open(lockPath, 'wx', 0o600); } catch (e) { if (e.code === 'EEXIST') throw new Error('Pipeline busy or interrupted; consult recovery guide'); throw e; }
  try {
    await handle.writeFile(String(process.pid)); await handle.sync();
    const p = pipelineSchema.parse(await readJson(pipelineFile, 20000));
    const source = resolve(resolve(pipelineFile, '..'), p.source);
    if (!(await stat(source)).isFile()) throw new Error('Usage source must be a regular file');
    const input = await readJson(source, 100000);
    const mission = discoverUsage(input, p);
    const loaded = await loadNode(dir);
    if (loaded.paused) throw new Error('Node paused');
    if (!mission) return { status: 'abstained', reason: 'No repeated-request savings candidates' };
    const cycleId = digest({ mission, provider: loaded.config.provider });
    const previous = loaded.state.events.find(e => e.type === 'operation' && e.cycle === cycleId && e.phase === 'reserved');
    const existing = loaded.runs.get(mission.id);
    if (existing) {
      await exportMission(dir, mission.id, join(dir, 'deliverables', mission.id));
      if (previous && !loaded.state.events.some(e => e.type === 'operation' && e.cycle === cycleId && e.phase !== 'reserved')) await recordOperation(dir, { phase: 'completed', cycle: cycleId, missionId: mission.id, reservedMicroUsd: 0, recovered: true });
      return { status: 'replayed', missionId: mission.id, evidenceHash: existing.hash };
    }
    if (previous) throw new Error('Cycle already attempted; inspect failed or interrupted reservation before changing inputs');
    await recordOperation(dir, { phase: 'reserved', cycle: cycleId, missionId: mission.id, reservedMicroUsd: p.reserveMicroUsdPerRun }, node => {
      const status = operationStatus(node);
      if (node.paused) throw new Error('Node paused');
      if (!node.config.reviewer) throw new Error('Configure an independent reviewer before autonomous operation');
      if (status.unresolved.length) throw new Error('Unresolved reservation blocks new work; recover the interrupted cycle');
      if (status.pendingReviews >= p.maxPendingReviews) throw new Error('Pending review capacity reached');
      if (status.dailyRuns >= p.maxDailyRuns || status.dailyReservedMicroUsd + p.reserveMicroUsdPerRun > p.maxDailyReservedMicroUsd) throw new Error('Daily reservation budget exhausted');
      if (node.config.provider && p.reserveMicroUsdPerRun === 0) throw new Error('Provider runs require a positive cost reservation');
    });
    try {
      const result = await runMission(dir, mission);
      await exportMission(dir, mission.id, join(dir, 'deliverables', mission.id));
      await recordOperation(dir, { phase: 'completed', cycle: cycleId, missionId: mission.id, reservedMicroUsd: 0 });
      return { status: 'awaiting-review', missionId: mission.id, evidenceHash: result.hash, recommendation: result.analysis.recommendation };
    } catch (e) {
      await recordOperation(dir, { phase: 'failed', cycle: cycleId, missionId: mission.id, reservedMicroUsd: 0, reason: 'Execution or export failed; inspect local operator error. Reservation retained.' });
      throw e;
    }
  } finally { await handle.close(); await unlink(lockPath); }
}
