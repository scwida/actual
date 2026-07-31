import { createApp } from '#server/app';
import { mutator } from '#server/mutators';
import { undoable } from '#server/undo';
import type { IntegerAmount } from '#shared/util';
import type { CategoryEntity } from '#types/models';

import { recomputeEnvelopeBalances } from './balances';
import type { EnvelopeEngineCutoverResult } from './cutover';
import { runEnvelopeEngineCutover } from './cutover';
import { applyMovement, previewMovement } from './movement';
import {
  cancelPaycheck,
  createPlannedPaycheck,
  matchTransaction,
  updateDraftAllocation,
} from './planner/actions';
import type { CommitPaycheckResult } from './planner/commit';
import { commitPaycheck } from './planner/commit';
import type { PlannedPaycheck } from './planner/types';

export type EnvelopeHandlers = {
  'envelope/apply-movement': typeof applyMovement;
  'envelope/preview-movement': typeof previewMovement;
  'envelope/recompute-balances': typeof recomputeBalancesHandler;
  'envelope/run-cutover': typeof runCutoverHandler;
  'envelope/planner/create-paycheck': typeof createPlannedPaycheck;
  'envelope/planner/update-draft-allocation': typeof updateDraftAllocation;
  'envelope/planner/cancel-paycheck': typeof cancelPaycheck;
  'envelope/planner/match-transaction': typeof matchTransaction;
  'envelope/planner/commit-paycheck': typeof commitPaycheckHandler;
};

export const app = createApp<EnvelopeHandlers>();

app.method('envelope/apply-movement', mutator(undoable(applyMovement)));
app.method('envelope/preview-movement', previewMovement);
app.method(
  'envelope/recompute-balances',
  mutator(undoable(recomputeBalancesHandler)),
);
app.method('envelope/run-cutover', mutator(undoable(runCutoverHandler)));
app.method(
  'envelope/planner/create-paycheck',
  mutator(undoable(createPlannedPaycheck)),
);
app.method(
  'envelope/planner/update-draft-allocation',
  mutator(undoable(updateDraftAllocation)),
);
app.method(
  'envelope/planner/cancel-paycheck',
  mutator(undoable(cancelPaycheck)),
);
app.method(
  'envelope/planner/match-transaction',
  mutator(undoable(matchTransaction)),
);
app.method(
  'envelope/planner/commit-paycheck',
  mutator(undoable(commitPaycheckHandler)),
);

// Repair handler: envelope_balances is a cache, always rebuildable from
// envelope_ledger. Exposed explicitly rather than run automatically.
async function recomputeBalancesHandler({
  envelopeIds,
}: {
  envelopeIds?: Array<CategoryEntity['id']>;
} = {}): Promise<Record<string, IntegerAmount>> {
  return recomputeEnvelopeBalances(envelopeIds);
}

// One-time operational step (not run automatically on load) -- see
// cutover.ts for the policy this implements.
async function runCutoverHandler(): Promise<EnvelopeEngineCutoverResult> {
  return runEnvelopeEngineCutover();
}

async function commitPaycheckHandler({
  plannedPaycheckId,
  approvedAmounts,
}: {
  plannedPaycheckId: PlannedPaycheck['id'];
  approvedAmounts: Record<CategoryEntity['id'], IntegerAmount>;
}): Promise<CommitPaycheckResult> {
  return commitPaycheck(plannedPaycheckId, approvedAmounts);
}
