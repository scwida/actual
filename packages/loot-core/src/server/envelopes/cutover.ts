import * as db from '#server/db';
import { batchMessages } from '#server/sync';

import { ensureUnallocatedEnvelope } from './unallocated';

export type EnvelopeEngineCutoverResult = {
  seededCount: number;
};

/**
 * The one-time migration of an existing (old formula-engine) budget
 * file's category data to the real-balance envelope engine.
 *
 * Per CLAUDE.md "Cutover vs. Import": this is a fresh start at zero, not
 * an import. It keeps only structural identity (which categories exist)
 * and discards everything derived from the old engine's
 * zero_budgets/reflect_budgets tables or leftover/carryover/budgeted
 * formula cells -- no "starting balance" is ever seeded from old
 * leftover math, and this function never reads from those tables at
 * all. Every envelope's balance starts at exactly 0 with zero
 * envelope_ledger rows (an envelope with no ledger rows already has an
 * implicit balance of 0 -- see `getEnvelopeBalance` -- so there is
 * nothing to record in the ledger for this).
 *
 * This does NOT run automatically on app load -- it's an explicit,
 * one-time operational step. It is safe to call more than once: it only
 * ever seeds an `envelope_balances` row for a category that doesn't
 * already have one, so it will never overwrite a real balance that has
 * since moved away from 0.
 */
export async function runEnvelopeEngineCutover(): Promise<EnvelopeEngineCutoverResult> {
  await ensureUnallocatedEnvelope();

  const categories = await db.all<Pick<db.DbCategory, 'id'>>(
    'SELECT id FROM categories WHERE tombstone = 0',
  );
  const existingBalances = await db.all<Pick<db.DbEnvelopeBalance, 'id'>>(
    'SELECT id FROM envelope_balances',
  );
  const existingIds = new Set(existingBalances.map(row => row.id));

  const toSeed = categories.filter(category => !existingIds.has(category.id));

  if (toSeed.length === 0) {
    return { seededCount: 0 };
  }

  const seededAt = new Date().toISOString();

  await batchMessages(async () => {
    for (const category of toSeed) {
      await db.insertWithUUID('envelope_balances', {
        id: category.id,
        balance: 0,
        updated_at: seededAt,
      });
    }
  });

  return { seededCount: toSeed.length };
}
