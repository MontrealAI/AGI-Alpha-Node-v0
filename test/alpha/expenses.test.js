import { it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Wallet } from 'ethers';
import {
  initializeNode,
  loadNode,
  recordOperation,
  importExpense,
  runMission,
} from '../../src/alpha/node.js';
import { signExpense } from '../../src/alpha/expenses.js';
import { digest } from '../../src/alpha/mission.js';
import { operationStatus } from '../../src/alpha/operations.js';
let dir, reviewer, node, cycle, request, mission;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'alpha-expense-'));
  reviewer = Wallet.createRandom();
  await initializeNode(dir, {
    ensName: 'expenses.alpha.node.agi.eth',
    reviewer: reviewer.address,
  });
  node = await loadNode(dir);
  cycle = digest('failed fixture');
  mission = JSON.parse(
    await readFile('examples/alpha/opportunity-scan.json', 'utf8'),
  );
  await recordOperation(dir, {
    phase: 'reserved',
    cycle,
    missionId: mission.id,
    reservedMicroUsd: 100,
  });
  await recordOperation(dir, {
    phase: 'failed',
    cycle,
    missionId: mission.id,
    reservedMicroUsd: 0,
  });
  request = {
    type: 'expense-attestation-v1',
    node: node.config.address,
    ensName: node.config.ensName,
    reviewer: reviewer.address,
    cycle,
    costUsd: 12,
    humanMinutes: 3,
    evidenceHash: digest('synthetic invoice fixture'),
    observedAt: new Date().toISOString(),
    notes: 'Synthetic failure cost fixture, not a real invoice.',
  };
});
afterEach(async () => rm(dir, { recursive: true, force: true }));
it('persists one reviewer-bound expense per failed attempt and closes its mission against later reuse', async () => {
  const signed = await signExpense(request, reviewer.privateKey);
  await importExpense(dir, signed);
  const n = await loadNode(dir);
  expect(n.expenses.get(cycle).costUsd).toBe(12);
  expect(operationStatus(n).failedAttempts[0].expenseHash).toBe(signed.hash);
  await expect(importExpense(dir, signed)).rejects.toThrow('previous expense');
  await expect(runMission(dir, mission)).rejects.toThrow(
    'closed with an expense',
  );
});
it('rejects mismatched signatures, unknown attempts, future dates and expenses before failure', async () => {
  await expect(
    signExpense(request, Wallet.createRandom().privateKey),
  ).rejects.toThrow('reviewer');
  const signed = await signExpense(request, reviewer.privateKey);
  await expect(importExpense(dir, { ...signed, costUsd: 0 })).rejects.toThrow(
    'binding',
  );
  for (const patch of [
    { node: Wallet.createRandom().address },
    { ensName: 'wrong.alpha.node.agi.eth' },
    { cycle: digest('unknown') },
    { observedAt: '2000-01-01T00:00:00.000Z' },
  ]) {
    await expect(
      importExpense(
        dir,
        await signExpense({ ...request, ...patch }, reviewer.privateKey),
      ),
    ).rejects.toThrow();
  }
  await expect(
    signExpense(
      { ...request, observedAt: new Date(Date.now() + 120000).toISOString() },
      reviewer.privateKey,
    ),
  ).rejects.toThrow('future');
  await expect(
    signExpense({ ...request, node: reviewer.address }, reviewer.privateKey),
  ).rejects.toThrow('separate');
});
it('refuses an expense when the failed attempt already produced a committed run', async () => {
  await runMission(dir, mission);
  await expect(
    importExpense(dir, await signExpense(request, reviewer.privateKey)),
  ).rejects.toThrow('committed run');
});
