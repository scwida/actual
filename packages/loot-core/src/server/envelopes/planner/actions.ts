import { v4 as uuidv4 } from 'uuid';

import * as db from '#server/db';
import { getEnvelopeBalance } from '#server/envelopes/balances';
import { getRealTransaction } from '#server/envelopes/real-money';
import { batchMessages } from '#server/sync';
import type { IntegerAmount } from '#shared/util';
import type { CategoryEntity } from '#types/models';

import type { PlannedAllocation, PlannedPaycheck } from './types';

// Everything in this file is metadata-only: it never calls
// `applyMovement` and never touches a real envelope balance. Only
// `commitPaycheck` (in ./commit) is allowed to do that, and only once,
// after an explicit user-confirmed review. See CLAUDE.md "The Planner,
// precisely".

function isSuggestedAllocationsMap(
  value: unknown,
): value is Record<CategoryEntity['id'], IntegerAmount> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every(amount => typeof amount === 'number');
}

function parseSuggestedAllocations(
  json: string,
): Record<CategoryEntity['id'], IntegerAmount> {
  const parsed: unknown = JSON.parse(json);
  if (!isSuggestedAllocationsMap(parsed)) {
    throw new Error(
      `fromDbPaycheck: commit_suggested_allocations did not parse to a Record<string, number>, got: ${json}`,
    );
  }
  return parsed;
}

export function fromDbPaycheck(row: db.DbPlannedPaycheck): PlannedPaycheck {
  return {
    id: row.id,
    status: row.status,
    expected_date: row.expected_date,
    expected_amount: row.expected_amount,
    created_at: row.created_at,
    actual_transaction_id: row.actual_transaction_id ?? null,
    actual_amount: row.actual_amount ?? null,
    commit_shortfall_amount: row.commit_shortfall_amount ?? null,
    commit_suggested_allocations: row.commit_suggested_allocations
      ? parseSuggestedAllocations(row.commit_suggested_allocations)
      : null,
    committed_at: row.committed_at ?? null,
  };
}

export function fromDbAllocation(
  row: db.DbPlannedAllocation,
): PlannedAllocation {
  return {
    id: row.id,
    planned_paycheck_id: row.planned_paycheck_id,
    envelope_id: row.envelope_id,
    amount: row.amount,
    envelope_balance_at_draft: row.envelope_balance_at_draft,
    drafted_at: row.drafted_at,
    suggested_amount: row.suggested_amount ?? null,
    approved_amount: row.approved_amount ?? null,
  };
}

export function getPlannedPaycheckRow(
  plannedPaycheckId: PlannedPaycheck['id'],
): db.DbPlannedPaycheck {
  const row = db.firstSync<db.DbPlannedPaycheck>(
    'SELECT * FROM planned_paycheck WHERE id = ?',
    [plannedPaycheckId],
  );
  if (!row) {
    throw new Error(`Planned paycheck not found: ${plannedPaycheckId}`);
  }
  return row;
}

export async function getPlannedAllocations(
  plannedPaycheckId: PlannedPaycheck['id'],
): Promise<PlannedAllocation[]> {
  const rows = await db.all<db.DbPlannedAllocation>(
    'SELECT * FROM planned_allocation WHERE planned_paycheck_id = ? AND tombstone = 0',
    [plannedPaycheckId],
  );
  return rows.map(fromDbAllocation);
}

function assertIsDraft(paycheck: Pick<db.DbPlannedPaycheck, 'status'>): void {
  if (paycheck.status !== 'draft') {
    throw new Error(
      `Cannot modify a planned paycheck that is not a draft (status: ${paycheck.status})`,
    );
  }
}

export async function createPlannedPaycheck({
  expectedDate,
  expectedAmount,
  allocations = [],
}: {
  expectedDate: string;
  expectedAmount: IntegerAmount;
  allocations?: Array<{
    envelopeId: CategoryEntity['id'];
    amount: IntegerAmount;
  }>;
}): Promise<PlannedPaycheck> {
  if (!Number.isInteger(expectedAmount) || expectedAmount <= 0) {
    throw new Error(
      `createPlannedPaycheck: expectedAmount must be a positive integer, got: ${expectedAmount}`,
    );
  }

  const id = uuidv4();
  const createdAt = new Date().toISOString();

  await batchMessages(async () => {
    await db.insertWithSchema('planned_paycheck', {
      id,
      status: 'draft',
      expected_date: expectedDate,
      expected_amount: expectedAmount,
      created_at: createdAt,
    });

    for (const allocation of allocations) {
      await insertDraftAllocationRow(
        id,
        allocation.envelopeId,
        allocation.amount,
        createdAt,
      );
    }
  });

  return fromDbPaycheck({
    id,
    status: 'draft',
    expected_date: expectedDate,
    expected_amount: expectedAmount,
    created_at: createdAt,
  });
}

async function insertDraftAllocationRow(
  plannedPaycheckId: PlannedPaycheck['id'],
  envelopeId: CategoryEntity['id'],
  amount: IntegerAmount,
  draftedAt: string,
): Promise<PlannedAllocation> {
  const id = uuidv4();
  const envelopeBalanceAtDraft = getEnvelopeBalance(envelopeId);

  await db.insertWithSchema('planned_allocation', {
    id,
    planned_paycheck_id: plannedPaycheckId,
    envelope_id: envelopeId,
    amount,
    envelope_balance_at_draft: envelopeBalanceAtDraft,
    drafted_at: draftedAt,
  });

  return {
    id,
    planned_paycheck_id: plannedPaycheckId,
    envelope_id: envelopeId,
    amount,
    envelope_balance_at_draft: envelopeBalanceAtDraft,
    drafted_at: draftedAt,
    suggested_amount: null,
    approved_amount: null,
  };
}

/**
 * Creates or updates a single envelope's draft allocation for a planned
 * paycheck. `envelope_balance_at_draft`/`drafted_at` are only set the
 * first time an envelope is added to the draft, and are preserved on
 * later edits -- they're the fixed snapshot the live drift indicator
 * compares the envelope's current real balance against.
 *
 * Setting amount to 0 removes the allocation from the draft.
 */
export async function updateDraftAllocation({
  plannedPaycheckId,
  envelopeId,
  amount,
}: {
  plannedPaycheckId: PlannedPaycheck['id'];
  envelopeId: CategoryEntity['id'];
  amount: IntegerAmount;
}): Promise<PlannedAllocation | null> {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(
      `updateDraftAllocation: amount must be a non-negative integer, got: ${amount}`,
    );
  }

  const paycheck = getPlannedPaycheckRow(plannedPaycheckId);
  assertIsDraft(paycheck);

  const existing = db.firstSync<db.DbPlannedAllocation>(
    'SELECT * FROM planned_allocation WHERE planned_paycheck_id = ? AND envelope_id = ? AND tombstone = 0',
    [plannedPaycheckId, envelopeId],
  );

  if (amount === 0) {
    if (existing) {
      await db.updateWithSchema('planned_allocation', {
        id: existing.id,
        tombstone: true,
      });
    }
    return null;
  }

  if (existing) {
    await db.updateWithSchema('planned_allocation', {
      id: existing.id,
      amount,
    });
    return fromDbAllocation({ ...existing, amount });
  }

  return insertDraftAllocationRow(
    plannedPaycheckId,
    envelopeId,
    amount,
    new Date().toISOString(),
  );
}

/**
 * Edits a draft planned paycheck's `expected_date`/`expected_amount`.
 * Metadata-only, same category as `createPlannedPaycheck` and
 * `updateDraftAllocation` -- never touches a real envelope balance.
 *
 * Deliberately does NOT recompute or touch existing `PlannedAllocation`
 * rows when `expectedAmount` changes: allocations keep the amounts they
 * were drafted with regardless of a later edit to the paycheck's expected
 * amount. `computeSuggestedReduction` (see ./commit) already reconciles
 * drafted-vs-actual at commit time from whatever the real deposit turns
 * out to be, so there is nothing here that needs to guess at a
 * recomputation ahead of that -- doing so would just be a second,
 * possibly-stale copy of what the review step already does correctly.
 */
export async function updateDraftPaycheck({
  plannedPaycheckId,
  expectedDate,
  expectedAmount,
}: {
  plannedPaycheckId: PlannedPaycheck['id'];
  expectedDate?: string;
  expectedAmount?: IntegerAmount;
}): Promise<PlannedPaycheck> {
  const paycheck = getPlannedPaycheckRow(plannedPaycheckId);
  assertIsDraft(paycheck);

  if (
    expectedAmount !== undefined &&
    (!Number.isInteger(expectedAmount) || expectedAmount <= 0)
  ) {
    throw new Error(
      `updateDraftPaycheck: expectedAmount must be a positive integer, got: ${expectedAmount}`,
    );
  }

  const updates: { id: PlannedPaycheck['id'] } & Partial<
    Pick<db.DbPlannedPaycheck, 'expected_date' | 'expected_amount'>
  > = { id: plannedPaycheckId };
  if (expectedDate !== undefined) {
    updates.expected_date = expectedDate;
  }
  if (expectedAmount !== undefined) {
    updates.expected_amount = expectedAmount;
  }

  await db.updateWithSchema('planned_paycheck', updates);

  return fromDbPaycheck(getPlannedPaycheckRow(plannedPaycheckId));
}

export async function cancelPaycheck({
  plannedPaycheckId,
}: {
  plannedPaycheckId: PlannedPaycheck['id'];
}): Promise<void> {
  const paycheck = getPlannedPaycheckRow(plannedPaycheckId);
  assertIsDraft(paycheck);

  await db.updateWithSchema('planned_paycheck', {
    id: plannedPaycheckId,
    status: 'canceled',
  });
}

/**
 * Records which real ledger transaction this planned paycheck's deposit
 * matches. This is still metadata-only -- it does not move any money.
 * It's the "verify the actual deposit against the ledger" half of
 * committing (CLAUDE.md "Committing is the real event"); the caller
 * still has to call `commitPaycheck` with reviewed/approved amounts to
 * actually move money.
 *
 * `actual_amount` is deliberately NOT a caller-supplied argument here --
 * it is always derived directly from the real `transactions` row for
 * `transactionId`. A caller asserting an arbitrary "this is what got
 * deposited" number would let a plan commit against money that was never
 * actually verified, which is exactly the gap this function exists to
 * close. `commitPaycheck` (and, underneath it, `applyMovement`) then
 * re-derives/re-checks this same real amount again at the point money
 * actually moves, so a transaction edited or removed between matching
 * and committing is still caught.
 */
export async function matchTransaction({
  plannedPaycheckId,
  transactionId,
}: {
  plannedPaycheckId: PlannedPaycheck['id'];
  transactionId: string;
}): Promise<void> {
  const paycheck = getPlannedPaycheckRow(plannedPaycheckId);
  assertIsDraft(paycheck);

  const transaction = getRealTransaction(transactionId);
  if (!transaction) {
    throw new Error(
      `matchTransaction: transaction not found (or deleted): ${transactionId}`,
    );
  }
  if (!Number.isInteger(transaction.amount) || transaction.amount <= 0) {
    throw new Error(
      `matchTransaction: matched transaction must be a real deposit (a positive amount), got ${transaction.amount} for transaction ${transactionId}`,
    );
  }

  await db.updateWithSchema('planned_paycheck', {
    id: plannedPaycheckId,
    actual_transaction_id: transactionId,
    actual_amount: transaction.amount,
  });
}
