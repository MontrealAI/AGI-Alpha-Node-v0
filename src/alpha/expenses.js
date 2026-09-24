import { z } from 'zod';
import { Wallet, getAddress, verifyMessage } from 'ethers';
import { digest } from './mission.js';
const address = (x) => getAddress(x).toLowerCase();
const hash = z.string().regex(/^0x[a-f0-9]{64}$/);
const schema = z
  .object({
    type: z.literal('expense-attestation-v1'),
    node: z.string(),
    ensName: z.string(),
    reviewer: z.string(),
    cycle: hash,
    costUsd: z.number().finite().nonnegative().max(1e12),
    humanMinutes: z.number().finite().nonnegative().max(1e7),
    evidenceHash: hash,
    observedAt: z.string().datetime(),
    notes: z
      .string()
      .min(10)
      .max(4000)
      .refine(
        (s) => !s.includes('REPLACE_WITH_'),
        'Replace the expense placeholder',
      ),
  })
  .strict();
export async function signExpense(input, privateKey) {
  const body = schema.parse(input),
    wallet = new Wallet(privateKey);
  if (
    address(wallet.address) !== address(body.reviewer) ||
    address(wallet.address) === address(body.node)
  )
    throw new Error('Designated separate reviewer required for expense');
  if (Date.parse(body.observedAt) > Date.now() + 60000)
    throw new Error('Expense is future dated');
  const hash = digest(body);
  return { ...body, hash, signature: await wallet.signMessage(hash) };
}
export function verifyExpense(config, operations, runs, expenses, attestation) {
  const { hash, signature, ...raw } = attestation,
    body = schema.parse(raw);
  if (
    digest(body) !== hash ||
    address(body.node) !== address(config.address) ||
    body.ensName !== config.ensName ||
    address(body.reviewer) !== address(config.reviewer) ||
    address(verifyMessage(hash, signature)) !== address(config.reviewer) ||
    address(config.address) === address(config.reviewer)
  )
    throw new Error('Expense signature or identity binding mismatch');
  const operation = operations.get(body.cycle);
  if (
    !operation ||
    operation.phase !== 'failed' ||
    runs.has(operation.missionId) ||
    expenses.has(body.cycle)
  )
    throw new Error(
      'Expense requires one failed operation without a committed run or previous expense',
    );
  if (Date.parse(body.observedAt) < Date.parse(operation.at))
    throw new Error('Expense predates failed operation');
  return body;
}
