import { addSyncListener } from '#server/sync';

import { recomputeEnvelopeBalances } from './balances';

let unlistenSync: (() => void) | undefined;

/**
 * Registers a sync listener that recomputes `envelope_balances` for any
 * envelope touched by `envelope_ledger` rows that just came in through a
 * sync batch (mirrors how `db/mappings.ts` and `schedules/app.ts`
 * register their own listeners in `applyMessages`).
 *
 * Safe to call more than once -- re-registering replaces the previous
 * listener, the same pattern `mappings.loadMappings()` uses, so this can
 * simply be called again on every budget-file load.
 */
export function initEnvelopeSyncHooks(): void {
  if (unlistenSync) {
    unlistenSync();
  }
  unlistenSync = addSyncListener(onApplySync);
}

function hasStringEnvelopeId(row: unknown): row is { envelope_id: string } {
  return (
    row != null &&
    typeof row === 'object' &&
    'envelope_id' in row &&
    typeof (row as Record<'envelope_id', unknown>).envelope_id === 'string'
  );
}

function onApplySync(
  _oldValues: Map<string, unknown>,
  newValues: Map<string, unknown>,
): void {
  const ledgerRows = newValues.get('envelope_ledger');
  if (!(ledgerRows instanceof Map)) {
    return;
  }

  const envelopeIds = new Set<string>();
  ledgerRows.forEach(row => {
    if (hasStringEnvelopeId(row)) {
      envelopeIds.add(row.envelope_id);
    }
  });

  if (envelopeIds.size > 0) {
    void recomputeEnvelopeBalances([...envelopeIds]);
  }
}
