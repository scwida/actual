import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as db from '#server/db';
import type { EnvelopeGoal, SetEnvelopeGoalInput } from '#types/models';

import {
  fromDbGoal,
  getEnvelopeGoal,
  getEnvelopeMonthsCovered,
  getEnvelopeSuggestedContribution,
  setEnvelopeGoal,
} from './goals';
import { applyMovement } from './movement';

describe('envelope goals', () => {
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
    await db.insertAccount({ id: 'acct1', name: 'Checking', offbudget: 0 });
  }

  describe('fromDbGoal (row <-> discriminated-union mapping)', () => {
    it('maps a missing row to {type: "none"}', () => {
      expect(fromDbGoal('envA', null)).toEqual({ type: 'none' });
    });

    it('maps a recurring row', () => {
      const goal = fromDbGoal('envA', {
        id: 'envA',
        goal_type: 'recurring',
        target_amount: 8500,
        cadence_type: 'monthly',
        cadence_custom_days: null,
        target_date: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        tombstone: 0,
      });
      expect(goal).toEqual({
        type: 'recurring',
        envelopeId: 'envA',
        targetAmount: 8500,
        cadence: { type: 'monthly' },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('maps a dated row, including a custom cadence', () => {
      const goal = fromDbGoal('envA', {
        id: 'envA',
        goal_type: 'dated',
        target_amount: 300000,
        cadence_type: 'custom',
        cadence_custom_days: 10,
        target_date: '2026-12-25',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        tombstone: 0,
      });
      expect(goal).toEqual({
        type: 'dated',
        envelopeId: 'envA',
        targetAmount: 300000,
        targetDate: '2026-12-25',
        contributionCadence: { type: 'custom', days: 10 },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    });

    // This is the "structurally unrepresentable" check the task calls for
    // at the mapping-function level: there is no row shape that can
    // legally produce an object satisfying BOTH RecurringEnvelopeGoal AND
    // DatedEnvelopeGoal at once. `EnvelopeGoal`'s `type` discriminant
    // means TypeScript itself rejects any attempt to construct such a
    // value -- verified here by exhaustively checking that every possible
    // mapped result narrows to exactly one of the three variants, never a
    // union of more than one at the same time.
    it('every possible mapped goal narrows to exactly one variant, never a hybrid', () => {
      const goals: EnvelopeGoal[] = [
        fromDbGoal('envA', null),
        fromDbGoal('envA', {
          id: 'envA',
          goal_type: 'recurring',
          target_amount: 100,
          cadence_type: 'weekly',
          cadence_custom_days: null,
          target_date: null,
          created_at: 'x',
          updated_at: 'x',
          tombstone: 0,
        }),
        fromDbGoal('envA', {
          id: 'envA',
          goal_type: 'dated',
          target_amount: 100,
          cadence_type: 'weekly',
          cadence_custom_days: null,
          target_date: '2026-01-01',
          created_at: 'x',
          updated_at: 'x',
          tombstone: 0,
        }),
      ];

      for (const goal of goals) {
        // A discriminated union member can only ever have the fields of
        // its own variant -- 'targetDate'/'contributionCadence' can never
        // coexist with a 'recurring' type, and 'cadence' can never
        // coexist with a 'dated' type. Runtime-check this since TS's own
        // structural guarantee only prevents *constructing* an
        // ill-typed value in code, not a hand-built object slipping past
        // (e.g. from an untyped JSON boundary).
        const keys = Object.keys(goal).sort();
        if (goal.type === 'none') {
          expect(keys).toEqual(['type']);
        } else if (goal.type === 'recurring') {
          expect(keys).toContain('cadence');
          expect(keys).not.toContain('targetDate');
          expect(keys).not.toContain('contributionCadence');
        } else if (goal.type === 'dated') {
          expect(keys).toContain('targetDate');
          expect(keys).toContain('contributionCadence');
          expect(keys).not.toContain('cadence');
        }
      }
    });

    it('throws on a dated row with a missing target_date rather than silently returning a bad goal', () => {
      expect(() =>
        fromDbGoal('envA', {
          id: 'envA',
          goal_type: 'dated',
          target_amount: 100,
          cadence_type: 'monthly',
          cadence_custom_days: null,
          target_date: null,
          created_at: 'x',
          updated_at: 'x',
          tombstone: 0,
        }),
      ).toThrow(/missing target_date/);
    });
  });

  describe('setEnvelopeGoal / getEnvelopeGoal round trip', () => {
    it('defaults to no goal', async () => {
      await setupEnvelope();
      expect(getEnvelopeGoal('envA')).toEqual({ type: 'none' });
    });

    it('sets, reads back, and clears a recurring goal', async () => {
      await setupEnvelope();

      const input: SetEnvelopeGoalInput = {
        type: 'recurring',
        targetAmount: 8500,
        cadence: { type: 'monthly' },
      };
      const created = await setEnvelopeGoal('envA', input);
      expect(created.type).toBe('recurring');

      const read = getEnvelopeGoal('envA');
      expect(read).toMatchObject({
        type: 'recurring',
        envelopeId: 'envA',
        targetAmount: 8500,
        cadence: { type: 'monthly' },
      });

      const cleared = await setEnvelopeGoal('envA', { type: 'none' });
      expect(cleared).toEqual({ type: 'none' });
      expect(getEnvelopeGoal('envA')).toEqual({ type: 'none' });
    });

    it('sets, reads back, and replaces a dated goal with a recurring one', async () => {
      await setupEnvelope();

      await setEnvelopeGoal('envA', {
        type: 'dated',
        targetAmount: 300000,
        targetDate: '2026-12-25',
        contributionCadence: { type: 'monthly' },
      });
      expect(getEnvelopeGoal('envA')).toMatchObject({
        type: 'dated',
        targetDate: '2026-12-25',
      });

      // An envelope can have one type or the other, never both -- setting
      // a recurring goal on an envelope that already has a dated one
      // replaces it outright, it doesn't add a second row.
      await setEnvelopeGoal('envA', {
        type: 'recurring',
        targetAmount: 8500,
        cadence: { type: 'weekly' },
      });
      const goal = getEnvelopeGoal('envA');
      expect(goal.type).toBe('recurring');

      const rows = await db.all<db.DbEnvelopeGoal>(
        'SELECT * FROM envelope_goal WHERE id = ?',
        ['envA'],
      );
      expect(rows).toHaveLength(1);
    });

    it('re-setting a goal after clearing it reactivates the (tombstoned) row rather than erroring', async () => {
      await setupEnvelope();

      await setEnvelopeGoal('envA', {
        type: 'recurring',
        targetAmount: 8500,
        cadence: { type: 'monthly' },
      });
      await setEnvelopeGoal('envA', { type: 'none' });
      expect(getEnvelopeGoal('envA')).toEqual({ type: 'none' });

      await setEnvelopeGoal('envA', {
        type: 'dated',
        targetAmount: 100000,
        targetDate: '2027-01-01',
        contributionCadence: { type: 'annual' },
      });
      expect(getEnvelopeGoal('envA')).toMatchObject({
        type: 'dated',
        targetAmount: 100000,
      });
    });

    it('rejects a non-positive target amount', async () => {
      await setupEnvelope();
      await expect(
        setEnvelopeGoal('envA', {
          type: 'recurring',
          targetAmount: 0,
          cadence: { type: 'monthly' },
        }),
      ).rejects.toThrow(/targetAmount must be a positive integer/);
    });

    it('rejects a malformed target date', async () => {
      await setupEnvelope();
      await expect(
        setEnvelopeGoal('envA', {
          type: 'dated',
          targetAmount: 1000,
          targetDate: 'not-a-date',
          contributionCadence: { type: 'monthly' },
        }),
      ).rejects.toThrow(/plain ISO/);
    });

    it('rejects an unknown envelope', async () => {
      await expect(
        setEnvelopeGoal('does-not-exist', {
          type: 'recurring',
          targetAmount: 1000,
          cadence: { type: 'monthly' },
        }),
      ).rejects.toThrow(/envelope not found/);
    });

    // Core invariant check: setting a goal is metadata-only and must
    // never be able to move real money or affect the ledger-ceiling
    // invariant, since it never calls `applyMovement`.
    it('never writes to envelope_ledger or envelope_balances', async () => {
      await setupEnvelope();

      await setEnvelopeGoal('envA', {
        type: 'dated',
        targetAmount: 300000,
        targetDate: '2026-12-25',
        contributionCadence: { type: 'monthly' },
      });
      await setEnvelopeGoal('envA', { type: 'none' });
      await setEnvelopeGoal('envA', {
        type: 'recurring',
        targetAmount: 8500,
        cadence: { type: 'monthly' },
      });

      const ledgerRows = await db.all('SELECT * FROM envelope_ledger');
      const balanceRows = await db.all('SELECT * FROM envelope_balances');
      expect(ledgerRows).toHaveLength(0);
      expect(balanceRows).toHaveLength(0);
    });
  });

  describe('getEnvelopeMonthsCovered (live from real balance)', () => {
    it('returns null when the envelope has no recurring goal', async () => {
      await setupEnvelope();
      expect(getEnvelopeMonthsCovered('envA')).toBeNull();

      await setEnvelopeGoal('envA', {
        type: 'dated',
        targetAmount: 100000,
        targetDate: '2027-01-01',
        contributionCadence: { type: 'monthly' },
      });
      expect(getEnvelopeMonthsCovered('envA')).toBeNull();
    });

    it("is computed live from the envelope's current real balance, not a stale snapshot", async () => {
      await setupEnvelope();
      await setEnvelopeGoal('envA', {
        type: 'recurring',
        targetAmount: 8500,
        cadence: { type: 'monthly' },
      });

      expect(getEnvelopeMonthsCovered('envA')).toBe(0);

      const txnId = await db.insertTransaction({
        account: 'acct1',
        amount: 17000,
        date: '2026-01-01',
      });
      await applyMovement({
        type: 'fund',
        envelope: 'envA',
        amount: 17000,
        transactionId: txnId,
        counterparty: { account: 'acct1' },
        date: '2026-01-01',
      });

      // $170 balance / $85-a-month target = 2 months covered, reflecting
      // the just-applied real fund with no separate recompute step.
      expect(getEnvelopeMonthsCovered('envA')).toBeCloseTo(2, 6);
    });
  });

  describe('getEnvelopeSuggestedContribution (live from real balance)', () => {
    it('returns null when the envelope has no dated goal', async () => {
      await setupEnvelope();
      expect(getEnvelopeSuggestedContribution('envA', '2026-08-01')).toBeNull();
    });

    it('reflects the current real balance and the configured cadence', async () => {
      await setupEnvelope();
      await setEnvelopeGoal('envA', {
        type: 'dated',
        targetAmount: 300000,
        targetDate: '2026-10-30',
        contributionCadence: { type: 'custom', days: 30 },
      });

      const txnId = await db.insertTransaction({
        account: 'acct1',
        amount: 60000,
        date: '2026-08-01',
      });
      await applyMovement({
        type: 'fund',
        envelope: 'envA',
        amount: 60000,
        transactionId: txnId,
        counterparty: { account: 'acct1' },
        date: '2026-08-01',
      });

      const result = getEnvelopeSuggestedContribution('envA', '2026-08-01');
      expect(result).toEqual({
        status: 'ok',
        suggestedAmount: 80000,
        periodsRemaining: 3,
      });
    });

    it('flags a passed target date instead of a nonsensical suggestion', async () => {
      await setupEnvelope();
      await setEnvelopeGoal('envA', {
        type: 'dated',
        targetAmount: 300000,
        targetDate: '2026-01-01',
        contributionCadence: { type: 'monthly' },
      });

      const result = getEnvelopeSuggestedContribution('envA', '2026-08-01');
      expect(result).toEqual({
        status: 'target-date-passed',
        shortfall: 300000,
      });
    });
  });
});
