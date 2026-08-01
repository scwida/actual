import type { IntegerAmount } from '#shared/util';

import type { CategoryEntity } from './category';

/**
 * A single, shared cadence primitive reused by BOTH envelope goal types
 * below (CLAUDE.md "Envelope goal types") -- a recurring goal's ongoing
 * cadence (e.g. "$85/month") and a dated goal's suggested-contribution
 * cadence (e.g. "contribute monthly toward this") are the exact same
 * concept, so this is genuinely shared code, not two near-duplicate
 * cadence implementations. `custom` carries an explicit day count since
 * there's no other way to represent an arbitrary period length.
 */
export type Cadence =
  | { type: 'weekly' }
  | { type: 'monthly' }
  | { type: 'quarterly' }
  | { type: 'annual' }
  | { type: 'custom'; days: number };

export type EnvelopeGoalType = 'recurring' | 'dated';

/** The default/most common state -- an envelope with no goal configured. */
export type NoEnvelopeGoal = { type: 'none' };

/**
 * An ongoing amount with no end date (e.g. "$85/month for Internet").
 * Powers the months-covered indicator (`current balance / recurring
 * target amount`, normalized to a monthly-equivalent -- see
 * `server/envelopes/cadence.ts`'s `computeMonthsCovered`). Purely
 * computed/informational -- an envelope with leftover funds from a
 * covered month automatically continues covering into the next, with no
 * explicit "carryover" step, since the balance simply persists.
 */
export type RecurringEnvelopeGoal = {
  type: 'recurring';
  envelopeId: CategoryEntity['id'];
  /** The ongoing target amount per `cadence` period. */
  targetAmount: IntegerAmount;
  cadence: Cadence;
  createdAt: string;
  updatedAt: string;
};

/**
 * A target balance by a target date (e.g. "$3,000 by December" for a
 * vacation), with a suggested per-`contributionCadence` contribution --
 * see `server/envelopes/cadence.ts`'s `computeSuggestedContribution`.
 */
export type DatedEnvelopeGoal = {
  type: 'dated';
  envelopeId: CategoryEntity['id'];
  /** The target balance to reach by `targetDate`. */
  targetAmount: IntegerAmount;
  /** Plain ISO 'YYYY-MM-DD' date string. */
  targetDate: string;
  /** How often a suggested contribution toward this goal is computed. */
  contributionCadence: Cadence;
  createdAt: string;
  updatedAt: string;
};

/**
 * An envelope's current goal configuration -- a genuine discriminated
 * union (CLAUDE.md: "one, the other, or neither; never both at once"),
 * not two independently-nullable fields on one flat type. This makes
 * "both goal types set at once" structurally unrepresentable in code that
 * consumes this type, even though the underlying SQL storage
 * (`envelope_goal`) necessarily has some nullable columns (SQL has no
 * real sum types) -- see `server/envelopes/goals.ts`'s `fromDbGoal` for
 * the mapping between the two.
 */
export type EnvelopeGoal =
  | NoEnvelopeGoal
  | RecurringEnvelopeGoal
  | DatedEnvelopeGoal;

/**
 * Input shape for `setEnvelopeGoal` -- everything derived (the envelope
 * id it's being set on, timestamps) is supplied separately/computed by
 * the write path itself, never by the caller.
 */
export type SetEnvelopeGoalInput =
  | { type: 'none' }
  | { type: 'recurring'; targetAmount: IntegerAmount; cadence: Cadence }
  | {
      type: 'dated';
      targetAmount: IntegerAmount;
      /** Plain ISO 'YYYY-MM-DD' date string. */
      targetDate: string;
      contributionCadence: Cadence;
    };

/**
 * Result of `computeSuggestedContribution`. Explicitly distinguishes a
 * goal whose target date has already passed (or is today, i.e. zero days
 * remaining) from a normal suggestion, rather than dividing by a
 * zero-or-negative periods-remaining and returning a nonsensical
 * (Infinity/NaN/negative) dollar amount.
 */
export type SuggestedContributionResult =
  | {
      status: 'ok';
      suggestedAmount: IntegerAmount;
      periodsRemaining: number;
    }
  | {
      status: 'target-date-passed';
      /** The full remaining amount needed to reach the target, clamped to >= 0. */
      shortfall: IntegerAmount;
    };
