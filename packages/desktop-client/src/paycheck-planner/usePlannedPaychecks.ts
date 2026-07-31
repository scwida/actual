import { useMemo } from 'react';

import { send } from '@actual-app/core/platform/client/connection';
// Type-only imports from loot-core server code -- safe for the browser
// bundle (erased at compile time), same convention used elsewhere in this
// package (see e.g. `#components/accounts/Account.tsx`'s `UndoState`
// import from `@actual-app/core/server/undo`). Never import a *value* from
// these modules on the client -- they pull in server-only platform code
// (db, sqlite, etc.) that can't run in the browser.
import type { CommitPaycheckResult } from '@actual-app/core/server/envelopes/planner/commit';
import type {
  PlannedAllocation,
  PlannedPaycheck,
} from '@actual-app/core/server/envelopes/planner/types';
import { q } from '@actual-app/core/shared/query';
import type { IntegerAmount } from '@actual-app/core/shared/util';
import type { CategoryEntity } from '@actual-app/core/types/models';

import { useQuery } from '#hooks/useQuery';

/**
 * Every non-canceled planned paycheck (draft or committed), live-updated.
 * `planned_paycheck` is a normal CRDT-tracked AQL table, so the generic
 * live-query hook (`#hooks/useQuery`) correctly refetches whenever it
 * changes -- unlike envelope current balances, see `useEnvelopeBalances.ts`
 * for why those need a different mechanism.
 */
export function usePlannedPaychecks() {
  const { data, isLoading, error } = useQuery<PlannedPaycheck>(
    () =>
      q('planned_paycheck')
        .filter({ status: { $ne: 'canceled' } })
        .select('*')
        .orderBy('expected_date'),
    [],
  );

  return {
    paychecks: useMemo(() => data ?? [], [data]),
    isLoading,
    error,
  };
}

/**
 * Every draft allocation across every planned paycheck, fetched unfiltered
 * and grouped client-side by `planned_paycheck_id` rather than one query
 * per paycheck -- a household's planner data is small, and this lets the
 * planner compute "already allocated this month from earlier paychecks"
 * without N extra round-trips.
 */
export function usePlannedAllocations() {
  const { data, isLoading, error } = useQuery<PlannedAllocation>(
    () => q('planned_allocation').select('*'),
    [],
  );

  const byPaycheck = useMemo(() => {
    const map: Record<string, PlannedAllocation[]> = {};
    for (const allocation of data ?? []) {
      (map[allocation.planned_paycheck_id] ??= []).push(allocation);
    }
    return map;
  }, [data]);

  return {
    allocations: useMemo(() => data ?? [], [data]),
    byPaycheck,
    isLoading,
    error,
  };
}

/**
 * Draft-phase only (CLAUDE.md "The Planner, precisely") -- touches zero
 * real envelope balances.
 */
export async function createPlannedPaycheck(
  expectedDate: string,
  expectedAmount: IntegerAmount,
): Promise<PlannedPaycheck> {
  return send('envelope/planner/create-paycheck', {
    expectedDate,
    expectedAmount,
  });
}

export async function cancelPlannedPaycheck(
  plannedPaycheckId: PlannedPaycheck['id'],
): Promise<void> {
  await send('envelope/planner/cancel-paycheck', { plannedPaycheckId });
}

/**
 * Draft-phase only -- see
 * `packages/loot-core/src/server/envelopes/planner/actions.ts`. Never
 * touches a real envelope balance.
 */
export async function updateDraftAllocation(
  plannedPaycheckId: PlannedPaycheck['id'],
  envelopeId: CategoryEntity['id'],
  amount: IntegerAmount,
): Promise<PlannedAllocation | null> {
  return send('envelope/planner/update-draft-allocation', {
    plannedPaycheckId,
    envelopeId,
    amount,
  });
}

/**
 * Verifies the actual deposit against a real ledger transaction. Still
 * metadata-only -- the real, derived deposit amount always comes back on
 * the planned paycheck row itself (`actual_amount`), never from anything
 * the caller supplies here.
 */
export async function matchPaycheckTransaction(
  plannedPaycheckId: PlannedPaycheck['id'],
  transactionId: string,
): Promise<void> {
  await send('envelope/planner/match-transaction', {
    plannedPaycheckId,
    transactionId,
  });
}

/**
 * The ONLY call that moves real money for the planner. Must only ever be
 * invoked after an explicit user-confirmed review of `approvedAmounts` --
 * see `CommitPaycheckModal.tsx`. Never call this directly from a draft
 * editing surface.
 */
export async function commitPlannedPaycheck(
  plannedPaycheckId: PlannedPaycheck['id'],
  approvedAmounts: Record<CategoryEntity['id'], IntegerAmount>,
): Promise<CommitPaycheckResult> {
  return send('envelope/planner/commit-paycheck', {
    plannedPaycheckId,
    approvedAmounts,
  });
}
