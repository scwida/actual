import { useCallback, useEffect, useState } from 'react';

import { listen } from '@actual-app/core/platform/client/connection';
import { q } from '@actual-app/core/shared/query';
import type { IntegerAmount } from '@actual-app/core/shared/util';
import type { CategoryEntity } from '@actual-app/core/types/models';

import { aqlQuery } from '#queries/aqlQuery';

export type EnvelopeBalanceMap = Record<CategoryEntity['id'], IntegerAmount>;

// Any sync-event `tables` entry in this set means an envelope's current
// real balance may have changed and the map needs a refetch.
const RELEVANT_TABLES = new Set([
  // `envelope_balances` is a pure cache written by
  // `incrementEnvelopeBalance` (see
  // packages/loot-core/src/server/envelopes/balances.ts) with a single raw
  // SQL statement, on purpose, to avoid a read-then-write lost-update race
  // on concurrent movements. That write deliberately bypasses the normal
  // CRDT message path, so it never appears in a sync event's `tables` list
  // -- a query keyed only on `categories`/`envelope_balances` (the tables
  // the AQL `v_categories` join actually touches) would never live-refresh
  // from another fund/spend/transfer movement. Every one of those
  // movements DOES insert a CRDT-tracked `envelope_ledger` row in the same
  // operation (same file), so we key off that instead. See the
  // feature-builder report flagging this as worth cleaning up on the
  // engine side (e.g. having the balance cache write also surface in the
  // sync event) so every consumer doesn't need to know this workaround.
  'envelope_ledger',
  // Committing/canceling a paycheck can also move money (commit) or
  // otherwise change what's worth showing.
  'planned_paycheck',
  'planned_allocation',
  // Included defensively in case a future change makes the cache write
  // CRDT-tracked after all.
  'envelope_balances',
  'categories',
]);

type CategoryBalanceRow = Pick<CategoryEntity, 'id' | 'balance'>;

/**
 * Live map of every envelope's current real balance (`categories.balance`,
 * a virtual field joined from `envelope_balances` -- see
 * `packages/loot-core/src/server/aql/schema/index.ts`). Used for the
 * planner's live drift indicator (CLAUDE.md "Live drift indicators").
 *
 * Deliberately does not use the generic `#hooks/useQuery` live-query hook
 * -- see the `RELEVANT_TABLES` comment above for why a query on
 * `categories`/`envelope_balances` alone would miss most updates.
 */
export function useEnvelopeBalances(): {
  balances: EnvelopeBalanceMap;
  isLoading: boolean;
} {
  const [balances, setBalances] = useState<EnvelopeBalanceMap>({});
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    const { data } = await aqlQuery(q('categories').select(['id', 'balance']));
    const next: EnvelopeBalanceMap = {};
    for (const row of (data ?? []) as CategoryBalanceRow[]) {
      next[row.id] = row.balance ?? 0;
    }
    setBalances(next);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void refetch();

    return listen('sync-event', event => {
      if (
        (event.type === 'applied' || event.type === 'success') &&
        event.tables.some(table => RELEVANT_TABLES.has(table))
      ) {
        void refetch();
      }
    });
  }, [refetch]);

  return { balances, isLoading };
}
