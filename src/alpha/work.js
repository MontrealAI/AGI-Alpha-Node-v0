import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalJson } from '../utils/canonicalize.js';
import { open, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { measurementContractSchema } from './measurement.js';

export const workDigest = (x) =>
  '0x' +
  createHash('sha256')
    .update(typeof x === 'string' ? x : canonicalJson(x))
    .digest('hex');
const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/);
const integer = z.string().regex(/^(0|[1-9][0-9]{0,17})$/);
const count = z.number().int().min(0).max(1000000);
const unique = (rows, ctx, label) => {
  if (new Set(rows.map((r) => r.id)).size !== rows.length)
    ctx.addIssue({ code: 'custom', message: `Duplicate ${label} IDs` });
};
const invoice = z
  .object({
    kind: z.literal('invoice-reconciliation'),
    period: z.string().min(1).max(200),
    rates: z
      .array(z.object({ id, unitPriceMicroUsd: integer }).strict())
      .min(1)
      .max(500),
    usage: z
      .array(z.object({ id, serviceId: id, units: integer }).strict())
      .max(500),
    invoices: z
      .array(
        z
          .object({
            id,
            reference: id,
            serviceId: id,
            units: integer,
            amountMicroUsd: integer,
          })
          .strict(),
      )
      .max(500),
  })
  .strict();
const allocation = z
  .object({
    kind: z.literal('resource-allocation'),
    capacity: z
      .object({
        capitalMicroUsd: integer,
        computeUnits: count,
        reviewMinutes: count,
      })
      .strict(),
    candidates: z
      .array(
        z
          .object({
            id,
            benefitMicroUsd: integer,
            costMicroUsd: integer,
            riskReserveMicroUsd: integer,
            computeUnits: count,
            reviewMinutes: count,
          })
          .strict(),
      )
      .min(1)
      .max(16),
  })
  .strict();
const cell = z.union([
  z.string().max(500),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
const audit = z
  .object({
    kind: z.literal('data-quality'),
    rows: z
      .array(
        z
          .object({
            id,
            values: z
              .record(id, cell)
              .refine(
                (x) => Object.keys(x).length <= 30,
                'At most 30 fields per row',
              ),
          })
          .strict(),
      )
      .min(1)
      .max(500),
    rules: z
      .array(
        z.discriminatedUnion('kind', [
          z.object({ id, kind: z.literal('required'), field: id }).strict(),
          z.object({ id, kind: z.literal('unique'), field: id }).strict(),
          z
            .object({
              id,
              kind: z.literal('range'),
              field: id,
              min: z.number().finite(),
              max: z.number().finite(),
            })
            .strict(),
          z
            .object({
              id,
              kind: z.literal('one-of'),
              field: id,
              values: z.array(cell).min(1).max(30),
            })
            .strict(),
        ]),
      )
      .min(1)
      .max(30),
  })
  .strict();
export const workSchema = z
  .discriminatedUnion('kind', [invoice, allocation, audit])
  .superRefine((w, ctx) => {
    for (const label of [
      'rates',
      'usage',
      'invoices',
      'candidates',
      'rows',
      'rules',
    ])
      if (w[label]) unique(w[label], ctx, label);
    for (const rule of w.rules ?? [])
      if (rule.kind === 'range' && rule.min > rule.max)
        ctx.addIssue({ code: 'custom', message: 'Invalid range endpoints' });
    if (Buffer.byteLength(JSON.stringify(w)) > 800000)
      ctx.addIssue({ code: 'custom', message: 'Work input exceeds 800 KB' });
  });
export const workSourceSchema = z
  .object({
    schema: z.literal(1),
    observedAt: z.string().datetime(),
    work: workSchema,
    measurement: measurementContractSchema.optional(),
  })
  .strict();
const sorted = (x) => [...x].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
function reconcile(w) {
  const rates = new Map(
    w.rates.map((r) => [r.id, BigInt(r.unitPriceMicroUsd)]),
  );
  const services = sorted(
    new Set([
      ...rates.keys(),
      ...w.usage.map((r) => r.serviceId),
      ...w.invoices.map((r) => r.serviceId),
    ]),
  );
  const references = new Map();
  for (const r of w.invoices)
    references.set(r.reference, (references.get(r.reference) ?? 0) + 1);
  const duplicates = sorted(
    [...references].filter(([, n]) => n > 1).map(([ref]) => ref),
  );
  const rows = services.map((serviceId) => {
    const usageUnits = w.usage
      .filter((r) => r.serviceId === serviceId)
      .reduce((s, r) => s + BigInt(r.units), 0n);
    const items = w.invoices.filter((r) => r.serviceId === serviceId);
    const billedUnits = items.reduce((s, r) => s + BigInt(r.units), 0n);
    const billed = items.reduce((s, r) => s + BigInt(r.amountMicroUsd), 0n);
    const rate = rates.get(serviceId),
      expected = rate === undefined ? null : usageUnits * rate;
    return {
      serviceId,
      usageUnits: String(usageUnits),
      billedUnits: String(billedUnits),
      quantityVarianceUnits: String(billedUnits - usageUnits),
      expectedMicroUsd: expected === null ? null : String(expected),
      billedMicroUsd: String(billed),
      varianceMicroUsd: expected === null ? null : String(billed - expected),
      priceMismatchLineIds:
        rate === undefined
          ? []
          : items
              .filter(
                (r) => BigInt(r.amountMicroUsd) !== BigInt(r.units) * rate,
              )
              .map((r) => r.id)
              .sort(),
      usageIds: w.usage
        .filter((r) => r.serviceId === serviceId)
        .map((r) => r.id)
        .sort(),
      invoiceIds: items.map((r) => r.id).sort(),
    };
  });
  const known = rows.filter((r) => r.varianceMicroUsd !== null);
  const positive = known.reduce(
    (s, r) =>
      s + (BigInt(r.varianceMicroUsd) > 0n ? BigInt(r.varianceMicroUsd) : 0n),
    0n,
  );
  return {
    summary: {
      services: rows.length,
      knownRateOverbillingMicroUsd: String(positive),
      netKnownRateVarianceMicroUsd: String(
        known.reduce((s, r) => s + BigInt(r.varianceMicroUsd), 0n),
      ),
      unknownRateServices: rows
        .filter((r) => r.varianceMicroUsd === null)
        .map((r) => r.serviceId),
      duplicateInvoiceReferences: duplicates,
    },
    rows,
    facts: [
      {
        id: 'total',
        text: `Supplied invoices exceed usage priced at supplied rates by ${positive} micro-USD across positive-variance services. This is a discrepancy to investigate, not a confirmed refund or measured profit.`,
      },
      ...rows.map((r, i) => ({
        id: `service-${i}`,
        text: `Service ${r.serviceId}: quantity variance ${r.quantityVarianceUnits}; billed ${r.billedMicroUsd} micro-USD; expected ${r.expectedMicroUsd ?? 'unknown'}; monetary variance ${r.varianceMicroUsd ?? 'unknown'}.`,
      })),
      {
        id: 'duplicates',
        text: `${duplicates.length} repeated invoice references require review; their amounts are already included in totals.`,
      },
    ],
    limitation:
      'Exact arithmetic over supplied records and rates. Missing usage, taxes, credits, contract terms and dishonest inputs can change the interpretation. Discrepancies are not confirmed receivables.',
  };
}
function allocate(w) {
  const items = [...w.candidates].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const cap = BigInt(w.capacity.capitalMicroUsd);
  let best = {
      selectedIds: [],
      declaredNetMicroUsd: '0',
      capitalMicroUsd: '0',
      computeUnits: 0,
      reviewMinutes: 0,
    },
    examined = 0;
  for (let mask = 0; mask < 2 ** items.length; mask++) {
    let capital = 0n,
      net = 0n,
      compute = 0,
      review = 0;
    const selected = [];
    for (let i = 0; i < items.length; i++)
      if (mask & (1 << i)) {
        const r = items[i],
          exposure = BigInt(r.costMicroUsd) + BigInt(r.riskReserveMicroUsd);
        capital += exposure;
        net += BigInt(r.benefitMicroUsd) - exposure;
        compute += r.computeUnits;
        review += r.reviewMinutes;
        selected.push(r.id);
      }
    examined++;
    if (
      capital > cap ||
      compute > w.capacity.computeUnits ||
      review > w.capacity.reviewMinutes
    )
      continue;
    const rank = [
      capital,
      review,
      compute,
      selected.length,
      JSON.stringify(selected),
    ];
    const priorRank = [
      BigInt(best.capitalMicroUsd),
      best.reviewMinutes,
      best.computeUnits,
      best.selectedIds.length,
      JSON.stringify(best.selectedIds),
    ];
    const firstDifference = rank.findIndex(
      (value, i) => value !== priorRank[i],
    );
    const betterTie =
      net === BigInt(best.declaredNetMicroUsd) &&
      firstDifference >= 0 &&
      rank[firstDifference] < priorRank[firstDifference];
    if (net > BigInt(best.declaredNetMicroUsd) || betterTie)
      best = {
        selectedIds: selected,
        declaredNetMicroUsd: String(net),
        capitalMicroUsd: String(capital),
        computeUnits: compute,
        reviewMinutes: review,
      };
  }
  return {
    summary: {
      ...best,
      optimalWithinSuppliedCandidates: true,
      examinedSubsets: examined,
    },
    rows: items.map((r) => ({
      ...r,
      selected: best.selectedIds.includes(r.id),
      declaredNetMicroUsd: String(
        BigInt(r.benefitMicroUsd) -
          BigInt(r.costMicroUsd) -
          BigInt(r.riskReserveMicroUsd),
      ),
    })),
    facts: [
      {
        id: 'selection',
        text: `Selected feasible subset: ${best.selectedIds.join(', ') || 'empty'}, with declared net ${best.declaredNetMicroUsd} micro-USD. These benefits are supplied estimates, not realized returns.`,
      },
      {
        id: 'capacity',
        text: `Selected capacity: ${best.capitalMicroUsd} micro-USD capital, ${best.computeUnits} compute units, ${best.reviewMinutes} review minutes.`,
      },
      {
        id: 'search',
        text: `All ${examined} subsets of the ${items.length} supplied candidates were evaluated. Optimality applies only to this finite candidate set and its declared objective and constraints.`,
      },
    ],
    limitation:
      'Exact finite optimization of owner-supplied estimates, not a forecast or execution authorization. At most 16 indivisible candidates; no scheduling, market access or external payments are implied.',
  };
}
function auditData(w) {
  const rows = [];
  for (const rule of w.rules) {
    const seen = new Map();
    for (const row of w.rows) {
      const value = Object.hasOwn(row.values, rule.field)
        ? row.values[rule.field]
        : null;
      const missing =
        value === null || (typeof value === 'string' && !value.trim());
      let issue = null;
      if (rule.kind === 'required' && missing) issue = 'missing';
      if (
        rule.kind === 'range' &&
        !missing &&
        (typeof value !== 'number' || value < rule.min || value > rule.max)
      )
        issue = 'outside-range-or-not-number';
      if (rule.kind === 'one-of' && !rule.values.some((v) => v === value))
        issue = 'not-allowed';
      if (rule.kind === 'unique' && !missing) {
        const key = canonicalJson(value);
        if (seen.has(key)) issue = `duplicate-of:${seen.get(key)}`;
        else seen.set(key, row.id);
      }
      if (issue)
        rows.push({
          rowId: row.id,
          ruleId: rule.id,
          field: rule.field,
          issue,
          actual: value,
        });
    }
  }
  const affected = new Set(rows.map((r) => r.rowId));
  return {
    summary: {
      inputRows: w.rows.length,
      rules: w.rules.length,
      violations: rows.length,
      affectedRows: affected.size,
      passingRows: w.rows.length - affected.size,
    },
    rows,
    facts: [
      {
        id: 'quality',
        text: `${rows.length} rule violations affect ${affected.size} of ${w.rows.length} supplied rows under ${w.rules.length} explicit rules. Passing these rules does not establish overall data truth or completeness.`,
      },
      ...w.rules.map((r, i) => ({
        id: `rule-${i}`,
        text: `Rule ${r.id} (${r.kind}, field ${r.field}) found ${rows.filter((x) => x.ruleId === r.id).length} violations.`,
      })),
    ],
    limitation:
      'Evaluates only supplied rows and explicit rules. Uniqueness is type-sensitive and marks subsequent occurrences; missing values require a required rule. No external source authenticity or regulatory compliance is certified.',
  };
}
const resultCache = new Map();
let cacheBytes = 0;
export function executeWork(input) {
  const work = workSchema.parse(input);
  const key = workDigest(work),
    cached = resultCache.get(key);
  if (cached) {
    resultCache.delete(key);
    resultCache.set(key, cached);
    return structuredClone(cached.result);
  }
  const result =
    work.kind === 'invoice-reconciliation'
      ? reconcile(work)
      : work.kind === 'resource-allocation'
        ? allocate(work)
        : auditData(work);
  const full = { schema: 1, kind: work.kind, inputDigest: key, ...result },
    bytes = Buffer.byteLength(JSON.stringify(full));
  if (bytes <= 8000000) {
    while (
      resultCache.size &&
      (cacheBytes + bytes > 8000000 || resultCache.size >= 128)
    ) {
      const oldest = resultCache.keys().next().value;
      cacheBytes -= resultCache.get(oldest).bytes;
      resultCache.delete(oldest);
    }
    resultCache.set(key, { result: structuredClone(full), bytes });
    cacheBytes += bytes;
  }
  return full;
}
export function workCsv(result) {
  const keys = [...new Set(result.rows.flatMap(Object.keys))];
  const field = (value) => {
    let s =
      value == null
        ? ''
        : typeof value === 'object'
          ? canonicalJson(value)
          : String(value);
    if (/^[\s\uFEFF]*[=+@＝＋－＠-]/u.test(s) || /^[\t\r\n]/u.test(s))
      s = 'TEXT: ' + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return (
    [
      keys.map(field).join(','),
      ...result.rows.map((r) => keys.map((k) => field(r[k])).join(',')),
    ].join('\r\n') + '\r\n'
  );
}
export function makeWorkMission(input) {
  const envelope = workSourceSchema.parse(input),
    result = executeWork(envelope.work);
  return {
    id: `work-${workDigest(envelope).slice(2, 42)}`,
    title: `Verified ${envelope.work.kind} work`,
    objective:
      'Produce a reproducible analytical deliverable over the supplied records. Independently recompute the results before acceptance. No external change, refund or profit is authorized or established.',
    work: envelope.work,
    ...(envelope.measurement ? { measurement: envelope.measurement } : {}),
    sources: [
      {
        id: 'work-input',
        title: 'Authorized work observation',
        text: JSON.stringify({
          observedAt: envelope.observedAt,
          inputDigest: result.inputDigest,
          kind: result.kind,
        }),
      },
    ],
    opportunities: [
      {
        id: 'verified-analysis',
        title: 'Compute and independently review the analytical result',
        benefit: 0,
        cost: 0,
        probability: 1,
        downside: 0,
        sourceIds: ['work-input'],
        rationale:
          'Zero-dollar screening values grant analytical admission only. Actual provider/review costs require owner reservations and measurement; this analysis claims no financial benefit.',
      },
    ],
    policy: {
      maxCost: 0,
      maxDownside: 0,
      minExpectedNet: 0,
      stressBenefitBps: 10000,
    },
    unit: 'USD; no benefit forecast',
  };
}
export async function verifyWorkFiles(directory, result) {
  if (!result || !(await lstat(directory)).isDirectory())
    throw new Error('A work result and real artifact directory are required');
  const read = async (name) => {
    const handle = await open(
      join(directory, name),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > 8000000)
        throw new Error('Work artifact exceeds limit');
      const chunks = [];
      let size = 0;
      for await (const chunk of handle.createReadStream({ autoClose: false })) {
        size += chunk.length;
        if (size > 8000000) throw new Error('Work artifact exceeds limit');
        chunks.push(chunk);
      }
      return Buffer.concat(chunks).toString('utf8');
    } finally {
      await handle.close();
    }
  };
  if (
    workDigest(JSON.parse(await read('work-result.json'))) !==
      workDigest(result) ||
    (await read('work-results.csv')) !== workCsv(result)
  )
    throw new Error('Work artifacts differ from signed computation');
  return {
    verified: true,
    resultDigest: workDigest(result),
    csvDigest: workDigest(workCsv(result)),
  };
}
