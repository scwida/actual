import type { IntegerAmount } from '#shared/util';
import type { CategoryEntity } from '#types/models';

export type PlannedPaycheckStatus = 'draft' | 'committed' | 'canceled';

/**
 * A planned/forecast paycheck (or other planned income). Draft editing of
 * a planned paycheck and its allocations never touches real envelope
 * balances -- see CLAUDE.md "The Planner, precisely".
 */
export type PlannedPaycheck = {
  id: string;
  status: PlannedPaycheckStatus;
  expected_date: string;
  expected_amount: IntegerAmount;
  created_at: string;
  actual_transaction_id?: string | null;
  actual_amount?: IntegerAmount | null;
  commit_shortfall_amount?: IntegerAmount | null;
  commit_suggested_allocations?: Record<
    CategoryEntity['id'],
    IntegerAmount
  > | null;
  committed_at?: string | null;
};

/**
 * A single envelope's draft allocation within a planned paycheck.
 * `envelope_balance_at_draft` is a fixed snapshot taken when the
 * allocation is first drafted -- it does NOT move when the amount is
 * edited later -- so the UI can compute "how much has this envelope's
 * real balance drifted since I planned this" (CLAUDE.md "Live drift
 * indicators").
 */
export type PlannedAllocation = {
  id: string;
  planned_paycheck_id: PlannedPaycheck['id'];
  envelope_id: CategoryEntity['id'];
  amount: IntegerAmount;
  envelope_balance_at_draft: IntegerAmount;
  drafted_at: string;
  suggested_amount?: IntegerAmount | null;
  approved_amount?: IntegerAmount | null;
};
