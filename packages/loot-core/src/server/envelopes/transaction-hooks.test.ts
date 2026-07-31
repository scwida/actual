import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as db from '#server/db';
import { batchUpdateTransactions } from '#server/transactions';
import type { TransactionEntity } from '#types/models';

import { getEnvelopeBalance } from './balances';
import { applyMovement } from './movement';
import {
  getTotalEnvelopeBalance,
  getTotalRealLedgerBalance,
} from './real-money';
import { getUnallocatedEnvelopeId } from './unallocated';

/**
 * Covers the hook that makes categorizing a transaction actually move real
 * envelope money (`reconcileEnvelopeMovements`, wired into
 * `batchUpdateTransactions`). Before this hook existed, assigning a
 * category to a transaction only ever wrote the `category` column -- it
 * never touched `envelope_ledger`/`envelope_balances`.
 */
describe('reconcileEnvelopeMovements (via batchUpdateTransactions)', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  async function setup() {
    await db.insertCategoryGroup({
      id: 'group1',
      name: 'Group 1',
      is_income: 0,
    });
    await db.insertCategory({
      id: 'envA',
      name: 'Envelope A',
      cat_group: 'group1',
      is_income: 0,
    });
    await db.insertCategory({
      id: 'envB',
      name: 'Envelope B',
      cat_group: 'group1',
      is_income: 0,
    });
    await db.insertAccount({ id: 'acct1', name: 'Checking', offbudget: 0 });
  }

  /** Real deposit + fund, so envA/envB start with real, invariant-backed money. */
  async function fund(envelope: string, amount: number, date = '2026-01-01') {
    const txnId = await db.insertTransaction({
      account: 'acct1',
      amount,
      date,
    });
    await applyMovement({
      type: 'fund',
      envelope,
      amount,
      transactionId: txnId,
      date,
    });
  }

  function assertInvariant() {
    expect(getTotalEnvelopeBalance()).toBeLessThanOrEqual(
      getTotalRealLedgerBalance(),
    );
  }

  async function activeLedgerRowsForTransaction(transactionId: string) {
    return db.all<db.DbEnvelopeLedger>(
      'SELECT * FROM envelope_ledger WHERE transaction_id = ? ORDER BY created_at',
      [transactionId],
    );
  }

  it('debits the envelope when a categorized outflow transaction is added', async () => {
    await setup();
    await fund('envA', 10000);

    const { added } = await batchUpdateTransactions({
      added: [
        {
          account: 'acct1',
          category: 'envA',
          amount: -3000,
          date: '2026-01-02',
        } as TransactionEntity,
      ],
    });

    expect(getEnvelopeBalance('envA')).toBe(7000);
    assertInvariant();

    const txnId = added[0].id;
    const rows = await activeLedgerRowsForTransaction(txnId);
    expect(rows).toHaveLength(1);
    expect(rows[0].movement_type).toBe('spend');
    expect(rows[0].amount).toBe(-3000);
  });

  it('applies no movement for an uncategorized transaction that is not a real outflow (zero amount)', async () => {
    await setup();
    await fund('envA', 10000);

    await batchUpdateTransactions({
      added: [
        {
          account: 'acct1',
          amount: 0,
          date: '2026-01-02',
        } as TransactionEntity,
      ],
    });

    expect(getEnvelopeBalance('envA')).toBe(10000);
    assertInvariant();
    const rows = await db.all<db.DbEnvelopeLedger>(
      'SELECT * FROM envelope_ledger',
    );
    // Only the original `fund` row from `fund()` above -- nothing added.
    // A zero-amount row is genuinely inert: it doesn't count against the
    // real ledger ceiling (see `currentOutflowAmount`), so there's nothing
    // for any envelope to owe.
    expect(rows).toHaveLength(1);
  });

  it('debits the reserved Unallocated envelope for a brand-new, never-categorized real outflow transaction, rather than doing nothing', async () => {
    await setup();
    await fund('envA', 10000);
    assertInvariant();
    // Fully allocated: envelope total == ledger total. This is the exact
    // QA-reported regression scenario -- if this hook's no-claim/no-category
    // branch stayed a no-op for a real negative-amount outflow, the real
    // ledger total would drop by 3000 here with nothing debited anywhere,
    // silently breaking the ceiling invariant (10000 > 7000).
    expect(getTotalEnvelopeBalance()).toBe(getTotalRealLedgerBalance());

    const { added } = await batchUpdateTransactions({
      added: [
        {
          account: 'acct1',
          amount: -3000,
          date: '2026-01-02',
        } as TransactionEntity,
      ],
    });

    // The invariant holds throughout -- not just "doesn't throw".
    assertInvariant();
    // envA is untouched (this transaction was never claimed against it);
    // the reserved Unallocated envelope absorbed the debit instead.
    expect(getEnvelopeBalance('envA')).toBe(10000);
    expect(getEnvelopeBalance(getUnallocatedEnvelopeId())).toBe(-3000);
    expect(getTotalEnvelopeBalance()).toBe(getTotalRealLedgerBalance());

    const txnId = added[0].id;
    const rows = await activeLedgerRowsForTransaction(txnId);
    expect(rows).toHaveLength(1);
    expect(rows[0].movement_type).toBe('spend');
    expect(rows[0].amount).toBe(-3000);
    expect(rows[0].envelope_id).toBe(getUnallocatedEnvelopeId());
  });

  it('categorizing a previously never-categorized (Unallocated-debited) transaction releases the Unallocated claim and debits the chosen envelope instead', async () => {
    await setup();
    await fund('envA', 10000);

    const { added } = await batchUpdateTransactions({
      added: [
        {
          account: 'acct1',
          amount: -3000,
          date: '2026-01-02',
        } as TransactionEntity,
      ],
    });
    const txnId = added[0].id;

    // Debited straight against Unallocated on arrival (no category yet).
    expect(getEnvelopeBalance(getUnallocatedEnvelopeId())).toBe(-3000);
    assertInvariant();

    // Now the user categorizes it to envA. This composes with the existing
    // recategorize path (new spend on envA first, then release the old
    // Unallocated claim) with no special-casing for Unallocated as the
    // "old" envelope.
    await batchUpdateTransactions({
      updated: [{ id: txnId, category: 'envA' }],
    });

    expect(getEnvelopeBalance('envA')).toBe(10000 - 3000);
    expect(getEnvelopeBalance(getUnallocatedEnvelopeId())).toBe(0);
    assertInvariant();
    expect(getTotalEnvelopeBalance()).toBe(getTotalRealLedgerBalance());

    const rows = await activeLedgerRowsForTransaction(txnId);
    expect(rows).toHaveLength(2);
    expect(rows[0].movement_type).toBe('spend');
    expect(rows[0].envelope_id).toBe(getUnallocatedEnvelopeId());
    expect(rows[1].movement_type).toBe('spend');
    expect(rows[1].envelope_id).toBe('envA');
  });

  it('applies no movement for an inflow (deposit) transaction even if categorized', async () => {
    await setup();
    await fund('envA', 10000);

    await batchUpdateTransactions({
      added: [
        {
          account: 'acct1',
          category: 'envA',
          amount: 500,
          date: '2026-01-02',
        } as TransactionEntity,
      ],
    });

    // Funding-side movements (deposits) are out of scope for this hook --
    // only real outflows debit an envelope here.
    expect(getEnvelopeBalance('envA')).toBe(10000);
  });

  it('recategorizing moves the debit from the old envelope to the new one', async () => {
    await setup();
    await fund('envA', 10000);
    await fund('envB', 10000);

    const { added } = await batchUpdateTransactions({
      added: [
        {
          account: 'acct1',
          category: 'envA',
          amount: -4000,
          date: '2026-01-02',
        } as TransactionEntity,
      ],
    });
    const txnId = added[0].id;
    expect(getEnvelopeBalance('envA')).toBe(6000);

    await batchUpdateTransactions({
      updated: [{ id: txnId, category: 'envB' }],
    });

    expect(getEnvelopeBalance('envA')).toBe(10000);
    expect(getEnvelopeBalance('envB')).toBe(6000);
    assertInvariant();
  });

  it('recategorizing still works even when the whole budget is exactly fully funded (regression test for the reverse-then-reapply ordering bug)', async () => {
    await setup();
    // Fund envA with EXACTLY the total real ledger money available -- the
    // ordinary, intended end state of zero-based budgeting (nothing left
    // unallocated). A naive "release old claim (fund) THEN apply new
    // claim (spend)" implementation would transiently push envelope
    // total above this exact ceiling and throw here.
    await fund('envA', 10000);

    const { added } = await batchUpdateTransactions({
      added: [
        {
          account: 'acct1',
          category: 'envA',
          amount: -4000,
          date: '2026-01-02',
        } as TransactionEntity,
      ],
    });
    const txnId = added[0].id;

    // Still fully funded (envA now at 6000, total ledger now at 6000 too,
    // since the $4000 already left the real ledger for this purchase).
    assertInvariant();
    expect(getEnvelopeBalance('envA')).toBe(6000);
    expect(getTotalEnvelopeBalance()).toBe(getTotalRealLedgerBalance());

    // Recategorizing to a brand-new, never-funded envelope B must not
    // throw, even though the budget has zero headroom anywhere.
    await expect(
      batchUpdateTransactions({
        updated: [{ id: txnId, category: 'envB' }],
      }),
    ).resolves.not.toThrow();

    expect(getEnvelopeBalance('envA')).toBe(10000);
    expect(getEnvelopeBalance('envB')).toBe(-4000);
    assertInvariant();
  });

  it('deleting a transaction fully reverses its envelope debit', async () => {
    await setup();
    await fund('envA', 10000);

    const { added } = await batchUpdateTransactions({
      added: [
        {
          account: 'acct1',
          category: 'envA',
          amount: -3000,
          date: '2026-01-02',
        } as TransactionEntity,
      ],
    });
    const txnId = added[0].id;
    expect(getEnvelopeBalance('envA')).toBe(7000);

    await batchUpdateTransactions({ deleted: [{ id: txnId }] });

    expect(getEnvelopeBalance('envA')).toBe(10000);
    assertInvariant();
  });

  it('reducing a transaction amount partially releases the envelope claim', async () => {
    await setup();
    await fund('envA', 10000);

    const { added } = await batchUpdateTransactions({
      added: [
        {
          account: 'acct1',
          category: 'envA',
          amount: -5000,
          date: '2026-01-02',
        } as TransactionEntity,
      ],
    });
    const txnId = added[0].id;
    expect(getEnvelopeBalance('envA')).toBe(5000);

    await batchUpdateTransactions({
      updated: [{ id: txnId, amount: -2000 }],
    });

    expect(getEnvelopeBalance('envA')).toBe(8000);
    assertInvariant();
  });

  it('clearing a transaction category (bare uncategorize) moves the claim into Unallocated via a transfer, rather than leaving it in place or bare-releasing it', async () => {
    await setup();
    await fund('envA', 10000);

    const { added } = await batchUpdateTransactions({
      added: [
        {
          account: 'acct1',
          category: 'envA',
          amount: -3000,
          date: '2026-01-02',
        } as TransactionEntity,
      ],
    });
    const txnId = added[0].id;
    expect(getEnvelopeBalance('envA')).toBe(7000);

    await batchUpdateTransactions({
      updated: [
        {
          id: txnId,
          // `TransactionEntity['category']` is typed as `string | undefined`
          // even though the underlying DB column is genuinely nullable and
          // clearing a category is a real, supported operation (see
          // `transfer.ts`'s own `category: null` writes) -- narrowly cast
          // just this field rather than the whole object.
          category: null as unknown as TransactionEntity['category'],
        },
      ],
    });

    // envA's claim is reversed (moves out of envA) and lands in the
    // reserved Unallocated envelope instead of being left in place or
    // bare-released with no destination -- a transfer, so the $3000 never
    // vanishes from the envelope side and never manufactures new credit.
    expect(getEnvelopeBalance('envA')).toBe(7000 - 3000);
    expect(getEnvelopeBalance(getUnallocatedEnvelopeId())).toBe(3000);
    // Net-zero at the total-envelope-balance level -- confirms the
    // transfer framing is genuinely safe (this is exactly what makes it
    // immune to the real-money ceiling check, unlike a bare release).
    expect(getTotalEnvelopeBalance()).toBe(10000 - 3000);
    assertInvariant();

    const rows = await activeLedgerRowsForTransaction(txnId);
    const transferRows = rows.filter(row => row.movement_type === 'transfer');
    expect(transferRows).toHaveLength(2);
    expect(transferRows.map(row => row.amount).sort((a, b) => a - b)).toEqual([
      -3000, 3000,
    ]);
  });

  it('a bare uncategorize does not throw even when the whole budget is exactly fully funded (the exact scenario a bare release-with-no-destination would have violated)', async () => {
    await setup();
    // Fund envA with EXACTLY the total real ledger money available -- the
    // ordinary, intended end state of zero-based budgeting. A bare release
    // (fund envA back up with no destination) would push total envelope
    // balance above this exact ceiling; a transfer never can, since
    // `movement.ts`'s `validateRequest` never ceiling-checks `transfer`
    // requests (only `type: 'fund'` goes through
    // `assertFundBackedByRealMoney`).
    await fund('envA', 10000);

    const { added } = await batchUpdateTransactions({
      added: [
        {
          account: 'acct1',
          category: 'envA',
          amount: -4000,
          date: '2026-01-02',
        } as TransactionEntity,
      ],
    });
    const txnId = added[0].id;
    assertInvariant();
    expect(getTotalEnvelopeBalance()).toBe(getTotalRealLedgerBalance());

    await expect(
      batchUpdateTransactions({
        updated: [
          {
            id: txnId,
            category: null as unknown as TransactionEntity['category'],
          },
        ],
      }),
    ).resolves.not.toThrow();

    expect(getEnvelopeBalance('envA')).toBe(10000 - 4000 - 4000);
    expect(getEnvelopeBalance(getUnallocatedEnvelopeId())).toBe(4000);
    assertInvariant();
    expect(getTotalEnvelopeBalance()).toBe(getTotalRealLedgerBalance());
  });

  it('recategorizing a transaction away from a claim that was previously auto-transferred to Unallocated does not throw and preserves the ceiling invariant', async () => {
    await setup();
    await fund('envA', 10000);

    const { added } = await batchUpdateTransactions({
      added: [
        {
          account: 'acct1',
          category: 'envA',
          amount: -3000,
          date: '2026-01-02',
        } as TransactionEntity,
      ],
    });
    const txnId = added[0].id;

    // Uncategorize -- the claim auto-transfers from envA into Unallocated.
    await batchUpdateTransactions({
      updated: [
        {
          id: txnId,
          category: null as unknown as TransactionEntity['category'],
        },
      ],
    });
    expect(getEnvelopeBalance(getUnallocatedEnvelopeId())).toBe(3000);
    assertInvariant();

    // Recategorize to a brand-new envelope. Must not throw and must not
    // double-count the claim that is currently parked in Unallocated.
    await expect(
      batchUpdateTransactions({
        updated: [{ id: txnId, category: 'envB' }],
      }),
    ).resolves.not.toThrow();

    expect(getEnvelopeBalance('envB')).toBe(-3000);
    // Unallocated ends at 6000 (its 3000 from the uncategorize-transfer,
    // PLUS the 3000 release from envB's recategorize), not 0 -- this
    // engine treats each envelope-to-envelope move as its own permanent,
    // real event (CLAUDE.md "historical lock-in") rather than collapsing
    // the history to "as if it had been envB all along". The invariant
    // check below is what actually proves this isn't a double-claim (the
    // total across every envelope, including Unallocated's 6000, still
    // never exceeds real ledger money).
    expect(getEnvelopeBalance(getUnallocatedEnvelopeId())).toBe(6000);
    expect(getEnvelopeBalance('envA')).toBe(4000);
    assertInvariant();
    expect(getTotalEnvelopeBalance()).toBe(getTotalRealLedgerBalance());
  });

  it('is idempotent: replaying an unchanged update writes no additional ledger rows and does not change the balance', async () => {
    await setup();
    await fund('envA', 10000);

    const { added } = await batchUpdateTransactions({
      added: [
        {
          account: 'acct1',
          category: 'envA',
          amount: -3000,
          date: '2026-01-02',
        } as TransactionEntity,
      ],
    });
    const txnId = added[0].id;

    const rowsBefore = await activeLedgerRowsForTransaction(txnId);

    // An edit that doesn't touch category/amount/aliveness (e.g. just the
    // notes field) should not re-trigger a movement at all.
    await batchUpdateTransactions({
      updated: [{ id: txnId, notes: 'grabbed coffee' }],
    });

    const rowsAfter = await activeLedgerRowsForTransaction(txnId);
    expect(rowsAfter).toHaveLength(rowsBefore.length);
    expect(getEnvelopeBalance('envA')).toBe(7000);
  });

  describe('split transactions', () => {
    it('gives each child its own movement and applies nothing to the parent', async () => {
      await setup();
      await fund('envA', 10000);
      await fund('envB', 10000);

      await batchUpdateTransactions({
        added: [
          {
            id: 'parent1',
            account: 'acct1',
            amount: -10000,
            date: '2026-01-02',
            is_parent: true,
          } as TransactionEntity,
          {
            id: 'child1',
            account: 'acct1',
            amount: -6000,
            date: '2026-01-02',
            is_child: true,
            parent_id: 'parent1',
            category: 'envA',
          } as TransactionEntity,
          {
            id: 'child2',
            account: 'acct1',
            amount: -4000,
            date: '2026-01-02',
            is_child: true,
            parent_id: 'parent1',
            category: 'envB',
          } as TransactionEntity,
        ],
      });

      expect(getEnvelopeBalance('envA')).toBe(4000);
      expect(getEnvelopeBalance('envB')).toBe(6000);
      assertInvariant();

      const parentRows = await activeLedgerRowsForTransaction('parent1');
      expect(parentRows).toHaveLength(0);
    });

    it('retroactively splitting an already-categorized transaction distributes its existing claim to the new children instead of double-counting, even when the budget is fully funded', async () => {
      await setup();
      // Fund envA with exactly the total real ledger money available to
      // it -- the fully-allocated state where a naive implementation
      // would either throw or silently double-count.
      await fund('envA', 10000);
      await fund('envB', 10000);

      const { added } = await batchUpdateTransactions({
        added: [
          {
            account: 'acct1',
            category: 'envA',
            amount: -10000,
            date: '2026-01-02',
          } as TransactionEntity,
        ],
      });
      const txnId = added[0].id;
      expect(getEnvelopeBalance('envA')).toBe(0);
      assertInvariant();

      // Split the existing transaction: it becomes the parent, and gains
      // two new child rows (mirroring `splitTransaction` in
      // `shared/transactions.ts`, which flips `is_parent` on the existing
      // row and adds new child rows).
      await batchUpdateTransactions({
        updated: [
          {
            id: txnId,
            is_parent: true,
            // See the narrow-cast comment above -- `category` is genuinely
            // nullable in the DB even though the model type doesn't say so.
            category: null as unknown as TransactionEntity['category'],
          },
        ],
        added: [
          {
            id: 'splitChild1',
            account: 'acct1',
            amount: -6000,
            date: '2026-01-02',
            is_child: true,
            parent_id: txnId,
            category: 'envA',
          } as TransactionEntity,
          {
            id: 'splitChild2',
            account: 'acct1',
            amount: -4000,
            date: '2026-01-02',
            is_child: true,
            parent_id: txnId,
            category: 'envB',
          } as TransactionEntity,
        ],
      });

      // envA ends at 4000 (its 10000 fully released, then re-debited only
      // by its own child's 6000 share) and envB ends at 6000 (its own
      // child's 4000 share debited from its already-funded 10000) -- NOT
      // envA=10000/envB=6000 (parent's claim released but never
      // re-claimed by child1) NOR envA=-6000 (double-counted: the
      // original 10000 claim never released, on top of child1's own
      // fresh 6000 spend).
      expect(getEnvelopeBalance('envA')).toBe(4000);
      expect(getEnvelopeBalance('envB')).toBe(6000);
      assertInvariant();

      const parentRows = await activeLedgerRowsForTransaction(txnId);
      // The original claim was reversed/redistributed -- no lingering
      // unreversed row directly on the parent id. The compensating
      // release row lives elsewhere in the table (it isn't tied to the
      // parent's own `transaction_id`, since it's tagged untraceable-to-a-
      // deposit on purpose -- see `releaseClaim`'s docblock), so check
      // the whole table for anything referencing each parent row via
      // `reverses_id`, not just other rows sharing its `transaction_id`.
      const allRows = await db.all<db.DbEnvelopeLedger>(
        'SELECT * FROM envelope_ledger',
      );
      const unreversedParentRows = parentRows.filter(
        row =>
          !allRows.some(other => other.reverses_id === row.id) &&
          (row.movement_type === 'spend' ||
            (row.movement_type === 'transfer' && row.amount > 0)),
      );
      expect(unreversedParentRows).toHaveLength(0);
    });
  });

  /**
   * Returns the ledger rows for `transactionId` that `getCurrentClaim`
   * would consider a live "current claim" candidate (unreversed `spend`,
   * or the positive leg of a `transfer`) -- i.e. every row matching its
   * `WHERE` clause, not just the single one its `LIMIT 1` would return.
   * Used to assert there is never more than one, since a second candidate
   * would be silently ignored by `getCurrentClaim`'s `ORDER BY created_at
   * DESC LIMIT 1` and corrupt the next reconciliation of that transaction.
   */
  async function currentClaimCandidates(transactionId: string) {
    const allRows = await db.all<db.DbEnvelopeLedger>(
      'SELECT * FROM envelope_ledger',
    );
    const rows = allRows.filter(row => row.transaction_id === transactionId);
    return rows.filter(
      row =>
        !allRows.some(other => other.reverses_id === row.id) &&
        (row.movement_type === 'spend' ||
          (row.movement_type === 'transfer' && row.amount > 0)),
    );
  }

  it('an existing-uncategorized transaction whose amount is edited UPWARD (claim already on Unallocated) captures the full new outflow instead of leaving it stale (QA Scenario A)', async () => {
    await setup();
    await fund('envA', 10000);

    const { added } = await batchUpdateTransactions({
      added: [
        {
          account: 'acct1',
          amount: -3000,
          date: '2026-01-02',
        } as TransactionEntity,
      ],
    });
    const txnId = added[0].id;

    // Debited straight against Unallocated on arrival (never categorized).
    expect(getEnvelopeBalance(getUnallocatedEnvelopeId())).toBe(-3000);
    assertInvariant();

    // Amount edited upward, category still never set.
    await batchUpdateTransactions({
      updated: [{ id: txnId, amount: -5000 }],
    });

    // Unallocated must reflect the FULL new outflow, not stay stale at the
    // old claim size -- this is the exact bug this test guards against.
    expect(getEnvelopeBalance(getUnallocatedEnvelopeId())).toBe(-5000);
    expect(getEnvelopeBalance('envA')).toBe(10000);
    assertInvariant();
    expect(getTotalEnvelopeBalance()).toBe(getTotalRealLedgerBalance());

    // Exactly one live claim candidate remains for this transaction --
    // the excess must not have been captured as a second, independent
    // unreversed row.
    const candidates = await currentClaimCandidates(txnId);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].envelope_id).toBe(getUnallocatedEnvelopeId());
    expect(Math.abs(candidates[0].amount)).toBe(5000);
  });

  it('a single update that both clears the category AND increases the amount correctly splits the new total between the released envelope and a fresh Unallocated debit (QA Scenario B)', async () => {
    await setup();
    await fund('envA', 10000);

    const { added } = await batchUpdateTransactions({
      added: [
        {
          account: 'acct1',
          category: 'envA',
          amount: -3000,
          date: '2026-01-02',
        } as TransactionEntity,
      ],
    });
    const txnId = added[0].id;
    expect(getEnvelopeBalance('envA')).toBe(7000);

    // One update: clear the category AND bump the amount, simultaneously.
    await batchUpdateTransactions({
      updated: [
        {
          id: txnId,
          category: null as unknown as TransactionEntity['category'],
          amount: -5000,
        },
      ],
    });

    // envA is fully released (it's no longer responsible for this
    // transaction at all) and Unallocated picks up the ENTIRE new $5000
    // outflow -- not just the original $3000 claim, leaving $2000
    // unaccounted for.
    expect(getEnvelopeBalance('envA')).toBe(10000);
    expect(getEnvelopeBalance(getUnallocatedEnvelopeId())).toBe(-5000);
    assertInvariant();
    expect(getTotalEnvelopeBalance()).toBe(getTotalRealLedgerBalance());

    const candidates = await currentClaimCandidates(txnId);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].envelope_id).toBe(getUnallocatedEnvelopeId());
    expect(Math.abs(candidates[0].amount)).toBe(5000);
  });

  it('an existing-uncategorized transaction whose amount is edited DOWNWARD (claim already on Unallocated) shrinks the claim in place instead of losing track of it', async () => {
    await setup();
    await fund('envA', 10000);

    const { added } = await batchUpdateTransactions({
      added: [
        {
          account: 'acct1',
          amount: -5000,
          date: '2026-01-02',
        } as TransactionEntity,
      ],
    });
    const txnId = added[0].id;
    expect(getEnvelopeBalance(getUnallocatedEnvelopeId())).toBe(-5000);

    await batchUpdateTransactions({
      updated: [{ id: txnId, amount: -3000 }],
    });

    expect(getEnvelopeBalance(getUnallocatedEnvelopeId())).toBe(-3000);
    expect(getEnvelopeBalance('envA')).toBe(10000);
    assertInvariant();
    expect(getTotalEnvelopeBalance()).toBe(getTotalRealLedgerBalance());

    // Before this fix, `transferClaimToUnallocated`'s self-transfer guard
    // combined with the partial release left NO live claim row at all
    // here -- verify exactly one remains.
    const candidates = await currentClaimCandidates(txnId);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].envelope_id).toBe(getUnallocatedEnvelopeId());
    expect(Math.abs(candidates[0].amount)).toBe(3000);

    // Prove the previously-latent bug is actually fixed, not just
    // coincidentally correct this one time: touch the same transaction
    // again with no real change. If the claim had been lost, this would
    // wrongly issue a second, duplicate debit against Unallocated.
    await batchUpdateTransactions({
      updated: [{ id: txnId, notes: 'no-op touch' }],
    });
    expect(getEnvelopeBalance(getUnallocatedEnvelopeId())).toBe(-3000);
    assertInvariant();
    expect(getTotalEnvelopeBalance()).toBe(getTotalRealLedgerBalance());
    expect(await currentClaimCandidates(txnId)).toHaveLength(1);
  });

  it('a single update that both clears the category AND decreases the amount was already correct (claim lives on a real envelope, not Unallocated)', async () => {
    await setup();
    await fund('envA', 10000);

    const { added } = await batchUpdateTransactions({
      added: [
        {
          account: 'acct1',
          category: 'envA',
          amount: -5000,
          date: '2026-01-02',
        } as TransactionEntity,
      ],
    });
    const txnId = added[0].id;
    expect(getEnvelopeBalance('envA')).toBe(5000);

    await batchUpdateTransactions({
      updated: [
        {
          id: txnId,
          category: null as unknown as TransactionEntity['category'],
          amount: -3000,
        },
      ],
    });

    // envA gives back the $2000 that's now provably freed (5000 -> 7000),
    // then the remaining $3000 still-real outflow transfers out to
    // Unallocated (7000 -> 4000; this engine's "historical lock-in"
    // transfer convention -- see the existing "clearing a transaction
    // category (bare uncategorize)" test above for the same envA-goes-
    // more-negative-than-you'd-naively-expect pattern) -- this is the
    // pre-existing, already-correct code path (untouched by this fix),
    // confirmed here as a regression guard.
    expect(getEnvelopeBalance('envA')).toBe(4000);
    expect(getEnvelopeBalance(getUnallocatedEnvelopeId())).toBe(3000);
    assertInvariant();
    expect(getTotalEnvelopeBalance()).toBe(getTotalRealLedgerBalance());

    const candidates = await currentClaimCandidates(txnId);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].envelope_id).toBe(getUnallocatedEnvelopeId());
    expect(Math.abs(candidates[0].amount)).toBe(3000);
  });

  it('stress sequence: add / recategorize / uncategorize / amount-edit-up / amount-edit-down / recategorize / add+delete another -- the invariant and single-claim-row property hold after every single step', async () => {
    await setup();
    await fund('envA', 20000);
    await fund('envB', 15000);

    // 1. Add, categorized to envA.
    const { added } = await batchUpdateTransactions({
      added: [
        {
          account: 'acct1',
          category: 'envA',
          amount: -5000,
          date: '2026-01-02',
        } as TransactionEntity,
      ],
    });
    const txnId = added[0].id;
    assertInvariant();
    expect(await currentClaimCandidates(txnId)).toHaveLength(1);

    // 2. Recategorize to envB.
    await batchUpdateTransactions({
      updated: [{ id: txnId, category: 'envB' }],
    });
    assertInvariant();
    expect(await currentClaimCandidates(txnId)).toHaveLength(1);

    // 3. Uncategorize -- claim moves to Unallocated via transfer.
    await batchUpdateTransactions({
      updated: [
        {
          id: txnId,
          category: null as unknown as TransactionEntity['category'],
        },
      ],
    });
    assertInvariant();
    expect(await currentClaimCandidates(txnId)).toHaveLength(1);

    // 4. Amount edited UP while still uncategorized (the exact QA
    // scenario, now on the transfer-derived Unallocated claim).
    await batchUpdateTransactions({
      updated: [{ id: txnId, amount: -8000 }],
    });
    assertInvariant();
    expect(await currentClaimCandidates(txnId)).toHaveLength(1);
    // Unallocated was at 5000 (envB's transferred-out claim from step 3);
    // this step's net effect on it is `active.amount - currentOutflow`
    // (5000 - 8000 = -3000), landing it at 2000.
    expect(getEnvelopeBalance(getUnallocatedEnvelopeId())).toBe(2000);

    // 5. Amount edited DOWN while still uncategorized.
    await batchUpdateTransactions({
      updated: [{ id: txnId, amount: -6000 }],
    });
    assertInvariant();
    expect(await currentClaimCandidates(txnId)).toHaveLength(1);
    // Net effect on Unallocated this step: 8000 - 6000 = +2000, from 2000
    // to 4000.
    expect(getEnvelopeBalance(getUnallocatedEnvelopeId())).toBe(4000);

    // 6. Recategorize back to envA.
    await batchUpdateTransactions({
      updated: [{ id: txnId, category: 'envA' }],
    });
    assertInvariant();
    expect(await currentClaimCandidates(txnId)).toHaveLength(1);
    // The old Unallocated claim (6000) is released ON TOP of Unallocated's
    // existing 4000 (this engine's "historical lock-in" -- see the
    // existing "recategorizing a transaction away from a claim that was
    // previously auto-transferred to Unallocated" test above for the same
    // pattern), landing Unallocated at 10000; envA absorbs the fresh 6000
    // spend.
    expect(getEnvelopeBalance(getUnallocatedEnvelopeId())).toBe(10000);
    expect(getEnvelopeBalance('envA')).toBe(20000 - 6000);
    expect(getEnvelopeBalance('envB')).toBe(5000);

    // 7. A second, independent transaction: add then delete.
    const { added: added2 } = await batchUpdateTransactions({
      added: [
        {
          account: 'acct1',
          category: 'envB',
          amount: -4000,
          date: '2026-01-03',
        } as TransactionEntity,
      ],
    });
    assertInvariant();
    const txn2Id = added2[0].id;

    await batchUpdateTransactions({ deleted: [{ id: txn2Id }] });
    assertInvariant();
    expect(getEnvelopeBalance('envB')).toBe(5000);

    // Final sanity: total envelope balance exactly matches total real
    // ledger money (fully allocated, nothing lost or double-counted
    // across the whole sequence).
    expect(getTotalEnvelopeBalance()).toBe(getTotalRealLedgerBalance());
  });

  it('scripted sequence: add, recategorize, partially reduce, then delete -- the real-money ceiling invariant holds throughout', async () => {
    await setup();
    await fund('envA', 20000);
    await fund('envB', 5000);

    const { added } = await batchUpdateTransactions({
      added: [
        {
          account: 'acct1',
          category: 'envA',
          amount: -8000,
          date: '2026-01-02',
        } as TransactionEntity,
      ],
    });
    const txnId = added[0].id;
    assertInvariant();

    await batchUpdateTransactions({
      updated: [{ id: txnId, category: 'envB' }],
    });
    assertInvariant();
    expect(getEnvelopeBalance('envA')).toBe(20000);
    expect(getEnvelopeBalance('envB')).toBe(-3000);

    await batchUpdateTransactions({
      updated: [{ id: txnId, amount: -2000 }],
    });
    assertInvariant();
    expect(getEnvelopeBalance('envB')).toBe(3000);

    await batchUpdateTransactions({ deleted: [{ id: txnId }] });
    assertInvariant();
    expect(getEnvelopeBalance('envB')).toBe(5000);
    expect(getEnvelopeBalance('envA')).toBe(20000);
  });
});
