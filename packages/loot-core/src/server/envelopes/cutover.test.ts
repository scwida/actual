import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as budgetActions from '#server/budget/actions';
import * as db from '#server/db';

import { getEnvelopeBalance } from './balances';
import { runEnvelopeEngineCutover } from './cutover';
import { getUnallocatedEnvelopeId } from './unallocated';

describe('runEnvelopeEngineCutover', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('seeds every existing category (including the reserved Unallocated envelope the migration created) at a zero balance', async () => {
    await db.insertCategoryGroup({
      id: 'group1',
      name: 'Group 1',
      is_income: 0,
    });
    await db.insertCategory({
      id: 'cat1',
      name: 'Cat 1',
      cat_group: 'group1',
      is_income: 0,
    });
    await db.insertCategory({
      id: 'cat2',
      name: 'Cat 2',
      cat_group: 'group1',
      is_income: 0,
    });

    const result = await runEnvelopeEngineCutover();

    // cat1, cat2, and the reserved Unallocated envelope (structurally
    // seeded by the migration, but with no envelope_balances row yet).
    expect(result.seededCount).toBe(3);
    expect(getEnvelopeBalance('cat1')).toBe(0);
    expect(getEnvelopeBalance('cat2')).toBe(0);
    expect(getEnvelopeBalance(getUnallocatedEnvelopeId())).toBe(0);

    const ledgerRows = await db.all('SELECT * FROM envelope_ledger');
    expect(ledgerRows).toHaveLength(0);
  });

  it('is idempotent: calling it again seeds nothing further and never overwrites an existing balance', async () => {
    await db.insertCategoryGroup({
      id: 'group1',
      name: 'Group 1',
      is_income: 0,
    });
    await db.insertCategory({
      id: 'cat1',
      name: 'Cat 1',
      cat_group: 'group1',
      is_income: 0,
    });

    const first = await runEnvelopeEngineCutover();
    expect(first.seededCount).toBeGreaterThan(0);

    const second = await runEnvelopeEngineCutover();
    expect(second.seededCount).toBe(0);

    const rows = await db.all<{ id: string }>(
      'SELECT id FROM envelope_balances WHERE id = ?',
      ['cat1'],
    );
    expect(rows).toHaveLength(1);
  });

  it('never carries forward a value from the old engine leftover/budgeted formula tables', async () => {
    await db.insertCategoryGroup({
      id: 'group1',
      name: 'Group 1',
      is_income: 0,
    });
    const catId = await db.insertCategory({
      id: 'cat1',
      name: 'Cat 1',
      cat_group: 'group1',
      is_income: 0,
    });

    // Simulate old-engine history: a nonzero monthly budgeted amount for
    // this category in the old formula-cell tables (zero_budgets, since
    // the default budget type is 'envelope').
    await budgetActions.setBudget({
      category: catId,
      month: '2026-01',
      amount: 50000,
    });
    const oldBudgetRow = await db.first<{ amount: number }>(
      'SELECT amount FROM zero_budgets WHERE category = ?',
      [catId],
    );
    expect(oldBudgetRow?.amount).toBe(50000);

    await runEnvelopeEngineCutover();

    // The old budgeted amount must NOT leak into the envelope's real
    // balance -- cutover is a fresh start at zero, not an import (see
    // CLAUDE.md "Cutover vs. Import").
    expect(getEnvelopeBalance('cat1')).toBe(0);
  });
});
