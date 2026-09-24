import { open, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { digest, missionSchema } from '../mission.js';
import {
  readJson,
  loadNode,
  recordRuntime,
  atomicJson,
  pauseNode,
} from '../node.js';
import {
  cycle,
  usageSchema,
  missionSourceSchema,
  pipelineSchema,
} from '../operations.js';
import { adaptivePolicySchema, planMission } from './planner.js';
import { actionSchema, describeAction, executeAction } from './actions.js';
import { coordinateSpecialist, peerUrl } from './specialists.js';
import { transactionPolicySchema, settleAndReinvest } from './transactions.js';
import { qualifyNode } from '../qualification.js';
import { workSourceSchema } from '../work.js';
export const engineSchema = z
  .object({
    schema: z.literal(1),
    requireQualifiedAdmission: z.boolean().default(false),
    adaptive: adaptivePolicySchema.default({}),
    peers: z
      .array(z.object({ address: z.string(), url: z.string() }).strict())
      .max(20)
      .default([]),
    specialistCapabilities: z
      .array(
        z.enum([
          'evidence-analysis',
          'risk-review',
          'implementation-plan',
          'research-synthesis',
          'adversarial-review',
        ]),
      )
      .max(5)
      .refine(
        (a) => new Set(a).size === a.length,
        'Duplicate specialist capabilities',
      )
      .default([]),
    maxSpecialistPriceMicroUsd: z.number().int().min(0).max(1e9).default(0),
    actions: z.record(actionSchema).default({}),
    maxDailyActions: z.number().int().min(1).max(100).default(1),
    collector: z.object({ url: z.string().url() }).strict().optional(),
    transactions: transactionPolicySchema.optional(),
  })
  .strict();
async function collect(dir, config, pipeline) {
  if (!config.collector) return;
  const url = new URL(config.collector.url);
  peerUrl(url.origin);
  if (url.username || url.password || url.hash || url.search)
    throw new Error(
      'Collector URL cannot carry credentials, query or fragment',
    );
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Collector HTTP ${response.status}`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > (pipeline.sourceKind !== 'usage' ? 1000000 : 100000))
      throw new Error('Collector response exceeds limit');
    chunks.push(chunk);
  }
  const usage = (
    pipeline.sourceKind === 'work'
      ? workSourceSchema
      : pipeline.sourceKind === 'mission'
        ? missionSourceSchema
        : usageSchema
  ).parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  const age = Date.now() - Date.parse(usage.observedAt);
  if (age < -60000 || age > pipeline.maxAgeSeconds * 1000)
    throw new Error('Collector observation is stale or future dated');
  await atomicJson(resolve(dir, pipeline.source), usage);
  await recordRuntime(dir, 'source', `source:${digest(usage)}`, {
    origin: url.origin,
    observationDigest: digest(usage),
    observedAt: usage.observedAt,
  });
}
export async function operate(
  dir,
  { rpcUrls, transactionDependencies, identityProvider } = {},
) {
  const lock = join(dir, 'engine.lock');
  let handle;
  try {
    handle = await open(lock, 'wx', 0o600);
  } catch (e) {
    if (e.code === 'EEXIST')
      throw new Error(
        'Runtime busy or interrupted; stop previous process before recovery',
      );
    throw e;
  }
  try {
    await handle.writeFile(String(process.pid));
    await handle.sync();
    const config = engineSchema.parse(
      await readJson(join(dir, 'engine.json'), 100000),
    );
    const pipeline = pipelineSchema.parse(
      await readJson(join(dir, 'pipeline.json'), 20000),
    );
    const initial = await loadNode(dir);
    if (initial.paused) throw new Error('Node paused');
    const progress = [];
    // Finish accepted work before discovery so an unavailable source does not strand a payment.
    for (const run of initial.runs.values()) {
      if (run.review?.decision !== 'accepted' || !run.runtimeContext) continue;
      if (run.runtimeContext.action) {
        const authorized = config.actions[run.analysis.recommendation];
        if (
          !authorized ||
          digest(authorized) !== digest(run.runtimeContext.action.action)
        ) {
          progress.push({
            missionId: run.mission.id,
            status: 'action-authorization-changed',
          });
          continue;
        }
        const action = await executeAction(
          dir,
          run.mission.id,
          run.runtimeContext.action,
          { maxDailyActions: config.maxDailyActions },
        );
        progress.push(action);
        if (action.status !== 'applied') {
          await pauseNode(dir, true);
          return { status: 'paused-after-rollback', progress };
        }
      }
      if (config.transactions?.enabled)
        progress.push({
          missionId: run.mission.id,
          settlement: await settleAndReinvest(
            dir,
            run.mission.id,
            config.transactions,
            rpcUrls,
            transactionDependencies,
          ),
        });
    }
    if (config.requireQualifiedAdmission) {
      const qualification = await qualifyNode(dir);
      if (!qualification.gatePassed)
        return { status: 'qualification-blocked', qualification, progress };
    }
    await collect(dir, config, pipeline);
    let prepared;
    const result = await cycle(dir, join(dir, 'pipeline.json'), {
      identityProvider,
      prepareMission: async (mission, node) => {
        const key = `plan:${digest({ mission, adaptive: config.adaptive, actions: config.actions, peers: config.peers, capabilities: config.specialistCapabilities })}`;
        const prior = node.runtime.get(key);
        if (prior) {
          prepared = prior.data;
          return prepared.plan.selected ? prepared.mission : null;
        }
        const plan = planMission(mission, node, config.adaptive);
        let action = null;
        if (plan.selected && config.actions[plan.selected])
          action = await describeAction(config.actions[plan.selected]);
        if (action?.unchanged) {
          plan.selected = null;
          plan.status = 'abstained';
          plan.reason = 'Requested configuration is already active';
        }
        const sources = [
          ...plan.mission.sources,
          {
            id: 'adaptive-model',
            title: 'Owner-bounded outcome model',
            text: JSON.stringify({
              modelsDigest: digest(plan.models),
              models: plan.models.map((m) => ({
                recommendation: m.recommendation,
                samples: m.samples,
                successes: m.successes,
                losses: m.losses,
                meanBenefitRatio: m.meanBenefitRatio,
              })),
              reason: plan.reason,
            }),
          },
          ...(action
            ? [
                {
                  id: 'execution-policy',
                  title:
                    'Exact owner-authorized action reviewed with this mission',
                  text: JSON.stringify(action),
                },
              ]
            : []),
        ];
        const expanded = {
          ...plan.mission,
          sources,
          objective: action
            ? `${plan.mission.objective} After independent acceptance, execute only the exact execution-policy descriptor and rollback on failed health verification.`.slice(
                0,
                4000,
              )
            : plan.mission.objective,
        };
        expanded.id = `runtime-${digest(expanded).slice(2, 42)}`;
        const ready = missionSchema.parse(expanded);
        prepared = { plan, action, mission: ready };
        await recordRuntime(dir, 'plan', key, prepared);
        return plan.selected ? ready : null;
      },
      afterReserved: async (mission) => {
        const required =
          config.specialistCapabilities.length *
          config.maxSpecialistPriceMicroUsd;
        if (required > pipeline.reserveMicroUsdPerRun)
          throw new Error('Specialist quotes exceed the cycle reservation');
        const specialists = [];
        for (const capability of config.specialistCapabilities)
          specialists.push(
            await coordinateSpecialist(
              dir,
              mission,
              capability,
              config.peers,
              config.maxSpecialistPriceMicroUsd,
            ),
          );
        return {
          schema: 2,
          planDigest: digest(prepared.plan),
          action: prepared.action,
          specialists,
        };
      },
    });
    return { status: 'operated', discovery: result, progress };
  } finally {
    await handle.close();
    await unlink(lock);
  }
}
