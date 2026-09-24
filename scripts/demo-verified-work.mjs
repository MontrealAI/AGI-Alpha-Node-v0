import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { demonstrateWork } from './lib/work-demonstration.mjs';
const root = await mkdtemp(join(tmpdir(), 'alpha-verified-work-'));
try {
  const result = await demonstrateWork(
    root,
    resolve(process.argv[2] ?? 'alpha-work-output'),
  );
  console.log(
    JSON.stringify({
      workKinds: result.records.map((r) => r.kind),
      replayVerified: true,
      recovery: result.recovery,
      specialistRequests: result.specialistRequests,
      productionQualified: result.qualification.gatePassed,
    }),
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
