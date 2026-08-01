import { differenceInCalendarDays, parseISO } from 'date-fns';

import type { IntegerAmount } from '#shared/util';
import type { Cadence, SuggestedContributionResult } from '#types/models';

/**
 * The shared cadence primitive's arithmetic (CLAUDE.md "Envelope goal
 * types" -- one `Cadence` concept reused by both the recurring goal's
 * ongoing cadence and a dated goal's contribution cadence, not two
 * near-duplicate implementations). Everything here is pure and
 * synchronous -- no DB access -- so it's safe to call from both the
 * months-covered and suggested-contribution calculations below.
 */

/**
 * The average length, in days, of one period at this cadence. Uses
 * 365.25 (accounts for leap years) as the days-per-year baseline for
 * every non-custom cadence, since none of these are calendar-anchored
 * (unlike, say, a bill due "the 1st of every month") -- they're pure
 * period lengths for normalization/division, not calendar navigation.
 */
export function cadenceLengthInDays(cadence: Cadence): number {
  switch (cadence.type) {
    case 'weekly':
      return 7;
    case 'monthly':
      return 365.25 / 12;
    case 'quarterly':
      return 365.25 / 4;
    case 'annual':
      return 365.25;
    case 'custom':
      return cadence.days;
    default: {
      const exhaustiveCheck: never = cadence;
      throw new Error(
        `cadenceLengthInDays: unknown cadence: ${String(exhaustiveCheck)}`,
      );
    }
  }
}

/** How many periods of this cadence occur, on average, in one year. */
export function periodsPerYear(cadence: Cadence): number {
  return 365.25 / cadenceLengthInDays(cadence);
}

/**
 * Normalizes an amount denominated per `cadence` period into its
 * monthly-equivalent value -- e.g. a quarterly target of $300 is a $100/
 * month-equivalent. Used by `computeMonthsCovered` so a recurring goal's
 * months-covered indicator is meaningful regardless of what cadence the
 * goal itself is configured with.
 */
export function monthlyEquivalentAmount(
  amount: IntegerAmount,
  cadence: Cadence,
): number {
  return (amount * periodsPerYear(cadence)) / 12;
}

/**
 * The number of whole-or-fractional periods of `cadence` between two
 * plain ISO 'YYYY-MM-DD' dates. Positive when `toDate` is after
 * `fromDate`, negative when it's before, zero when they're the same day.
 * Purely a date-arithmetic primitive -- callers decide how to round/clamp
 * the result (see `computeSuggestedContribution` for the one place that
 * needs to).
 */
export function periodsBetween(
  fromDate: string,
  toDate: string,
  cadence: Cadence,
): number {
  const days = differenceInCalendarDays(parseISO(toDate), parseISO(fromDate));
  return days / cadenceLengthInDays(cadence);
}

/**
 * The months-covered indicator for a recurring goal (CLAUDE.md: "current
 * balance / recurring target = how many future months this envelope can
 * already handle"). Pure function -- callers are responsible for reading
 * the envelope's CURRENT real balance immediately before calling this
 * (see `server/envelopes/goals.ts`'s `getEnvelopeMonthsCovered`) so the
 * result is always live, never a stale cached figure.
 *
 * Not clamped to a minimum of zero: a negative result communicates "this
 * envelope is N months behind" (a negative real balance is allowed,
 * if discouraged, per CLAUDE.md "Envelope rules") -- it's the caller/UI's
 * job to decide how to present that, not this function's.
 *
 * Returns 0 (rather than Infinity/NaN) for a non-positive target amount
 * or a cadence that normalizes to a non-positive monthly-equivalent --
 * there's nothing meaningful to divide by, so "0 months covered" is the
 * sane, explicit answer rather than an undefined one.
 */
export function computeMonthsCovered(
  balance: IntegerAmount,
  targetAmount: IntegerAmount,
  cadence: Cadence,
): number {
  if (targetAmount <= 0) {
    return 0;
  }
  const monthlyEquivalent = monthlyEquivalentAmount(targetAmount, cadence);
  if (monthlyEquivalent <= 0) {
    return 0;
  }
  return balance / monthlyEquivalent;
}

/**
 * The suggested per-period contribution for a dated goal (CLAUDE.md:
 * "(target amount - current balance) / periods remaining ... at the
 * goal's configured contribution cadence"). Pure function -- callers are
 * responsible for reading the envelope's CURRENT real balance immediately
 * before calling this (see `server/envelopes/goals.ts`'s
 * `getEnvelopeSuggestedContribution`) so the result is always live.
 *
 * Explicitly handles a target date that has already passed, or is today
 * (zero days remaining): rather than dividing by a zero-or-negative
 * periods-remaining and returning Infinity/NaN/a negative "suggestion",
 * this returns a distinct `{ status: 'target-date-passed' }` result
 * carrying the full remaining shortfall, so the caller can show something
 * meaningful ("this goal's date has passed -- you still need $X") instead
 * of a nonsensical number.
 *
 * For a still-future target date, `periodsRemaining` is rounded UP to a
 * whole number of periods and clamped to a minimum of 1 -- e.g. a target
 * date one day away with a monthly cadence still needs at least one
 * (large) contribution, not a fractional "0.03 periods" divisor.
 */
export function computeSuggestedContribution(
  currentBalance: IntegerAmount,
  targetAmount: IntegerAmount,
  targetDate: string,
  cadence: Cadence,
  asOf: string,
): SuggestedContributionResult {
  const shortfall = Math.max(0, targetAmount - currentBalance);

  const daysRemaining = differenceInCalendarDays(
    parseISO(targetDate),
    parseISO(asOf),
  );
  if (daysRemaining <= 0) {
    return { status: 'target-date-passed', shortfall };
  }

  const rawPeriodsRemaining = daysRemaining / cadenceLengthInDays(cadence);
  const periodsRemaining = Math.max(1, Math.ceil(rawPeriodsRemaining));
  const suggestedAmount = Math.round(shortfall / periodsRemaining);

  return { status: 'ok', suggestedAmount, periodsRemaining };
}
