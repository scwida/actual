import { useCallback, useEffect, useState } from 'react';

import { listen } from '@actual-app/core/platform/client/connection';
import { q } from '@actual-app/core/shared/query';
import type { CategoryEntity } from '@actual-app/core/types/models';

import { aqlQuery } from '#queries/aqlQuery';

import { useEnvelopeBalances } from './useEnvelopeBalances';

type ReservedCategoryRow = Pick<CategoryEntity, 'id'>;

// `categories` changing (e.g. the one-time envelope-engine cutover/repair
// step re-seeding the reserved row) is the only thing that could change
// which row this is -- the reserved category's id is otherwise permanent
// for the life of a budget file.
const RELEVANT_TABLES = new Set(['categories']);

/**
 * The id of the reserved "Unallocated" envelope (CLAUDE.md "How money
 * moves" #4) -- the real, stored-balance catch-all for deposits with no
 * chosen destination yet, and the source/destination for every
 * quick-fund/transfer-available/cover action in the budget table (see
 * `#budget/mutations`).
 *
 * There is no client-importable constant for this id: the server-side
 * `UNALLOCATED_ENVELOPE_ID` lives under `#server/envelopes/`, which pulls
 * in Node-only platform code and can't be bundled for the browser. Instead
 * this queries `categories` for the row the engine marks with
 * `is_reserved` + `reserved_kind: 'unallocated'` (see
 * `packages/loot-core/src/server/envelopes/unallocated.ts`) -- the same
 * columns already exposed through the AQL schema for exactly this purpose.
 */
export function useUnallocatedEnvelopeId(): {
  id: CategoryEntity['id'] | null;
  isLoading: boolean;
} {
  const [id, setId] = useState<CategoryEntity['id'] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    const { data } = await aqlQuery(
      q('categories')
        .filter({ is_reserved: true, reserved_kind: 'unallocated' })
        .select('id'),
    );
    // Safe: `aqlQuery` returns `unknown` because AQL results aren't
    // statically typed (see the file-level JSDoc above), but this query's
    // own `.select('id')` above guarantees each row is shaped exactly like
    // `ReservedCategoryRow` -- there's no server-side narrowing available
    // to do this without a cast.
    const [row] = (data ?? []) as ReservedCategoryRow[];
    setId(row?.id ?? null);
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

  return { id, isLoading };
}

/**
 * The Unallocated envelope's id plus its current real, live balance
 * (`#hooks/useEnvelopeBalances` already includes reserved envelopes -- it
 * queries `categories` directly rather than going through the old
 * engine-facing `get-categories` handler, which deliberately excludes
 * reserved rows).
 */
export function useUnallocatedEnvelope(): {
  id: CategoryEntity['id'] | null;
  balance: number;
  isLoading: boolean;
} {
  const { id, isLoading: idLoading } = useUnallocatedEnvelopeId();
  const { balances, isLoading: balancesLoading } = useEnvelopeBalances();

  return {
    id,
    balance: id ? (balances[id] ?? 0) : 0,
    isLoading: idLoading || balancesLoading,
  };
}
