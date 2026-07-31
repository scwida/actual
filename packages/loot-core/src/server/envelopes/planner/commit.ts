import { v4 as uuidv4 } from 'uuid';

import * as db from '#server/db';
import { getEnvelopeBalance } from '#server/envelopes/balances';
import { applyMovement } from '#server/envelopes/movement';
import { getUnallocatedEnvelopeId } from '#server/envelopes/unallocated';
import { batchMessages } from '#server/sync';
import type { IntegerAmount } from '#shared/util';
import type { CategoryEntity, MoneyLocation } from '#types/models';

import {
  fromDbPaycheck,
  getPlannedAllocations,
  getPlannedPaycheckRow,
} from './actions';
import type { PlannedAllocation, PlannedPaycheck } from './types';

export type SuggestedReduction = {
  shortfallAmount: IntegerAmount;
  suggested: Record<CategoryEntity['id'], IntegerAmount>;
};

/**
 * PURE function: given a paycheck's actual deposit amount and its draft
 * allocations, computes how much (if any) needs to come out of the plan
 * to fit the real deposit, and a suggested per-envelope reduction.
 *
 * This is called for EVERY commit, not just short ones -- there is
 * exactly one review step, not two flows. When the deposit exactly
 * matches or exceeds the plan (the ordinary happy path),
 * `shortfallAmount` is 0 and `suggested` is just the drafted amounts
 * unchanged.
 *
 * Reduction order: this intentionally uses a simple, deterministic,
 * pure ordering -- reduce the most-recently-drafted allocation first,
 * tie-broken by envelope id -- rather than parsing the old formula
 * engine's goal-template priority notes (`goal_def`/template pegjs
 * grammar), which is tightly coupled to the spreadsheet-cell engine this
 * rewrite exists to replace. Once envelopes have real target-date goals
 * (CLAUDE.md "Goals with dates"), that's a much better priority signal
 * and this ordering should be revisited.
 */
export function computeSuggestedReduction(
  paycheck: Pick<PlannedPaycheck, 'actual_amount' | 'expected_amount'>,
  allocations: PlannedAllocation[],
): SuggestedReduction {
  const totalDrafted = allocations.reduce((sum, a) => sum + a.amount, 0);
  const actualAmount = paycheck.actual_amount ?? paycheck.expected_amount;
  const shortfallAmount = Math.max(0, totalDrafted - actualAmount);

  const suggested: Record<CategoryEntity['id'], IntegerAmount> = {};
  for (const allocation of allocations) {
    suggested[allocation.envelope_id] = allocation.amount;
  }

  if (shortfallAmount === 0) {
    return { shortfallAmount, suggested };
  }

  const reductionOrder = [...allocations].sort((a, b) => {
    if (a.drafted_at !== b.drafted_at) {
      return a.drafted_at < b.drafted_at ? 1 : -1;
    }
    return a.envelope_id < b.envelope_id ? 1 : -1;
  });

  let remaining = shortfallAmount;
  for (const allocation of reductionOrder) {
    if (remaining <= 0) {
      break;
    }
    const reduceBy = Math.min(allocation.amount, remaining);
    suggested[allocation.envelope_id] = allocation.amount - reduceBy;
    remaining -= reduceBy;
  }

  return { shortfallAmount, suggested };
}

/**
 * Read-only preview of what `commitPaycheck` would suggest right now, for
 * a review screen to show before the user actually commits. Reuses the
 * exact same pure `computeSuggestedReduction` function that `commitPaycheck`
 * calls internally -- there is only one implementation of this
 * calculation, so preview and commit can never drift apart. Writes
 * nothing: no ledger rows, no balance changes, no status transition.
 *
 * Deliberately does not require the paycheck to already be matched to a
 * real transaction (`actual_amount` may still be null) -- like
 * `computeSuggestedReduction` itself, this falls back to `expected_amount`
 * so the UI can preview against the plan before a deposit is matched.
 */
export async function previewCommitPaycheck(
  plannedPaycheckId: PlannedPaycheck['id'],
): Promise<SuggestedReduction> {
  const paycheckRow = getPlannedPaycheckRow(plannedPaycheckId);
  const allocations = await getPlannedAllocations(plannedPaycheckId);

  return computeSuggestedReduction(
    {
      actual_amount: paycheckRow.actual_amount ?? null,
      expected_amount: paycheckRow.expected_amount,
    },
    allocations,
  );
}

function assertCanCommit(paycheck: db.DbPlannedPaycheck): void {
  if (paycheck.status !== 'draft') {
    throw new Error(
      `Cannot commit a planned paycheck that is not a draft (status: ${paycheck.status})`,
    );
  }
  if (paycheck.actual_amount == null) {
    throw new Error(
      'Cannot commit a planned paycheck before matching it to a real transaction (call matchTransaction first)',
    );
  }
}

export type CommitPaycheckResult = {
  paycheck: PlannedPaycheck;
  ledgerRowIds: string[];
  leftoverToUnallocated: IntegerAmount;
};

/**
 * The ONLY function that calls `applyMovement` for the planner. Must
 * only ever be called after an explicit user-confirmed review of
 * `approvedAmounts` -- that review step is a UI concern, not built here.
 *
 * Re-validates `sum(approvedAmounts) <= actual_amount` and throws
 * (rather than silently truncating) if that's violated. Any leftover
 * (`actual_amount - sum(approvedAmounts)`) is routed as an additional
 * fund movement to the reserved Unallocated envelope, so the full real
 * deposit is always accounted for.
 *
 * `actual_amount` itself is not a second unverified number here -- by the
 * time a paycheck reaches `committed: true` in `matchTransaction`, it was
 * already derived directly from a real `transactions` row (see
 * `matchTransaction`). This function's own `totalApproved <= actualAmount`
 * check is a review-step guard (don't let the user approve committing
 * more than the matched deposit), while the underlying real-money
 * guarantee -- that every dollar of resulting envelope credit actually
 * traces to that same real transaction and never exceeds its real amount
 * -- is enforced independently by `applyMovement` itself
 * (`assertFundBackedByRealMoney`) on every `fund` call below, so a stale
 * or since-edited transaction is still caught even if `actual_amount`
 * here were out of date.
 */
export async function commitPaycheck(
  plannedPaycheckId: PlannedPaycheck['id'],
  approvedAmounts: Record<CategoryEntity['id'], IntegerAmount>,
): Promise<CommitPaycheckResult> {
  const paycheckRow = getPlannedPaycheckRow(plannedPaycheckId);
  assertCanCommit(paycheckRow);

  const actualAmount = paycheckRow.actual_amount as IntegerAmount;
  const allocations = await getPlannedAllocations(plannedPaycheckId);

  const { shortfallAmount, suggested } = computeSuggestedReduction(
    {
      actual_amount: actualAmount,
      expected_amount: paycheckRow.expected_amount,
    },
    allocations,
  );

  for (const [envelopeId, amount] of Object.entries(approvedAmounts)) {
    if (!Number.isInteger(amount) || amount < 0) {
      throw new Error(
        `commitPaycheck: approved amount for ${envelopeId} must be a non-negative integer, got: ${amount}`,
      );
    }
  }

  const totalApproved = Object.values(approvedAmounts).reduce(
    (sum, amount) => sum + amount,
    0,
  );
  if (totalApproved > actualAmount) {
    throw new Error(
      `commitPaycheck: approved amounts (${totalApproved}) exceed the actual deposit (${actualAmount}). ` +
        'Reduce the approved allocations rather than committing money that was not actually deposited.',
    );
  }

  const leftoverToUnallocated = actualAmount - totalApproved;

  // Best-effort: use the matched transaction's real account/date for the
  // fund movements' counterparty, falling back to the plan's expected
  // date if the transaction can't be found for some reason.
  const transaction = paycheckRow.actual_transaction_id
    ? db.firstSync<Pick<db.DbTransaction, 'acct' | 'date'>>(
        'SELECT acct, date FROM transactions WHERE id = ?',
        [paycheckRow.actual_transaction_id],
      )
    : null;
  const movementDate = transaction
    ? db.fromDateRepr(transaction.date)
    : paycheckRow.expected_date;
  const counterparty: MoneyLocation | undefined = transaction
    ? { account: transaction.acct }
    : undefined;

  const ledgerRowIds: string[] = [];
  const committedAt = new Date().toISOString();
  const allocationByEnvelope = new Map(
    allocations.map(allocation => [allocation.envelope_id, allocation]),
  );

  await batchMessages(async () => {
    for (const [envelopeId, amount] of Object.entries(approvedAmounts)) {
      if (amount <= 0) {
        continue;
      }
      const matchingAllocation = allocationByEnvelope.get(envelopeId);
      const result = await applyMovement({
        type: 'fund',
        envelope: envelopeId,
        amount,
        counterparty,
        transactionId: paycheckRow.actual_transaction_id ?? undefined,
        plannedAllocationId: matchingAllocation?.id,
        date: movementDate,
        notes: `Paycheck commit (${plannedPaycheckId})`,
      });
      ledgerRowIds.push(...result.ledgerRowIds);
    }

    if (leftoverToUnallocated > 0) {
      const result = await applyMovement({
        type: 'fund',
        envelope: getUnallocatedEnvelopeId(),
        amount: leftoverToUnallocated,
        counterparty,
        transactionId: paycheckRow.actual_transaction_id ?? undefined,
        date: movementDate,
        notes: `Paycheck commit leftover (${plannedPaycheckId})`,
      });
      ledgerRowIds.push(...result.ledgerRowIds);
    }

    // Record the review outcome on every originally-drafted allocation,
    // even ones the user approved at $0 or overrode away from the
    // suggestion -- this is the permanent record (CLAUDE.md "Historical
    // lock-in").
    for (const allocation of allocations) {
      await db.updateWithSchema('planned_allocation', {
        id: allocation.id,
        suggested_amount: suggested[allocation.envelope_id] ?? null,
        approved_amount: approvedAmounts[allocation.envelope_id] ?? 0,
      });
    }

    // Any approved envelope that wasn't part of the original draft (e.g.
    // added during the review step) still gets an audit record.
    for (const [envelopeId, amount] of Object.entries(approvedAmounts)) {
      if (allocationByEnvelope.has(envelopeId) || amount <= 0) {
        continue;
      }
      await db.insertWithSchema('planned_allocation', {
        id: uuidv4(),
        planned_paycheck_id: plannedPaycheckId,
        envelope_id: envelopeId,
        amount,
        envelope_balance_at_draft: getEnvelopeBalance(envelopeId),
        drafted_at: committedAt,
        suggested_amount: null,
        approved_amount: amount,
      });
    }

    await db.updateWithSchema('planned_paycheck', {
      id: plannedPaycheckId,
      status: 'committed',
      commit_shortfall_amount: shortfallAmount,
      // 'json'-typed in the AQL schema -- convertForUpdate stringifies
      // this for us, so pass the object as-is (not pre-stringified).
      commit_suggested_allocations: suggested,
      committed_at: committedAt,
    });
  });

  return {
    paycheck: fromDbPaycheck(getPlannedPaycheckRow(plannedPaycheckId)),
    ledgerRowIds,
    leftoverToUnallocated,
  };
}
