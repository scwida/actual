import * as db from '#server/db';
import type { IntegerAmount } from '#shared/util';

/**
 * The subset of a real `transactions` row that fund-movement validation
 * cares about. Only ever read from the raw `transactions` table (not the
 * AQL `v_transactions*` views) since this runs synchronously inside
 * `applyMovement`'s validation path.
 */
export type RealTransaction = Pick<db.DbTransaction, 'id' | 'acct' | 'amount'>;

/**
 * Looks up a real, non-deleted transaction by id. Returns `null` (not an
 * error) if it doesn't exist -- callers that require one should throw
 * with a message specific to their own context.
 */
export function getRealTransaction(
  transactionId: string,
): RealTransaction | null {
  return (
    db.firstSync<RealTransaction>(
      'SELECT id, acct, amount FROM transactions WHERE id = ? AND tombstone = 0',
      [transactionId],
    ) ?? null
  );
}

/**
 * Sum of every `fund` movement already recorded in `envelope_ledger`
 * against a given real transaction. A single real deposit can be split
 * across multiple envelopes (e.g. a paycheck committed to several
 * envelopes), but the running total claimed from it must never exceed
 * what that transaction is actually worth -- see
 * `assertFundBackedByRealMoney` in `movement.ts`.
 */
export function getAmountAlreadyFundedFromTransaction(
  transactionId: string,
): IntegerAmount {
  const row = db.firstSync<{ total: number }>(
    `SELECT IFNULL(SUM(amount), 0) AS total FROM envelope_ledger
     WHERE transaction_id = ? AND movement_type = 'fund'`,
    [transactionId],
  );
  return row?.total ?? 0;
}

/**
 * Total real money currently sitting across every non-deleted, on-budget
 * ledger account -- i.e. the sum of every alive transaction's amount.
 * This is the hard ceiling from CLAUDE.md's core invariant: "the sum of
 * all envelope balances must never exceed the total across ledger
 * accounts."
 *
 * Split-transaction handling: Actual stores a split transaction as one
 * parent row (`isParent = 1`, amount = the full total) PLUS one child row
 * per split (`isChild = 1`, amounts summing to that same total) -- both
 * alive, non-tombstoned rows in the same table. Summing both would double
 * count every split deposit. This codebase's existing, already-correct
 * convention for "what is a real transaction's contribution to a
 * balance" is `WHERE isParent = 0` (see `getAccountBalance` /
 * `getAccountProperties` in `server/accounts/app.ts`), which keeps every
 * non-split transaction and every split's child rows, but drops the
 * redundant parent row. Reused verbatim here rather than inventing a new
 * convention.
 *
 * Off-budget accounts: intentionally EXCLUDED from this ceiling. In
 * Actual, off-budget accounts are typically things like tracked
 * loans/investments/mortgages that are not meant to be budgeted from --
 * CLAUDE.md's envelope philosophy is about money you can actually
 * allocate to jobs, and off-budget balances aren't spendable through the
 * envelope system. Counting them here would let envelope credit be
 * "backed" by money that's not actually fundable, so they're left out of
 * the fundable ceiling. (If a future direction wants off-budget accounts
 * partially fundable, that's a product decision, not an engine bug.)
 */
export function getTotalRealLedgerBalance(): IntegerAmount {
  const row = db.firstSync<{ total: number }>(
    `SELECT IFNULL(SUM(t.amount), 0) AS total
     FROM transactions t
     JOIN accounts a ON a.id = t.acct
     WHERE t.tombstone = 0
       AND t.isParent = 0
       AND a.tombstone = 0
       AND a.offbudget = 0`,
  );
  return row?.total ?? 0;
}

/**
 * Total of every envelope's current cached real balance. Only a `fund`
 * movement can increase this total -- `spend` decreases it and
 * `transfer` leaves it unchanged -- so this is the number that must
 * never be allowed to exceed `getTotalRealLedgerBalance()`.
 */
export function getTotalEnvelopeBalance(): IntegerAmount {
  const row = db.firstSync<{ total: number }>(
    'SELECT IFNULL(SUM(balance), 0) AS total FROM envelope_balances',
  );
  return row?.total ?? 0;
}
