import { format, subMonths } from 'date-fns';

import * as db from '#server/db';
import type { IntegerAmount } from '#shared/util';
import type { CategoryEntity } from '#types/models';

/**
 * An envelope's average monthly spend over a trailing window, aggregated
 * straight from `envelope_ledger`'s `spend`-type rows (every real spend
 * already lands there via `transaction-hooks.ts`'s reconciliation -- see
 * that file's own doc comment). This is a genuinely reusable, read-only
 * query, not a one-off helper: it backs the recurring-goal setup's
 * historical-spending suggested default (CLAUDE.md "Envelope goal
 * types": "the app should suggest an amount based on that envelope's
 * historical spending average ... a smart default, not a hard rule") AND
 * is a stated prerequisite for the future standalone spending-trends
 * report (CLAUDE.md roadmap item 10) -- both consume this exact function,
 * not their own separate aggregation.
 *
 * `spend` rows are stored as negative amounts (see `movement.ts`'s
 * `buildLedgerRows`), so the raw SUM is negative or zero; this returns a
 * positive "how much was typically spent" figure. Averages over
 * `monthsWindow` (a fixed divisor), not over however many months
 * actually had a `spend` row in them -- a month with zero spending is a
 * real, informative zero for this average, not a month that should be
 * skipped.
 *
 * `asOf` (plain ISO 'YYYY-MM-DD', defaults to today) anchors the trailing
 * window's end, overridable so callers -- and tests -- can pin "now"
 * explicitly rather than depending on wall-clock time.
 */
export async function getEnvelopeAverageMonthlySpend(
  envelopeId: CategoryEntity['id'],
  monthsWindow: number = 6,
  asOf: string = new Date().toISOString().slice(0, 10),
): Promise<IntegerAmount> {
  if (!Number.isInteger(monthsWindow) || monthsWindow <= 0) {
    throw new Error(
      `getEnvelopeAverageMonthlySpend: monthsWindow must be a positive integer, got: ${monthsWindow}`,
    );
  }

  const windowStart = format(
    subMonths(new Date(`${asOf}T00:00:00`), monthsWindow),
    'yyyy-MM-dd',
  );

  const row = await db.first<{ total: number }>(
    `SELECT IFNULL(SUM(amount), 0) AS total FROM envelope_ledger
     WHERE envelope_id = ?
       AND movement_type = 'spend'
       AND date >= ?
       AND date <= ?`,
    [envelopeId, windowStart, asOf],
  );

  const totalSpent = Math.abs(row?.total ?? 0);
  return Math.round(totalSpent / monthsWindow);
}
