import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as db from '#server/db';

import { getEnvelopeBalance } from './balances';
import {
  applyMovement,
  checkNegativeBalance,
  previewMovement,
} from './movement';

describe('applyMovement', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  async function setupEnvelopes() {
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

  // Every `fund` movement must be backed by a REAL deposit -- inserting a
  // real row into the raw `transactions` table (not just a JS variable)
  // is what makes these tests an actual check against real ledger money,
  // rather than a tautology about the envelope engine's own bookkeeping.
  async function insertRealDeposit({
    account = 'acct1',
    amount,
    date = '2026-01-01',
  }: {
    account?: string;
    amount: number;
    date?: string;
  }): Promise<string> {
    return db.insertTransaction({ account, amount, date });
  }

  it('funds an envelope from a real transaction, writing one ledger row', async () => {
    await setupEnvelopes();
    const txnId = await insertRealDeposit({ amount: 10000 });

    const result = await applyMovement({
      type: 'fund',
      envelope: 'envA',
      amount: 10000,
      counterparty: { account: 'acct1' },
      transactionId: txnId,
      date: '2026-01-01',
    });

    expect(result.ledgerRowIds).toHaveLength(1);
    expect(result.balances.envA).toBe(10000);
    expect(result.warnings).toHaveLength(0);
    expect(getEnvelopeBalance('envA')).toBe(10000);

    const row = await db.first<db.DbEnvelopeLedger>(
      'SELECT * FROM envelope_ledger WHERE id = ?',
      [result.ledgerRowIds[0]],
    );
    expect(row?.movement_type).toBe('fund');
    expect(row?.amount).toBe(10000);
    expect(row?.counterparty_kind).toBe('account');
    expect(row?.counterparty_id).toBe('acct1');
    expect(row?.transaction_id).toBe(txnId);
  });

  it('funds an envelope from only a real account anchor (manual/cash deposit with no specific transaction picked), as long as the global real-money ceiling holds', async () => {
    await setupEnvelopes();
    await insertRealDeposit({ amount: 10000 });

    const result = await applyMovement({
      type: 'fund',
      envelope: 'envA',
      amount: 10000,
      counterparty: { account: 'acct1' },
      date: '2026-01-02',
    });

    expect(result.balances.envA).toBe(10000);
    expect(getEnvelopeBalance('envA')).toBe(10000);
  });

  it('spends from an envelope, writing one negative ledger row', async () => {
    await setupEnvelopes();
    const txnId = await insertRealDeposit({ amount: 10000 });
    await applyMovement({
      type: 'fund',
      envelope: 'envA',
      amount: 10000,
      transactionId: txnId,
      date: '2026-01-01',
    });

    const result = await applyMovement({
      type: 'spend',
      envelope: 'envA',
      amount: 4000,
      counterparty: { account: 'acct1' },
      date: '2026-01-02',
    });

    expect(result.balances.envA).toBe(6000);
    expect(getEnvelopeBalance('envA')).toBe(6000);
  });

  it('transfers between two envelopes, writing two rows sharing a transfer_id', async () => {
    await setupEnvelopes();
    const txnId = await insertRealDeposit({ amount: 10000 });
    await applyMovement({
      type: 'fund',
      envelope: 'envA',
      amount: 10000,
      transactionId: txnId,
      date: '2026-01-01',
    });

    const result = await applyMovement({
      type: 'transfer',
      from: 'envA',
      to: 'envB',
      amount: 3000,
      date: '2026-01-02',
    });

    expect(result.ledgerRowIds).toHaveLength(2);
    expect(result.balances.envA).toBe(7000);
    expect(result.balances.envB).toBe(3000);
    expect(getEnvelopeBalance('envA')).toBe(7000);
    expect(getEnvelopeBalance('envB')).toBe(3000);

    const rows = await db.all<db.DbEnvelopeLedger>(
      'SELECT * FROM envelope_ledger WHERE id IN (?, ?)',
      result.ledgerRowIds,
    );
    expect(rows[0].transfer_id).toBeTruthy();
    expect(rows[0].transfer_id).toBe(rows[1].transfer_id);
    expect(rows.map(r => r.amount).sort((a, b) => a - b)).toEqual([
      -3000, 3000,
    ]);
  });

  it('never hard-blocks a movement that would take an envelope negative, but returns a warning', async () => {
    await setupEnvelopes();
    const txnId = await insertRealDeposit({ amount: 1000 });
    await applyMovement({
      type: 'fund',
      envelope: 'envA',
      amount: 1000,
      transactionId: txnId,
      date: '2026-01-01',
    });

    const result = await applyMovement({
      type: 'spend',
      envelope: 'envA',
      amount: 5000,
      date: '2026-01-02',
    });

    // Never rejects -- the movement still happens.
    expect(result.balances.envA).toBe(-4000);
    expect(getEnvelopeBalance('envA')).toBe(-4000);

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      type: 'negative-balance',
      envelope: 'envA',
      resultingBalance: -4000,
    });
  });

  it('suggests covering a negative balance from Unallocated when it has funds', async () => {
    await setupEnvelopes();
    const txnId = await insertRealDeposit({ amount: 2000 });
    await applyMovement({
      type: 'fund',
      envelope: 'reserved-unallocated',
      amount: 2000,
      transactionId: txnId,
      date: '2026-01-01',
    });

    const result = await applyMovement({
      type: 'spend',
      envelope: 'envA',
      amount: 500,
      date: '2026-01-02',
    });

    expect(result.warnings[0].suggestedCover).toEqual({
      source: { envelope: 'reserved-unallocated' },
      amount: 500,
    });
  });

  it('rejects real errors: non-positive amounts and missing envelopes', async () => {
    await setupEnvelopes();

    await expect(
      applyMovement({
        type: 'fund',
        envelope: 'envA',
        amount: 0,
        date: '2026-01-01',
      }),
    ).rejects.toThrow();

    await expect(
      applyMovement({
        type: 'fund',
        envelope: 'does-not-exist',
        amount: 100,
        date: '2026-01-01',
      }),
    ).rejects.toThrow();
  });

  it('previewMovement computes the same result as applyMovement without writing anything', async () => {
    await setupEnvelopes();
    const txnId = await insertRealDeposit({ amount: 1000 });
    await applyMovement({
      type: 'fund',
      envelope: 'envA',
      amount: 1000,
      transactionId: txnId,
      date: '2026-01-01',
    });

    const preview = await previewMovement({
      type: 'spend',
      envelope: 'envA',
      amount: 1500,
      date: '2026-01-02',
    });

    expect(preview.balances.envA).toBe(-500);
    expect(preview.warnings).toHaveLength(1);
    // Nothing was actually written.
    expect(getEnvelopeBalance('envA')).toBe(1000);
  });

  it('checkNegativeBalance matches what applying the same delta would produce', async () => {
    await setupEnvelopes();
    const txnId = await insertRealDeposit({ amount: 1000 });
    await applyMovement({
      type: 'fund',
      envelope: 'envA',
      amount: 1000,
      transactionId: txnId,
      date: '2026-01-01',
    });

    const warning = await checkNegativeBalance('envA', -1200);
    expect(warning?.resultingBalance).toBe(-200);

    const noWarning = await checkNegativeBalance('envA', -500);
    expect(noWarning).toBeNull();
  });

  describe('real-money invariant (fund must trace to real money)', () => {
    it('rejects a fund movement with no real anchor at all (no transactionId and no accountId)', async () => {
      await setupEnvelopes();

      await expect(
        applyMovement({
          type: 'fund',
          envelope: 'envA',
          amount: 100,
          date: '2026-01-01',
        }),
      ).rejects.toThrow();

      expect(getEnvelopeBalance('envA')).toBe(0);
    });

    it('rejects funding tied to a transaction that does not exist', async () => {
      await setupEnvelopes();

      await expect(
        applyMovement({
          type: 'fund',
          envelope: 'envA',
          amount: 100,
          transactionId: 'does-not-exist',
          date: '2026-01-01',
        }),
      ).rejects.toThrow();

      expect(getEnvelopeBalance('envA')).toBe(0);
    });

    it('rejects funding tied to a non-deposit (non-positive amount) transaction', async () => {
      await setupEnvelopes();
      const txnId = await insertRealDeposit({ amount: -5000 });

      await expect(
        applyMovement({
          type: 'fund',
          envelope: 'envA',
          amount: 1000,
          transactionId: txnId,
          date: '2026-01-01',
        }),
      ).rejects.toThrow();

      expect(getEnvelopeBalance('envA')).toBe(0);
    });

    it('allows splitting one real transaction across two envelopes as long as the total does not exceed its real amount', async () => {
      await setupEnvelopes();
      const txnId = await insertRealDeposit({ amount: 10000 });

      await applyMovement({
        type: 'fund',
        envelope: 'envA',
        amount: 6000,
        transactionId: txnId,
        date: '2026-01-01',
      });
      await applyMovement({
        type: 'fund',
        envelope: 'envB',
        amount: 4000,
        transactionId: txnId,
        date: '2026-01-01',
      });

      expect(getEnvelopeBalance('envA')).toBe(6000);
      expect(getEnvelopeBalance('envB')).toBe(4000);
    });

    it('rejects funding that would claim more than the linked transaction is actually worth, even split across two envelopes', async () => {
      await setupEnvelopes();
      const txnId = await insertRealDeposit({ amount: 10000 });

      await applyMovement({
        type: 'fund',
        envelope: 'envA',
        amount: 6000,
        transactionId: txnId,
        date: '2026-01-01',
      });

      // 6000 already claimed + 5000 more would be 11000, more than the
      // transaction's real 10000 -- must be rejected outright, not
      // silently clamped.
      await expect(
        applyMovement({
          type: 'fund',
          envelope: 'envB',
          amount: 5000,
          transactionId: txnId,
          date: '2026-01-01',
        }),
      ).rejects.toThrow();

      expect(getEnvelopeBalance('envA')).toBe(6000);
      expect(getEnvelopeBalance('envB')).toBe(0);
    });

    it('rejects a fund via account anchor that would push total envelope balances past total real ledger money, once the ledger is fully claimed', async () => {
      await setupEnvelopes();
      const txnId = await insertRealDeposit({ amount: 5000 });
      await applyMovement({
        type: 'fund',
        envelope: 'envA',
        amount: 5000,
        transactionId: txnId,
        date: '2026-01-01',
      });

      // The entire real $5000 in the ledger is now claimed by envA. Any
      // further funding -- even $1, and even via a plain account anchor
      // rather than a specific transaction -- would manufacture envelope
      // credit with no real money behind it.
      await expect(
        applyMovement({
          type: 'fund',
          envelope: 'envB',
          amount: 1,
          counterparty: { account: 'acct1' },
          date: '2026-01-02',
        }),
      ).rejects.toThrow();

      expect(getEnvelopeBalance('envB')).toBe(0);
    });
  });

  it('never lets the sum of envelope balances exceed total real money across ledger accounts, verified directly against real accounts/transactions rows (not local bookkeeping)', async () => {
    await setupEnvelopes();

    // Reads the REAL tables -- if `applyMovement` ever let envelope
    // credit outrun real ledger money, this assertion (not a mirrored JS
    // counter) is what would catch it.
    async function assertRealInvariant() {
      const ledgerRow = await db.first<{ total: number }>(
        `SELECT IFNULL(SUM(t.amount), 0) AS total
         FROM transactions t
         JOIN accounts a ON a.id = t.acct
         WHERE t.tombstone = 0 AND a.tombstone = 0`,
      );
      const envelopeRow = await db.first<{ total: number }>(
        'SELECT IFNULL(SUM(balance), 0) AS total FROM envelope_balances',
      );
      const totalRealLedgerMoney = ledgerRow?.total ?? 0;
      const totalEnvelopeBalance = envelopeRow?.total ?? 0;
      expect(totalEnvelopeBalance).toBeLessThanOrEqual(totalRealLedgerMoney);
    }

    const txn1 = await insertRealDeposit({ amount: 5000, date: '2026-01-01' });
    await applyMovement({
      type: 'fund',
      envelope: 'envA',
      amount: 5000,
      transactionId: txn1,
      date: '2026-01-01',
    });
    await assertRealInvariant();

    await applyMovement({
      type: 'transfer',
      from: 'envA',
      to: 'envB',
      amount: 2000,
      date: '2026-01-02',
    });
    await assertRealInvariant();

    await applyMovement({
      type: 'spend',
      envelope: 'envB',
      amount: 500,
      counterparty: { account: 'acct1' },
      date: '2026-01-03',
    });
    await assertRealInvariant();

    // Even an overspend (allowed, just warned about) can never manufacture
    // money -- it only ever reduces this envelope's own balance.
    await applyMovement({
      type: 'spend',
      envelope: 'envA',
      amount: 10000,
      date: '2026-01-04',
    });
    await assertRealInvariant();

    const txn2 = await insertRealDeposit({
      amount: 20000,
      date: '2026-01-05',
    });
    await applyMovement({
      type: 'fund',
      envelope: 'envA',
      amount: 20000,
      transactionId: txn2,
      date: '2026-01-05',
    });
    await assertRealInvariant();

    // Attempting to fund beyond what txn2 is really worth must be
    // rejected -- proving the invariant is actively enforced here, not
    // just true by coincidence of the amounts chosen above.
    await expect(
      applyMovement({
        type: 'fund',
        envelope: 'envB',
        amount: 1,
        transactionId: txn2,
        date: '2026-01-06',
      }),
    ).rejects.toThrow();
    await assertRealInvariant();
  });

  describe('concurrent fund race', () => {
    it('never lets two concurrent fund calls against the same transaction jointly claim more than it is worth', async () => {
      await setupEnvelopes();
      const txnId = await insertRealDeposit({ amount: 10000 });

      // Two concurrent claims against the same $100 transaction, each
      // trying to fund a DIFFERENT envelope for the full amount. At most
      // one may succeed -- if both succeed, $200 of envelope credit would
      // be manufactured from $100 of real money.
      const results = await Promise.allSettled([
        applyMovement({
          type: 'fund',
          envelope: 'envA',
          amount: 10000,
          transactionId: txnId,
          date: '2026-01-01',
        }),
        applyMovement({
          type: 'fund',
          envelope: 'envB',
          amount: 10000,
          transactionId: txnId,
          date: '2026-01-01',
        }),
      ]);

      const fulfilled = results.filter(r => r.status === 'fulfilled');
      expect(fulfilled).toHaveLength(1);

      const totalEnvelopeBalance =
        getEnvelopeBalance('envA') + getEnvelopeBalance('envB');
      expect(totalEnvelopeBalance).toBeLessThanOrEqual(10000);
    });
  });

  describe('concurrent balance-cache race', () => {
    // The authoritative source of truth for what an envelope's balance
    // *should* be -- summed directly from `envelope_ledger` (never from
    // the `envelope_balances` cache itself). Every assertion in this
    // block compares the cache against this, not against a JS-side
    // mirror of expected amounts, so it actually catches the cache
    // diverging from the ledger rather than just re-asserting arithmetic.
    async function sumLedgerAmount(envelopeId: string): Promise<number> {
      const row = await db.first<{ total: number }>(
        'SELECT IFNULL(SUM(amount), 0) AS total FROM envelope_ledger WHERE envelope_id = ?',
        [envelopeId],
      );
      return row?.total ?? 0;
    }

    it('never loses an update when two concurrent spends hit the same envelope', async () => {
      await setupEnvelopes();
      const txnId = await insertRealDeposit({ amount: 10000 });
      await applyMovement({
        type: 'fund',
        envelope: 'envA',
        amount: 10000,
        transactionId: txnId,
        date: '2026-01-01',
      });

      // Two concurrent $60 spends against a $100 balance. Both must be
      // recorded (spend never rejects for insufficient funds -- negative
      // balances are a dismissible nudge, not a block), so the
      // ledger-true ending balance is -$20. A lost update would leave the
      // cache at some value derived from only one of the two spends
      // (e.g. $40) instead.
      await Promise.all([
        applyMovement({
          type: 'spend',
          envelope: 'envA',
          amount: 6000,
          counterparty: { account: 'acct1' },
          date: '2026-01-02',
        }),
        applyMovement({
          type: 'spend',
          envelope: 'envA',
          amount: 6000,
          counterparty: { account: 'acct1' },
          date: '2026-01-02',
        }),
      ]);

      const ledgerTotal = await sumLedgerAmount('envA');
      expect(ledgerTotal).toBe(-2000);
      expect(getEnvelopeBalance('envA')).toBe(ledgerTotal);
    });

    it('never loses an update from a mix of concurrent spend and transfer movements touching the same envelope', async () => {
      await setupEnvelopes();
      const txnId = await insertRealDeposit({ amount: 10000 });
      await applyMovement({
        type: 'fund',
        envelope: 'envA',
        amount: 10000,
        transactionId: txnId,
        date: '2026-01-01',
      });

      // Three concurrent movements all touching envA's cache: a spend, a
      // transfer OUT of envA, and a transfer IN to envA (the second leg
      // of a transfer from envB, which was pre-funded so it has
      // something to send). Each writes its own delta to envA's cache
      // concurrently with the others.
      const txnB = await insertRealDeposit({
        amount: 3000,
        date: '2026-01-01',
      });
      await applyMovement({
        type: 'fund',
        envelope: 'envB',
        amount: 3000,
        transactionId: txnB,
        date: '2026-01-01',
      });

      await Promise.all([
        applyMovement({
          type: 'spend',
          envelope: 'envA',
          amount: 4000,
          counterparty: { account: 'acct1' },
          date: '2026-01-02',
        }),
        applyMovement({
          type: 'transfer',
          from: 'envA',
          to: 'envB',
          amount: 1000,
          date: '2026-01-02',
        }),
        applyMovement({
          type: 'transfer',
          from: 'envB',
          to: 'envA',
          amount: 500,
          date: '2026-01-02',
        }),
      ]);

      const ledgerTotalA = await sumLedgerAmount('envA');
      const ledgerTotalB = await sumLedgerAmount('envB');
      expect(getEnvelopeBalance('envA')).toBe(ledgerTotalA);
      expect(getEnvelopeBalance('envB')).toBe(ledgerTotalB);
    });
  });
});
