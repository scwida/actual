import { describe, expect, it } from 'vitest';

import { shouldFireQuickFundTransfer } from './util';

describe('shouldFireQuickFundTransfer', () => {
  it('fires when the typed amount genuinely differs from the current bound value', () => {
    expect(shouldFireQuickFundTransfer(5000, 2000)).toBe(true);
  });

  it('does not fire when the typed amount matches the current bound value', () => {
    // This is the standard Enter/Tab batch-editing scenario (CLAUDE.md
    // Section 10): `moveVertically` in `BudgetTable.tsx` pre-fills the
    // next row's cell with its own current bound value, and pressing
    // Enter/Tab down a column of already-funded categories must not
    // silently re-fund each one again from Unallocated.
    expect(shouldFireQuickFundTransfer(2000, 2000)).toBe(false);
  });

  it('does not fire repeatedly across a simulated Enter/Tab tour down an already-funded column', () => {
    // Each row's "typed" amount is exactly its own current bound value,
    // as it would be after `moveVertically` pre-fills it -- simulates
    // tabbing/entering through several already-funded rows in one pass.
    const rows = [
      { typed: 1000, current: 1000 },
      { typed: 2500, current: 2500 },
      { typed: 0, current: 0 },
      { typed: 4200, current: 4200 },
    ];

    for (const row of rows) {
      expect(shouldFireQuickFundTransfer(row.typed, row.current)).toBe(false);
    }
  });

  it('does not fire for a zero amount even when the current bound value is nonzero', () => {
    // `useBudgetActions()`'s `'budget-amount'` case is a guaranteed no-op
    // for `amount <= 0` -- it never performs a transfer or writes to
    // `catBudgeted` -- so treating this as "no real change" prevents the
    // stale-blank-display bug from reappearing via this path.
    expect(shouldFireQuickFundTransfer(0, 7500)).toBe(false);
  });

  it('does not fire for a negative amount', () => {
    expect(shouldFireQuickFundTransfer(-100, 0)).toBe(false);
  });

  it('does not fire for a null (blank) amount', () => {
    expect(shouldFireQuickFundTransfer(null, 3000)).toBe(false);
  });

  it('treats a null current bound value as zero', () => {
    expect(shouldFireQuickFundTransfer(1500, null)).toBe(true);
    expect(shouldFireQuickFundTransfer(0, null)).toBe(false);
  });
});
