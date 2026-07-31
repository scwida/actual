import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as db from '#server/db';
import { getEnvelopeBalance } from '#server/envelopes/balances';
import { getUnallocatedEnvelopeId } from '#server/envelopes/unallocated';

import {
  createPlannedPaycheck,
  getPlannedAllocations,
  getPlannedPaycheckRow,
  matchTransaction,
  updateDraftAllocation,
} from './actions';
import { commitPaycheck, computeSuggestedReduction } from './commit';

describe('commitPaycheck', () => {
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

  // `matchTransaction` derives `actual_amount` from a REAL row in the
  // `transactions` table -- this inserts one, so these tests exercise
  // that real verification path instead of asserting an arbitrary
  // caller-supplied number (see `movement.ts`'s
  // `assertFundBackedByRealMoney` and `actions.ts`'s `matchTransaction`).
  async function insertRealDeposit({
    id,
    amount,
    date = '2026-02-06',
    account = 'acct1',
  }: {
    id: string;
    amount: number;
    date?: string;
    account?: string;
  }): Promise<string> {
    return db.insertTransaction({ id, account, amount, date });
  }

  it('exact match: approving the suggestion (== drafted amounts) commits everything and nothing goes to Unallocated', async () => {
    await setupEnvelopes();

    const paycheck = await createPlannedPaycheck({
      expectedDate: '2026-02-06',
      expectedAmount: 1000,
    });
    await updateDraftAllocation({
      plannedPaycheckId: paycheck.id,
      envelopeId: 'envA',
      amount: 600,
    });
    await updateDraftAllocation({
      plannedPaycheckId: paycheck.id,
      envelopeId: 'envB',
      amount: 400,
    });
    await insertRealDeposit({ id: 'txn1', amount: 1000 });
    await matchTransaction({
      plannedPaycheckId: paycheck.id,
      transactionId: 'txn1',
    });

    const allocations = await getPlannedAllocations(paycheck.id);
    const { shortfallAmount, suggested } = computeSuggestedReduction(
      { actual_amount: 1000, expected_amount: 1000 },
      allocations,
    );
    expect(shortfallAmount).toBe(0);
    expect(suggested).toEqual({ envA: 600, envB: 400 });

    const result = await commitPaycheck(paycheck.id, suggested);

    expect(result.leftoverToUnallocated).toBe(0);
    expect(getEnvelopeBalance('envA')).toBe(600);
    expect(getEnvelopeBalance('envB')).toBe(400);
    expect(getEnvelopeBalance(getUnallocatedEnvelopeId())).toBe(0);
    expect(result.paycheck.status).toBe('committed');
    expect(result.paycheck.commit_shortfall_amount).toBe(0);
  });

  it('shortfall: the suggestion reduces the most recently drafted envelope first, and accepting it commits that reduced amount', async () => {
    await setupEnvelopes();

    const paycheck = await createPlannedPaycheck({
      expectedDate: '2026-02-06',
      expectedAmount: 1000,
    });
    await updateDraftAllocation({
      plannedPaycheckId: paycheck.id,
      envelopeId: 'envA',
      amount: 600,
    });
    global.stepForwardInTime();
    await updateDraftAllocation({
      plannedPaycheckId: paycheck.id,
      envelopeId: 'envB',
      amount: 400,
    });
    // Actual deposit came in $200 short.
    await insertRealDeposit({ id: 'txn1', amount: 800 });
    await matchTransaction({
      plannedPaycheckId: paycheck.id,
      transactionId: 'txn1',
    });

    const allocations = await getPlannedAllocations(paycheck.id);
    const { shortfallAmount, suggested } = computeSuggestedReduction(
      { actual_amount: 800, expected_amount: 1000 },
      allocations,
    );
    expect(shortfallAmount).toBe(200);
    // envB was drafted later, so it's reduced first.
    expect(suggested).toEqual({ envA: 600, envB: 200 });

    const result = await commitPaycheck(paycheck.id, suggested);

    expect(getEnvelopeBalance('envA')).toBe(600);
    expect(getEnvelopeBalance('envB')).toBe(200);
    expect(result.leftoverToUnallocated).toBe(0);
    expect(result.paycheck.commit_shortfall_amount).toBe(200);

    const committedAllocations = await db.all<db.DbPlannedAllocation>(
      'SELECT * FROM planned_allocation WHERE planned_paycheck_id = ?',
      [paycheck.id],
    );
    const envBRow = committedAllocations.find(a => a.envelope_id === 'envB');
    expect(envBRow?.suggested_amount).toBe(200);
    expect(envBRow?.approved_amount).toBe(200);
  });

  it('shortfall overridden: the user can approve different amounts than the suggestion, and both are recorded', async () => {
    await setupEnvelopes();

    const paycheck = await createPlannedPaycheck({
      expectedDate: '2026-02-06',
      expectedAmount: 1000,
    });
    await updateDraftAllocation({
      plannedPaycheckId: paycheck.id,
      envelopeId: 'envA',
      amount: 600,
    });
    global.stepForwardInTime();
    await updateDraftAllocation({
      plannedPaycheckId: paycheck.id,
      envelopeId: 'envB',
      amount: 400,
    });
    await insertRealDeposit({ id: 'txn1', amount: 800 });
    await matchTransaction({
      plannedPaycheckId: paycheck.id,
      transactionId: 'txn1',
    });

    // The suggestion would cut envB, but the user decides to cut envA
    // instead and keep envB fully funded.
    const overridden = { envA: 400, envB: 400 };
    const result = await commitPaycheck(paycheck.id, overridden);

    expect(getEnvelopeBalance('envA')).toBe(400);
    expect(getEnvelopeBalance('envB')).toBe(400);
    // The suggestion snapshot on the paycheck reflects what was
    // *suggested*, not what was approved.
    expect(result.paycheck.commit_suggested_allocations).toEqual({
      envA: 600,
      envB: 200,
    });

    const committedAllocations = await db.all<db.DbPlannedAllocation>(
      'SELECT * FROM planned_allocation WHERE planned_paycheck_id = ?',
      [paycheck.id],
    );
    const envARow = committedAllocations.find(a => a.envelope_id === 'envA');
    expect(envARow?.suggested_amount).toBe(600);
    expect(envARow?.approved_amount).toBe(400);
  });

  it('rejects approved amounts that exceed the actual deposit, instead of silently truncating', async () => {
    await setupEnvelopes();

    const paycheck = await createPlannedPaycheck({
      expectedDate: '2026-02-06',
      expectedAmount: 1000,
    });
    await updateDraftAllocation({
      plannedPaycheckId: paycheck.id,
      envelopeId: 'envA',
      amount: 1000,
    });
    await insertRealDeposit({ id: 'txn1', amount: 800 });
    await matchTransaction({
      plannedPaycheckId: paycheck.id,
      transactionId: 'txn1',
    });

    await expect(commitPaycheck(paycheck.id, { envA: 1000 })).rejects.toThrow();

    // Nothing should have moved.
    expect(getEnvelopeBalance('envA')).toBe(0);
    const row = getPlannedPaycheckRow(paycheck.id);
    expect(row.status).toBe('draft');
  });

  it('routes any leftover between the actual deposit and approved amounts to the reserved Unallocated envelope', async () => {
    await setupEnvelopes();

    const paycheck = await createPlannedPaycheck({
      expectedDate: '2026-02-06',
      expectedAmount: 1000,
    });
    await updateDraftAllocation({
      plannedPaycheckId: paycheck.id,
      envelopeId: 'envA',
      amount: 500,
    });
    // Overfunded: the real deposit was bigger than planned.
    await insertRealDeposit({ id: 'txn1', amount: 1200 });
    await matchTransaction({
      plannedPaycheckId: paycheck.id,
      transactionId: 'txn1',
    });

    const allocations = await getPlannedAllocations(paycheck.id);
    const { shortfallAmount, suggested } = computeSuggestedReduction(
      { actual_amount: 1200, expected_amount: 1000 },
      allocations,
    );
    expect(shortfallAmount).toBe(0);
    expect(suggested).toEqual({ envA: 500 });

    const result = await commitPaycheck(paycheck.id, suggested);

    expect(result.leftoverToUnallocated).toBe(700);
    expect(getEnvelopeBalance('envA')).toBe(500);
    expect(getEnvelopeBalance(getUnallocatedEnvelopeId())).toBe(700);
  });

  describe('matchTransaction / commitPaycheck real-money verification', () => {
    it('matchTransaction rejects a transactionId that does not correspond to any real transaction', async () => {
      await setupEnvelopes();

      const paycheck = await createPlannedPaycheck({
        expectedDate: '2026-02-06',
        expectedAmount: 1000,
      });

      await expect(
        matchTransaction({
          plannedPaycheckId: paycheck.id,
          transactionId: 'does-not-exist',
        }),
      ).rejects.toThrow();

      const row = getPlannedPaycheckRow(paycheck.id);
      expect(row.actual_transaction_id).toBeFalsy();
      expect(row.actual_amount).toBeFalsy();
    });

    it('matchTransaction rejects a transaction that is not a real deposit (non-positive amount)', async () => {
      await setupEnvelopes();

      const paycheck = await createPlannedPaycheck({
        expectedDate: '2026-02-06',
        expectedAmount: 1000,
      });
      await insertRealDeposit({ id: 'txn-debit', amount: -500 });

      await expect(
        matchTransaction({
          plannedPaycheckId: paycheck.id,
          transactionId: 'txn-debit',
        }),
      ).rejects.toThrow();
    });

    it('matchTransaction derives actual_amount strictly from the real transaction row, not any caller-asserted number', async () => {
      await setupEnvelopes();

      const paycheck = await createPlannedPaycheck({
        expectedDate: '2026-02-06',
        expectedAmount: 1000,
      });
      await insertRealDeposit({ id: 'txn-small', amount: 250 });

      await matchTransaction({
        plannedPaycheckId: paycheck.id,
        transactionId: 'txn-small',
      });

      const row = getPlannedPaycheckRow(paycheck.id);
      expect(row.actual_amount).toBe(250);
    });

    it('commitPaycheck rejects if the matched transaction was deleted (tombstoned) after matching but before commit', async () => {
      await setupEnvelopes();

      const paycheck = await createPlannedPaycheck({
        expectedDate: '2026-02-06',
        expectedAmount: 1000,
      });
      await updateDraftAllocation({
        plannedPaycheckId: paycheck.id,
        envelopeId: 'envA',
        amount: 1000,
      });
      await insertRealDeposit({ id: 'txn-del', amount: 1000 });
      await matchTransaction({
        plannedPaycheckId: paycheck.id,
        transactionId: 'txn-del',
      });

      // The matched transaction is removed before the user actually
      // commits (e.g. it turned out to be a duplicate import).
      await db.updateWithSchema('transactions', {
        id: 'txn-del',
        tombstone: true,
      });

      await expect(
        commitPaycheck(paycheck.id, { envA: 1000 }),
      ).rejects.toThrow();

      // No envelope credit should have been manufactured against a
      // transaction that no longer exists.
      expect(getEnvelopeBalance('envA')).toBe(0);
      const row = getPlannedPaycheckRow(paycheck.id);
      expect(row.status).toBe('draft');
    });

    it('commitPaycheck rejects committing more than the matched transaction is really worth, even if approvedAmounts is internally consistent', async () => {
      await setupEnvelopes();

      const paycheck = await createPlannedPaycheck({
        expectedDate: '2026-02-06',
        expectedAmount: 1000,
      });
      await updateDraftAllocation({
        plannedPaycheckId: paycheck.id,
        envelopeId: 'envA',
        amount: 1000,
      });
      await insertRealDeposit({ id: 'txn-real', amount: 1000 });
      await matchTransaction({
        plannedPaycheckId: paycheck.id,
        transactionId: 'txn-real',
      });

      // Simulate the real transaction's amount being edited down after
      // matching (e.g. corrected from $1000 to $100) but before commit --
      // `actual_amount` on the planned paycheck is now stale.
      await db.updateWithSchema('transactions', {
        id: 'txn-real',
        amount: 100,
      });

      await expect(
        commitPaycheck(paycheck.id, { envA: 1000 }),
      ).rejects.toThrow();

      expect(getEnvelopeBalance('envA')).toBe(0);
    });
  });
});
