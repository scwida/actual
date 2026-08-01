import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as db from '#server/db';

import { getEnvelopeAverageMonthlySpend } from './spending-history';

describe('getEnvelopeAverageMonthlySpend', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  async function setupEnvelope() {
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
  }

  // Directly writes a raw `envelope_ledger` `spend` row (rather than
  // going through `applyMovement`/transaction-hooks) so this test can
  // script an exact multi-month sequence of historical spend amounts on
  // exact dates -- what the query aggregates is "every spend row for this
  // envelope", regardless of how each row got there.
  async function insertSpend(envelopeId: string, date: string, amount: number) {
    await db.insertWithSchema('envelope_ledger', {
      envelope_id: envelopeId,
      amount: -amount,
      movement_type: 'spend',
      date,
      created_at: `${date}T00:00:00.000Z`,
    });
  }

  it('averages, not sums, spend across the trailing window', async () => {
    await setupEnvelope();
    // $100 in June, $200 in July, $300 in August = $600 total / 3 months.
    await insertSpend('envA', '2026-06-15', 10000);
    await insertSpend('envA', '2026-07-15', 20000);
    await insertSpend('envA', '2026-08-15', 30000);

    const average = await getEnvelopeAverageMonthlySpend(
      'envA',
      3,
      '2026-08-31',
    );
    expect(average).toBe(20000);
  });

  it('windows to only the trailing N months, excluding older spend', async () => {
    await setupEnvelope();
    // A big spend well outside a 2-month trailing window from 2026-08-31.
    await insertSpend('envA', '2026-01-01', 1000000);
    // Inside the window.
    await insertSpend('envA', '2026-07-15', 10000);
    await insertSpend('envA', '2026-08-15', 20000);

    const average = await getEnvelopeAverageMonthlySpend(
      'envA',
      2,
      '2026-08-31',
    );
    // Only the two in-window months count: (10000 + 20000) / 2 = 15000.
    // If the old $10000 spend leaked in, this would be far larger.
    expect(average).toBe(15000);
  });

  it('counts a spend-free month in the window as a real zero, not a skipped month', async () => {
    await setupEnvelope();
    // Only one month of spend within a 3-month window -- the other two
    // months are genuinely zero and must still divide the average down.
    await insertSpend('envA', '2026-08-15', 30000);

    const average = await getEnvelopeAverageMonthlySpend(
      'envA',
      3,
      '2026-08-31',
    );
    expect(average).toBe(10000);
  });

  it('returns 0 for an envelope with no spend history at all', async () => {
    await setupEnvelope();
    const average = await getEnvelopeAverageMonthlySpend(
      'envA',
      6,
      '2026-08-31',
    );
    expect(average).toBe(0);
  });

  it('ignores non-spend movement types (fund/transfer) -- only spend rows count', async () => {
    await setupEnvelope();
    await db.insertCategory({
      id: 'envB',
      name: 'Envelope B',
      cat_group: 'group1',
      is_income: 0,
    });

    await db.insertWithSchema('envelope_ledger', {
      envelope_id: 'envA',
      amount: 50000,
      movement_type: 'fund',
      date: '2026-08-01',
      created_at: '2026-08-01T00:00:00.000Z',
    });
    await db.insertWithSchema('envelope_ledger', {
      envelope_id: 'envA',
      amount: -5000,
      movement_type: 'transfer',
      date: '2026-08-02',
      created_at: '2026-08-02T00:00:00.000Z',
    });
    await insertSpend('envA', '2026-08-15', 20000);

    const average = await getEnvelopeAverageMonthlySpend(
      'envA',
      1,
      '2026-08-31',
    );
    expect(average).toBe(20000);
  });

  it('scopes to the requested envelope only', async () => {
    await setupEnvelope();
    await db.insertCategory({
      id: 'envB',
      name: 'Envelope B',
      cat_group: 'group1',
      is_income: 0,
    });

    await insertSpend('envA', '2026-08-15', 10000);
    await insertSpend('envB', '2026-08-15', 90000);

    const average = await getEnvelopeAverageMonthlySpend(
      'envA',
      1,
      '2026-08-31',
    );
    expect(average).toBe(10000);
  });

  it('rejects a non-positive monthsWindow', async () => {
    await setupEnvelope();
    await expect(
      getEnvelopeAverageMonthlySpend('envA', 0, '2026-08-31'),
    ).rejects.toThrow(/monthsWindow must be a positive integer/);
  });
});
