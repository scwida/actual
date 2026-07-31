import * as db from '#server/db';
import { batchMessages } from '#server/sync';
import type { IntegerAmount } from '#shared/util';
import type { CategoryEntity } from '#types/models';

/**
 * Read an envelope's current cached real balance. `envelope_balances` is
 * a cache -- it is always rebuildable from `envelope_ledger` via
 * `recomputeEnvelopeBalances` -- but under normal operation it's kept in
 * sync by `applyMovement`, so reads never need to touch the ledger.
 */
export function getEnvelopeBalance(
  envelopeId: CategoryEntity['id'],
): IntegerAmount {
  const row = db.firstSync<Pick<db.DbEnvelopeBalance, 'balance'>>(
    'SELECT balance FROM envelope_balances WHERE id = ?',
    [envelopeId],
  );
  return row?.balance ?? 0;
}

export async function getEnvelopeBalances(
  envelopeIds: Array<CategoryEntity['id']>,
): Promise<Record<string, IntegerAmount>> {
  const balances: Record<string, IntegerAmount> = Object.fromEntries(
    envelopeIds.map(id => [id, 0]),
  );

  if (envelopeIds.length === 0) {
    return balances;
  }

  const rows = await db.all<Pick<db.DbEnvelopeBalance, 'id' | 'balance'>>(
    `SELECT id, balance FROM envelope_balances WHERE id IN (${envelopeIds
      .map(() => '?')
      .join(', ')})`,
    envelopeIds,
  );

  for (const row of rows) {
    balances[row.id] = row.balance;
  }

  return balances;
}

/**
 * Rebuild-from-ledger repair function. `envelope_balances` is NOT
 * authoritative -- it must always match
 * `SUM(envelope_ledger.amount) GROUP BY envelope_id`. This recomputes it
 * straight from the ledger (the actual source of truth) and writes the
 * result back to the cache.
 *
 * If `envelopeIds` is omitted, every envelope that has at least one
 * ledger row is recomputed. Pass an explicit array (including an empty
 * one) to scope the recompute to specific envelopes.
 */
export async function recomputeEnvelopeBalances(
  envelopeIds?: Array<CategoryEntity['id']>,
): Promise<Record<string, IntegerAmount>> {
  const scoped = envelopeIds !== undefined;

  if (scoped && envelopeIds.length === 0) {
    return {};
  }

  const whereClause = scoped
    ? `WHERE envelope_id IN (${envelopeIds!.map(() => '?').join(', ')})`
    : '';
  const params = scoped ? envelopeIds! : [];

  const sums = await db.all<{ envelope_id: string; total: number }>(
    `SELECT envelope_id, SUM(amount) AS total FROM envelope_ledger ${whereClause} GROUP BY envelope_id`,
    params,
  );
  const sumsByEnvelope = new Map(sums.map(row => [row.envelope_id, row.total]));

  const targetIds = scoped ? envelopeIds! : [...sumsByEnvelope.keys()];

  if (targetIds.length === 0) {
    return {};
  }

  const existingRows = await db.all<Pick<db.DbEnvelopeBalance, 'id'>>(
    `SELECT id FROM envelope_balances WHERE id IN (${targetIds
      .map(() => '?')
      .join(', ')})`,
    targetIds,
  );
  const existingIds = new Set(existingRows.map(row => row.id));

  const updatedAt = new Date().toISOString();
  const results: Record<string, IntegerAmount> = {};

  await batchMessages(async () => {
    for (const envelopeId of targetIds) {
      const balance = sumsByEnvelope.get(envelopeId) ?? 0;
      results[envelopeId] = balance;
      await setEnvelopeBalance(envelopeId, balance, updatedAt, {
        rowExists: existingIds.has(envelopeId),
      });
    }
  });

  return results;
}

/**
 * Atomically applies `delta` to an envelope's cached balance in a single
 * SQL statement -- the fix for a QA-reproduced lost-update race: two
 * concurrent movements against the same envelope (e.g. two concurrent
 * `spend` calls) previously each read the cached balance, computed their
 * own new absolute value in JS, and wrote it back with `setEnvelopeBalance`
 * -- a classic read-then-write race where the second write clobbers the
 * first (see git history / QA report for the reproduction: two concurrent
 * $60 spends against a $100 balance left the cache at $40 instead of the
 * ledger-true -$20).
 *
 * Why a single `INSERT ... ON CONFLICT DO UPDATE SET balance = balance +
 * excluded.balance` statement fixes this: this codebase's sqlite layer
 * (sql.js, verified in `platform/server/sqlite/index.ts`) executes
 * `stmt.run(params)` synchronously with no `await`/yield point in the
 * middle of a single statement. Two concurrent callers' calls to this
 * function can therefore never interleave *within* the statement -- one
 * fully runs (evaluating `balance + excluded.balance` against whatever
 * row value is currently committed) before the other's `stmt.run` call
 * gets a turn, whichever order the JS event loop picks. The second caller
 * always sees the first caller's already-applied delta. This is the same
 * reasoning `withFundLock`'s doc comment relies on for why a single
 * statement (there, the ledger-row insert) can't be torn by a concurrent
 * caller -- the difference here is we don't even need serialization
 * (`withFundLock`), because there's no separate read step to race against
 * in the first place; the increment and the read of the pre-increment
 * value happen inside one sqlite statement.
 *
 * This intentionally writes with a raw `db.runQuery` call instead of
 * going through `db.update`/`sendMessages` (the normal CRDT-tracked write
 * path used by `setEnvelopeBalance` below), for two reasons:
 * 1. A CRDT message (see `apply()` in `server/sync/index.ts`) carries a
 *    literal, already-computed value for a column at a timestamp -- there
 *    is no way to express "add this delta to whatever the column
 *    currently is" as a message. Computing that value in JS before
 *    sending the message is exactly the read-then-write this function
 *    exists to avoid.
 * 2. It's safe to skip CRDT tracking for this column specifically:
 *    `envelope_balances` is a pure cache (see module doc on
 *    `recomputeEnvelopeBalances`), and correctness on every other device
 *    is already independently guaranteed by `sync-hooks.ts`'s
 *    `onApplySync`, which fully recomputes `envelope_balances` from
 *    `envelope_ledger` (the actual CRDT-synced source of truth) whenever
 *    new ledger rows arrive via sync -- it never trusts an incoming
 *    `envelope_balances` value. So a device that never received this
 *    exact write as a CRDT message still ends up correct, because it
 *    rebuilds the cache itself from the ledger rows it did receive.
 *
 * Uses `INSERT ... ON CONFLICT` (not a plain `UPDATE`) so this also
 * upserts a row for an envelope that has never had one, with the same
 * single-statement atomicity.
 */
export function incrementEnvelopeBalance(
  envelopeId: CategoryEntity['id'],
  delta: IntegerAmount,
  updatedAt: string = new Date().toISOString(),
): void {
  db.runQuery(
    `INSERT INTO envelope_balances (id, balance, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       balance = envelope_balances.balance + excluded.balance,
       updated_at = excluded.updated_at`,
    [envelopeId, delta, updatedAt],
  );
}

/**
 * Authoritatively set an envelope's cached balance to an exact value.
 * Callers are responsible for having computed `balance` correctly (this
 * does not read the ledger) -- used by `recomputeEnvelopeBalances` to
 * write its from-scratch rebuild (`SUM(envelope_ledger.amount)`).
 *
 * NOT used by `applyMovement` -- that reads and writes a *delta*, which
 * needs `incrementEnvelopeBalance`'s single-statement atomicity instead
 * (see its doc comment for why a set-to-absolute-value write like this
 * one is exactly the read-then-write pattern that caused the lost-update
 * race). Setting an absolute, freshly-recomputed value here doesn't have
 * that problem the same way: `recomputeEnvelopeBalances` always derives
 * `balance` from `SUM(envelope_ledger.amount)` at call time, so two
 * concurrent recomputes of the same envelope converge on the same
 * correct answer rather than clobbering each other with stale deltas.
 *
 * Must be called from within a `batchMessages` block.
 */
export async function setEnvelopeBalance(
  envelopeId: CategoryEntity['id'],
  balance: IntegerAmount,
  updatedAt: string = new Date().toISOString(),
  { rowExists }: { rowExists?: boolean } = {},
): Promise<void> {
  const exists =
    rowExists ??
    db.firstSync<Pick<db.DbEnvelopeBalance, 'id'>>(
      'SELECT id FROM envelope_balances WHERE id = ?',
      [envelopeId],
    ) != null;

  if (exists) {
    await db.update('envelope_balances', {
      id: envelopeId,
      balance,
      updated_at: updatedAt,
    });
  } else {
    await db.insertWithUUID('envelope_balances', {
      id: envelopeId,
      balance,
      updated_at: updatedAt,
    });
  }
}
