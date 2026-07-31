import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as db from '#server/db';

import {
  cancelPaycheck,
  createPlannedPaycheck,
  getPlannedAllocations,
  getPlannedPaycheckRow,
  matchTransaction,
  updateDraftAllocation,
  updateDraftPaycheck,
} from './actions';
import { commitPaycheck } from './commit';

describe('updateDraftPaycheck', () => {
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
    await db.insertAccount({ id: 'acct1', name: 'Checking', offbudget: 0 });
  }

  it("edits a draft paycheck's expected_date and expected_amount and persists both", async () => {
    const paycheck = await createPlannedPaycheck({
      expectedDate: '2026-02-06',
      expectedAmount: 1000,
    });

    const updated = await updateDraftPaycheck({
      plannedPaycheckId: paycheck.id,
      expectedDate: '2026-02-13',
      expectedAmount: 1200,
    });

    expect(updated.expected_date).toBe('2026-02-13');
    expect(updated.expected_amount).toBe(1200);

    const row = getPlannedPaycheckRow(paycheck.id);
    expect(row.expected_date).toBe('2026-02-13');
    expect(row.expected_amount).toBe(1200);
    expect(row.status).toBe('draft');
  });

  it('allows partial edits -- only the provided field changes', async () => {
    const paycheck = await createPlannedPaycheck({
      expectedDate: '2026-02-06',
      expectedAmount: 1000,
    });

    const updated = await updateDraftPaycheck({
      plannedPaycheckId: paycheck.id,
      expectedAmount: 1500,
    });

    expect(updated.expected_date).toBe('2026-02-06');
    expect(updated.expected_amount).toBe(1500);
  });

  it('rejects a non-positive or non-integer expectedAmount', async () => {
    const paycheck = await createPlannedPaycheck({
      expectedDate: '2026-02-06',
      expectedAmount: 1000,
    });

    await expect(
      updateDraftPaycheck({
        plannedPaycheckId: paycheck.id,
        expectedAmount: 0,
      }),
    ).rejects.toThrow();
    await expect(
      updateDraftPaycheck({
        plannedPaycheckId: paycheck.id,
        expectedAmount: -100,
      }),
    ).rejects.toThrow();
    await expect(
      updateDraftPaycheck({
        plannedPaycheckId: paycheck.id,
        expectedAmount: 100.5,
      }),
    ).rejects.toThrow();

    // Nothing should have changed.
    const row = getPlannedPaycheckRow(paycheck.id);
    expect(row.expected_amount).toBe(1000);
  });

  it('throws when editing a committed paycheck, and does not modify it', async () => {
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
    const txnId = await db.insertTransaction({
      id: 'txn1',
      account: 'acct1',
      amount: 1000,
      date: '2026-02-06',
    });
    await matchTransaction({
      plannedPaycheckId: paycheck.id,
      transactionId: txnId,
    });
    await commitPaycheck(paycheck.id, { envA: 1000 });

    const before = getPlannedPaycheckRow(paycheck.id);
    expect(before.status).toBe('committed');

    await expect(
      updateDraftPaycheck({
        plannedPaycheckId: paycheck.id,
        expectedAmount: 2000,
      }),
    ).rejects.toThrow();

    const after = getPlannedPaycheckRow(paycheck.id);
    expect(after).toEqual(before);
  });

  it('throws when editing a canceled paycheck, and does not modify it', async () => {
    const paycheck = await createPlannedPaycheck({
      expectedDate: '2026-02-06',
      expectedAmount: 1000,
    });
    await cancelPaycheck({ plannedPaycheckId: paycheck.id });

    const before = getPlannedPaycheckRow(paycheck.id);
    expect(before.status).toBe('canceled');

    await expect(
      updateDraftPaycheck({
        plannedPaycheckId: paycheck.id,
        expectedDate: '2026-03-01',
      }),
    ).rejects.toThrow();

    const after = getPlannedPaycheckRow(paycheck.id);
    expect(after).toEqual(before);
  });

  it('leaves existing PlannedAllocation rows unchanged when expectedAmount is edited', async () => {
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
    const allocationsBefore = await getPlannedAllocations(paycheck.id);

    await updateDraftPaycheck({
      plannedPaycheckId: paycheck.id,
      expectedAmount: 300,
    });

    const allocationsAfter = await getPlannedAllocations(paycheck.id);
    expect(allocationsAfter).toEqual(allocationsBefore);
  });
});
