import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as db from '#server/db';

import {
  getAmountAlreadyFundedFromTransaction,
  getTotalRealLedgerBalance,
} from './real-money';

describe('getTotalRealLedgerBalance', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('counts a plain (non-split) transaction once', async () => {
    await db.insertAccount({ id: 'acct1', name: 'Checking', offbudget: 0 });
    await db.insertTransaction({
      account: 'acct1',
      amount: 10000,
      date: '2026-01-01',
    });

    expect(getTotalRealLedgerBalance()).toBe(10000);
  });

  it('counts a split transaction (one parent + two children summing to the parent) only once, not double', async () => {
    await db.insertAccount({ id: 'acct1', name: 'Checking', offbudget: 0 });

    // A single $100 deposit split into $60/$40 category children -- the
    // parent row and its children are BOTH alive, non-tombstoned rows in
    // `transactions`. Real money in the ledger is $100, not $200.
    await db.insertTransaction({
      id: 'parent1',
      account: 'acct1',
      amount: 10000,
      date: '2026-01-01',
      is_parent: true,
    });
    await db.insertTransaction({
      id: 'child1',
      account: 'acct1',
      amount: 6000,
      date: '2026-01-01',
      is_child: true,
      parent_id: 'parent1',
    });
    await db.insertTransaction({
      id: 'child2',
      account: 'acct1',
      amount: 4000,
      date: '2026-01-01',
      is_child: true,
      parent_id: 'parent1',
    });

    expect(getTotalRealLedgerBalance()).toBe(10000);
  });

  it('excludes off-budget accounts from the fundable ceiling', async () => {
    await db.insertAccount({ id: 'acct1', name: 'Checking', offbudget: 0 });
    await db.insertAccount({
      id: 'acct2',
      name: 'Tracked Loan',
      offbudget: 1,
    });
    await db.insertTransaction({
      account: 'acct1',
      amount: 10000,
      date: '2026-01-01',
    });
    await db.insertTransaction({
      account: 'acct2',
      amount: 50000,
      date: '2026-01-01',
    });

    expect(getTotalRealLedgerBalance()).toBe(10000);
  });

  it('excludes deleted (tombstoned) transactions and accounts', async () => {
    await db.insertAccount({ id: 'acct1', name: 'Checking', offbudget: 0 });
    const deletedTxn = await db.insertTransaction({
      account: 'acct1',
      amount: 10000,
      date: '2026-01-01',
    });
    await db.deleteTransaction({ id: deletedTxn });

    await db.insertAccount({ id: 'acct2', name: 'Closed', offbudget: 0 });
    await db.insertTransaction({
      account: 'acct2',
      amount: 5000,
      date: '2026-01-01',
    });
    await db.deleteAccount({ id: 'acct2' });

    expect(getTotalRealLedgerBalance()).toBe(0);
  });
});

describe('getAmountAlreadyFundedFromTransaction', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('returns 0 when nothing has claimed against the transaction yet', () => {
    expect(getAmountAlreadyFundedFromTransaction('does-not-exist')).toBe(0);
  });
});
