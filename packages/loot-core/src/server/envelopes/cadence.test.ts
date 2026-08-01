import { describe, expect, it } from 'vitest';

import type { Cadence } from '#types/models';

import {
  cadenceLengthInDays,
  computeMonthsCovered,
  computeSuggestedContribution,
  monthlyEquivalentAmount,
  periodsBetween,
  periodsPerYear,
} from './cadence';

describe('cadenceLengthInDays / periodsPerYear', () => {
  it('returns the expected day-length for every cadence type', () => {
    expect(cadenceLengthInDays({ type: 'weekly' })).toBe(7);
    expect(cadenceLengthInDays({ type: 'monthly' })).toBeCloseTo(30.4375, 4);
    expect(cadenceLengthInDays({ type: 'quarterly' })).toBeCloseTo(91.3125, 4);
    expect(cadenceLengthInDays({ type: 'annual' })).toBe(365.25);
    expect(cadenceLengthInDays({ type: 'custom', days: 10 })).toBe(10);
  });

  it('derives periodsPerYear as the inverse of the day-length', () => {
    expect(periodsPerYear({ type: 'monthly' })).toBeCloseTo(12, 4);
    expect(periodsPerYear({ type: 'quarterly' })).toBeCloseTo(4, 4);
    expect(periodsPerYear({ type: 'annual' })).toBeCloseTo(1, 4);
    expect(periodsPerYear({ type: 'weekly' })).toBeCloseTo(52.1786, 3);
    expect(periodsPerYear({ type: 'custom', days: 365.25 / 2 })).toBeCloseTo(
      2,
      4,
    );
  });
});

describe('monthlyEquivalentAmount', () => {
  it('leaves a monthly amount unchanged', () => {
    expect(monthlyEquivalentAmount(8500, { type: 'monthly' })).toBeCloseTo(
      8500,
      2,
    );
  });

  it('normalizes a quarterly target to its monthly equivalent', () => {
    // $300/quarter = $100/month-equivalent.
    expect(monthlyEquivalentAmount(30000, { type: 'quarterly' })).toBeCloseTo(
      10000,
      2,
    );
  });

  it('normalizes an annual target to its monthly equivalent', () => {
    expect(monthlyEquivalentAmount(120000, { type: 'annual' })).toBeCloseTo(
      10000,
      2,
    );
  });

  it('normalizes a weekly target to its monthly equivalent', () => {
    // $100/week ~= $434.82/month-equivalent ((365.25/7/12) weeks per month).
    expect(monthlyEquivalentAmount(10000, { type: 'weekly' })).toBeCloseTo(
      43482,
      -1,
    );
  });

  it('normalizes a custom N-day cadence to its monthly equivalent', () => {
    // A target every 60 days is ~2 periods/month-equivalent.
    const amount = monthlyEquivalentAmount(5000, {
      type: 'custom',
      days: 60,
    });
    expect(amount).toBeCloseTo(5000 * (365.25 / 60 / 12), 2);
  });
});

describe('computeMonthsCovered', () => {
  const cadences: Array<[string, Cadence]> = [
    ['weekly', { type: 'weekly' }],
    ['monthly', { type: 'monthly' }],
    ['quarterly', { type: 'quarterly' }],
    ['annual', { type: 'annual' }],
    ['custom', { type: 'custom', days: 45 }],
  ];

  it.each(cadences)(
    'balance == monthly-equivalent target => ~1 month covered (%s)',
    (_label, cadence) => {
      const monthlyEquivalent = monthlyEquivalentAmount(10000, cadence);
      const monthsCovered = computeMonthsCovered(
        monthlyEquivalent,
        10000,
        cadence,
      );
      expect(monthsCovered).toBeCloseTo(1, 6);
    },
  );

  it('a literal monthly target divides balance by target directly', () => {
    // $255 balance / $85-a-month target = 3 months covered.
    expect(computeMonthsCovered(25500, 8500, { type: 'monthly' })).toBeCloseTo(
      3,
      6,
    );
  });

  it('a quarterly target of $300 covers 1 month per $100 of balance', () => {
    expect(computeMonthsCovered(10000, 30000, { type: 'quarterly' })).toBe(1);
    expect(computeMonthsCovered(25000, 30000, { type: 'quarterly' })).toBe(2.5);
  });

  it('does not clamp a negative balance to zero -- reports "months behind" as negative', () => {
    expect(computeMonthsCovered(-17000, 8500, { type: 'monthly' })).toBeCloseTo(
      -2,
      6,
    );
  });

  it('returns 0, not Infinity/NaN, for a non-positive target amount', () => {
    expect(computeMonthsCovered(10000, 0, { type: 'monthly' })).toBe(0);
    expect(computeMonthsCovered(10000, -500, { type: 'monthly' })).toBe(0);
  });
});

describe('periodsBetween', () => {
  it('is zero for the same date', () => {
    expect(periodsBetween('2026-01-01', '2026-01-01', { type: 'weekly' })).toBe(
      0,
    );
  });

  it('is positive when toDate is after fromDate, negative when before', () => {
    expect(
      periodsBetween('2026-01-01', '2026-01-08', { type: 'weekly' }),
    ).toBeCloseTo(1, 6);
    expect(
      periodsBetween('2026-01-08', '2026-01-01', { type: 'weekly' }),
    ).toBeCloseTo(-1, 6);
  });

  it('divides by the custom day-count for a custom cadence', () => {
    expect(
      periodsBetween('2026-01-01', '2026-01-22', {
        type: 'custom',
        days: 7,
      }),
    ).toBeCloseTo(3, 6);
  });
});

describe('computeSuggestedContribution', () => {
  it('splits the remaining shortfall evenly across whole periods remaining', () => {
    // $3000 target, $600 saved, $2400 remaining, exactly 90 days away at a
    // 30-day custom cadence => exactly 3 periods remaining => $800/period.
    const result = computeSuggestedContribution(
      60000,
      300000,
      '2026-10-30',
      { type: 'custom', days: 30 },
      '2026-08-01',
    );
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.periodsRemaining).toBe(3);
      expect(result.suggestedAmount).toBe(80000);
    }
  });

  it('suggests 0 once the balance already meets or exceeds the target', () => {
    const result = computeSuggestedContribution(
      300000,
      300000,
      '2026-12-01',
      { type: 'monthly' },
      '2026-08-01',
    );
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.suggestedAmount).toBe(0);
    }
  });

  it('clamps a sub-one-period gap up to a minimum of 1 period, not a fractional divisor', () => {
    // Target date is one day away with a monthly cadence -- still needs
    // at least one (large) contribution, not "0.03 periods".
    const result = computeSuggestedContribution(
      0,
      10000,
      '2026-08-02',
      { type: 'monthly' },
      '2026-08-01',
    );
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.periodsRemaining).toBe(1);
      expect(result.suggestedAmount).toBe(10000);
    }
  });

  // Explicit edge case per task spec: a target date that has already
  // passed, or is today, must not silently divide by zero/a negative
  // number and return a nonsensical (Infinity/NaN/negative) suggestion.
  it('returns a distinct target-date-passed result when the target date is today', () => {
    const result = computeSuggestedContribution(
      100000,
      300000,
      '2026-08-01',
      { type: 'monthly' },
      '2026-08-01',
    );
    expect(result.status).toBe('target-date-passed');
    if (result.status === 'target-date-passed') {
      expect(result.shortfall).toBe(200000);
    }
  });

  it('returns a distinct target-date-passed result when the target date is in the past', () => {
    const result = computeSuggestedContribution(
      100000,
      300000,
      '2026-01-01',
      { type: 'monthly' },
      '2026-08-01',
    );
    expect(result.status).toBe('target-date-passed');
    if (result.status === 'target-date-passed') {
      expect(result.shortfall).toBe(200000);
    }
  });

  it('a passed target date whose balance already exceeds the target has a shortfall clamped to 0', () => {
    const result = computeSuggestedContribution(
      400000,
      300000,
      '2026-01-01',
      { type: 'monthly' },
      '2026-08-01',
    );
    expect(result.status).toBe('target-date-passed');
    if (result.status === 'target-date-passed') {
      expect(result.shortfall).toBe(0);
    }
  });

  it('never produces Infinity or NaN for any past/today/future target date', () => {
    for (const targetDate of ['2020-01-01', '2026-08-01', '2030-01-01']) {
      const result = computeSuggestedContribution(
        1000,
        500000,
        targetDate,
        { type: 'weekly' },
        '2026-08-01',
      );
      if (result.status === 'ok') {
        expect(Number.isFinite(result.suggestedAmount)).toBe(true);
        expect(Number.isFinite(result.periodsRemaining)).toBe(true);
        expect(result.periodsRemaining).toBeGreaterThan(0);
      } else {
        expect(Number.isFinite(result.shortfall)).toBe(true);
      }
    }
  });
});
