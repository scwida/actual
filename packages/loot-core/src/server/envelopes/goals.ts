import * as db from '#server/db';
import type { IntegerAmount } from '#shared/util';
import type {
  Cadence,
  CategoryEntity,
  EnvelopeGoal,
  SetEnvelopeGoalInput,
  SuggestedContributionResult,
} from '#types/models';

import { getEnvelopeBalance } from './balances';
import { computeMonthsCovered, computeSuggestedContribution } from './cadence';

/**
 * Read/write access to a single envelope's goal configuration (CLAUDE.md
 * "Envelope goal types"). Everything in this file writes ONLY
 * `envelope_goal` metadata -- it never calls `applyMovement` and never
 * touches `envelope_ledger`/`envelope_balances`, so it cannot affect (and
 * can never violate) the real-balance ledger-ceiling invariant that
 * governs actual money movement. The only DB reads outside `envelope_goal`
 * itself are `getEnvelopeBalance` (a plain cache read, not a write) inside
 * the two "live" calculations below.
 */

function envelopeExists(envelopeId: CategoryEntity['id']): boolean {
  return (
    db.firstSync<Pick<db.DbCategory, 'id'>>(
      'SELECT id FROM categories WHERE id = ? AND tombstone = 0',
      [envelopeId],
    ) != null
  );
}

function toDbCadence(cadence: Cadence): {
  cadence_type: db.DbEnvelopeCadenceType;
  cadence_custom_days: number | null;
} {
  if (cadence.type === 'custom') {
    if (!Number.isInteger(cadence.days) || cadence.days <= 0) {
      throw new Error(
        `setEnvelopeGoal: custom cadence days must be a positive integer, got: ${cadence.days}`,
      );
    }
    return { cadence_type: 'custom', cadence_custom_days: cadence.days };
  }
  return { cadence_type: cadence.type, cadence_custom_days: null };
}

function fromDbCadence(
  cadenceType: db.DbEnvelopeCadenceType,
  customDays: number | null | undefined,
): Cadence {
  if (cadenceType === 'custom') {
    if (!customDays || customDays <= 0) {
      throw new Error(
        'fromDbCadence: a custom-cadence row is missing a positive cadence_custom_days',
      );
    }
    return { type: 'custom', days: customDays };
  }
  return { type: cadenceType };
}

/**
 * Maps a DB row (or its absence) to the discriminated-union shape every
 * caller actually consumes. No row -- or a tombstoned one, since
 * `getEnvelopeGoalRow` already filters those out -- always maps to
 * `{ type: 'none' }`. See the migration's doc comment for why "no goal"
 * is represented by absence rather than a literal 'none' `goal_type`
 * value.
 */
export function fromDbGoal(
  envelopeId: CategoryEntity['id'],
  row: db.DbEnvelopeGoal | null,
): EnvelopeGoal {
  if (!row) {
    return { type: 'none' };
  }

  const cadence = fromDbCadence(row.cadence_type, row.cadence_custom_days);

  switch (row.goal_type) {
    case 'recurring':
      return {
        type: 'recurring',
        envelopeId,
        targetAmount: row.target_amount,
        cadence,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    case 'dated': {
      if (!row.target_date) {
        throw new Error(
          `fromDbGoal: dated goal row for envelope ${envelopeId} is missing target_date`,
        );
      }
      return {
        type: 'dated',
        envelopeId,
        targetAmount: row.target_amount,
        targetDate: row.target_date,
        contributionCadence: cadence,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }
    default: {
      const exhaustiveCheck: never = row.goal_type;
      throw new Error(
        `fromDbGoal: unknown goal_type: ${String(exhaustiveCheck)}`,
      );
    }
  }
}

export function getEnvelopeGoalRow(
  envelopeId: CategoryEntity['id'],
): db.DbEnvelopeGoal | null {
  return (
    db.firstSync<db.DbEnvelopeGoal>(
      'SELECT * FROM envelope_goal WHERE id = ? AND tombstone = 0',
      [envelopeId],
    ) ?? null
  );
}

/**
 * Reads an envelope's current goal configuration. Pure read.
 */
export function getEnvelopeGoal(
  envelopeId: CategoryEntity['id'],
): EnvelopeGoal {
  return fromDbGoal(envelopeId, getEnvelopeGoalRow(envelopeId));
}

function validateTargetAmount(targetAmount: IntegerAmount): void {
  if (!Number.isInteger(targetAmount) || targetAmount <= 0) {
    throw new Error(
      `setEnvelopeGoal: targetAmount must be a positive integer, got: ${targetAmount}`,
    );
  }
}

function validateTargetDate(targetDate: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new Error(
      `setEnvelopeGoal: targetDate must be a plain ISO 'YYYY-MM-DD' string, got: ${targetDate}`,
    );
  }
}

/**
 * Creates, replaces, or clears (`{ type: 'none' }`) an envelope's goal
 * configuration. An envelope may have a recurring target, a dated goal,
 * or neither -- never both -- enforced structurally by `SetEnvelopeGoalInput`
 * being a discriminated union, not by any runtime "clear the other one"
 * logic here (there is no "other one" to clear: this table holds at most
 * one row per envelope).
 */
export async function setEnvelopeGoal(
  envelopeId: CategoryEntity['id'],
  input: SetEnvelopeGoalInput,
): Promise<EnvelopeGoal> {
  if (!envelopeExists(envelopeId)) {
    throw new Error(
      `setEnvelopeGoal: envelope not found (or deleted): ${envelopeId}`,
    );
  }

  const existing = db.firstSync<Pick<db.DbEnvelopeGoal, 'id'>>(
    'SELECT id FROM envelope_goal WHERE id = ?',
    [envelopeId],
  );

  if (input.type === 'none') {
    if (existing) {
      await db.delete_('envelope_goal', envelopeId);
    }
    return { type: 'none' };
  }

  validateTargetAmount(input.targetAmount);
  if (input.type === 'dated') {
    validateTargetDate(input.targetDate);
  }

  const now = new Date().toISOString();
  const cadence =
    input.type === 'recurring' ? input.cadence : input.contributionCadence;
  const { cadence_type, cadence_custom_days } = toDbCadence(cadence);

  const sharedFields = {
    goal_type: input.type,
    target_amount: input.targetAmount,
    cadence_type,
    cadence_custom_days,
    target_date: input.type === 'dated' ? input.targetDate : null,
    updated_at: now,
  };

  if (existing) {
    await db.updateWithSchema('envelope_goal', {
      id: envelopeId,
      tombstone: false,
      ...sharedFields,
    });
  } else {
    await db.insertWithSchema('envelope_goal', {
      id: envelopeId,
      created_at: now,
      tombstone: false,
      ...sharedFields,
    });
  }

  return getEnvelopeGoal(envelopeId);
}

/**
 * Live months-covered indicator for a recurring goal (CLAUDE.md: "current
 * balance / recurring target = how many future months this envelope can
 * already handle"). Always recomputed from the envelope's CURRENT real
 * balance via `getEnvelopeBalance` -- never cached/stored anywhere.
 * Returns `null` if the envelope has no recurring goal (a dated goal, or
 * no goal at all) -- there is nothing to compute in that case.
 */
export function getEnvelopeMonthsCovered(
  envelopeId: CategoryEntity['id'],
): number | null {
  const goal = getEnvelopeGoal(envelopeId);
  if (goal.type !== 'recurring') {
    return null;
  }
  const balance = getEnvelopeBalance(envelopeId);
  return computeMonthsCovered(balance, goal.targetAmount, goal.cadence);
}

/**
 * Live suggested-contribution figure for a dated goal (CLAUDE.md:
 * "suggested per-paycheck/weekly/monthly contribution to hit it"). Always
 * recomputed from the envelope's CURRENT real balance via
 * `getEnvelopeBalance`. Returns `null` if the envelope has no dated goal.
 *
 * `asOf` defaults to today (plain ISO 'YYYY-MM-DD') but is overridable so
 * callers -- and tests -- can pin "now" explicitly.
 */
export function getEnvelopeSuggestedContribution(
  envelopeId: CategoryEntity['id'],
  asOf: string = new Date().toISOString().slice(0, 10),
): SuggestedContributionResult | null {
  const goal = getEnvelopeGoal(envelopeId);
  if (goal.type !== 'dated') {
    return null;
  }
  const balance = getEnvelopeBalance(envelopeId);
  return computeSuggestedContribution(
    balance,
    goal.targetAmount,
    goal.targetDate,
    goal.contributionCadence,
    asOf,
  );
}
