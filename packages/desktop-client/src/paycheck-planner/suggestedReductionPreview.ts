import type {
  PlannedAllocation,
  PlannedPaycheck,
} from '@actual-app/core/server/envelopes/planner/types';
import type { IntegerAmount } from '@actual-app/core/shared/util';
import type { CategoryEntity } from '@actual-app/core/types/models';

export type SuggestedReductionPreview = {
  shortfallAmount: IntegerAmount;
  suggested: Record<CategoryEntity['id'], IntegerAmount>;
};

/**
 * DISPLAY-ONLY PREVIEW. This is a deliberate, hand-kept mirror of
 * `computeSuggestedReduction` in
 * `packages/loot-core/src/server/envelopes/planner/commit.ts`.
 *
 * There is currently no read-only backend handler exposed for this
 * calculation -- only the mutating `commitPaycheck` (which calls the real
 * function internally as part of actually moving money). This is a known
 * backend gap flagged for `engine-architect`: a real
 * `envelope/planner/preview-commit` read-only handler would let the review
 * screen and the enforcement path share one implementation instead of two
 * hand-synced copies.
 *
 * IMPORTANT: this function has zero authority over what actually gets
 * committed. `commitPaycheck` on the server independently recomputes the
 * exact same thing from the real `planned_allocation` rows at the moment
 * of commit. If this copy is ever out of sync with the server's, the only
 * consequence is a wrong-looking suggestion in the review UI -- never an
 * incorrect commit, since the server re-derives and re-validates
 * everything itself (see `commitPaycheck`'s doc comment).
 */
export function previewSuggestedReduction(
  paycheck: Pick<PlannedPaycheck, 'actual_amount' | 'expected_amount'>,
  allocations: ReadonlyArray<
    Pick<PlannedAllocation, 'envelope_id' | 'amount' | 'drafted_at'>
  >,
): SuggestedReductionPreview {
  const totalDrafted = allocations.reduce((sum, a) => sum + a.amount, 0);
  const actualAmount = paycheck.actual_amount ?? paycheck.expected_amount;
  const shortfallAmount = Math.max(0, totalDrafted - actualAmount);

  const suggested: Record<CategoryEntity['id'], IntegerAmount> = {};
  for (const allocation of allocations) {
    suggested[allocation.envelope_id] = allocation.amount;
  }

  if (shortfallAmount === 0) {
    return { shortfallAmount, suggested };
  }

  const reductionOrder = [...allocations].sort((a, b) => {
    if (a.drafted_at !== b.drafted_at) {
      return a.drafted_at < b.drafted_at ? 1 : -1;
    }
    return a.envelope_id < b.envelope_id ? 1 : -1;
  });

  let remaining = shortfallAmount;
  for (const allocation of reductionOrder) {
    if (remaining <= 0) {
      break;
    }
    const reduceBy = Math.min(allocation.amount, remaining);
    suggested[allocation.envelope_id] = allocation.amount - reduceBy;
    remaining -= reduceBy;
  }

  return { shortfallAmount, suggested };
}
