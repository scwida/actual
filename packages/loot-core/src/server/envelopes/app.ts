import { createApp } from '#server/app';
import { mutator } from '#server/mutators';
import { undoable } from '#server/undo';
import type { IntegerAmount } from '#shared/util';
import type {
  CategoryEntity,
  EnvelopeGoal,
  SetEnvelopeGoalInput,
  SuggestedContributionResult,
} from '#types/models';

import { recomputeEnvelopeBalances } from './balances';
import type { EnvelopeEngineCutoverResult } from './cutover';
import { runEnvelopeEngineCutover } from './cutover';
import {
  getEnvelopeGoal,
  getEnvelopeMonthsCovered,
  getEnvelopeSuggestedContribution,
  setEnvelopeGoal,
} from './goals';
import { applyMovement, previewMovement } from './movement';
import {
  cancelPaycheck,
  createPlannedPaycheck,
  matchTransaction,
  updateDraftAllocation,
  updateDraftPaycheck,
} from './planner/actions';
import type {
  CommitPaycheckResult,
  SuggestedReduction,
} from './planner/commit';
import { commitPaycheck, previewCommitPaycheck } from './planner/commit';
import type { PlannedPaycheck } from './planner/types';
import { getEnvelopeAverageMonthlySpend } from './spending-history';

export type EnvelopeHandlers = {
  'envelope/apply-movement': typeof applyMovement;
  'envelope/preview-movement': typeof previewMovement;
  'envelope/recompute-balances': typeof recomputeBalancesHandler;
  'envelope/run-cutover': typeof runCutoverHandler;
  'envelope/planner/create-paycheck': typeof createPlannedPaycheck;
  'envelope/planner/update-draft-allocation': typeof updateDraftAllocation;
  'envelope/planner/update-draft-paycheck': typeof updateDraftPaycheck;
  'envelope/planner/cancel-paycheck': typeof cancelPaycheck;
  'envelope/planner/match-transaction': typeof matchTransaction;
  'envelope/planner/commit-paycheck': typeof commitPaycheckHandler;
  'envelope/planner/preview-commit': typeof previewCommitPaycheckHandler;
  'envelope/goal/get': typeof getEnvelopeGoalHandler;
  'envelope/goal/set': typeof setEnvelopeGoalHandler;
  'envelope/goal/months-covered': typeof getEnvelopeMonthsCoveredHandler;
  'envelope/goal/suggested-contribution': typeof getEnvelopeSuggestedContributionHandler;
  'envelope/goal/average-monthly-spend': typeof getEnvelopeAverageMonthlySpendHandler;
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
  'envelope/planner/update-draft-paycheck',
  mutator(undoable(updateDraftPaycheck)),
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
app.method('envelope/planner/preview-commit', previewCommitPaycheckHandler);
app.method('envelope/goal/get', getEnvelopeGoalHandler);
app.method('envelope/goal/set', mutator(undoable(setEnvelopeGoalHandler)));
app.method('envelope/goal/months-covered', getEnvelopeMonthsCoveredHandler);
app.method(
  'envelope/goal/suggested-contribution',
  getEnvelopeSuggestedContributionHandler,
);
app.method(
  'envelope/goal/average-monthly-spend',
  getEnvelopeAverageMonthlySpendHandler,
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

// Read-only: lets a review screen show the same suggested reduction
// `commitPaycheck` would use, without writing anything. Thin wrapper
// around the same pure `computeSuggestedReduction` function `commitPaycheck`
// calls internally, so preview and commit can never drift apart.
async function previewCommitPaycheckHandler({
  plannedPaycheckId,
}: {
  plannedPaycheckId: PlannedPaycheck['id'];
}): Promise<SuggestedReduction> {
  return previewCommitPaycheck(plannedPaycheckId);
}

// Read-only: an envelope's current goal configuration (or `{type:'none'}`
// if it has none). See CLAUDE.md "Envelope goal types".
async function getEnvelopeGoalHandler({
  envelopeId,
}: {
  envelopeId: CategoryEntity['id'];
}): Promise<EnvelopeGoal> {
  return getEnvelopeGoal(envelopeId);
}

// Creates, replaces, or clears (`{type:'none'}`) an envelope's goal.
// Writes ONLY `envelope_goal` metadata -- see `goals.ts`'s module doc
// comment for why this can never touch/violate the real-balance ledger-
// ceiling invariant.
async function setEnvelopeGoalHandler({
  envelopeId,
  goal,
}: {
  envelopeId: CategoryEntity['id'];
  goal: SetEnvelopeGoalInput;
}): Promise<EnvelopeGoal> {
  return setEnvelopeGoal(envelopeId, goal);
}

// Read-only, always recomputed live from the envelope's current real
// balance -- see `goals.ts`'s `getEnvelopeMonthsCovered`. `null` if the
// envelope has no recurring goal.
async function getEnvelopeMonthsCoveredHandler({
  envelopeId,
}: {
  envelopeId: CategoryEntity['id'];
}): Promise<number | null> {
  return getEnvelopeMonthsCovered(envelopeId);
}

// Read-only, always recomputed live from the envelope's current real
// balance -- see `goals.ts`'s `getEnvelopeSuggestedContribution`. `null`
// if the envelope has no dated goal.
async function getEnvelopeSuggestedContributionHandler({
  envelopeId,
  asOf,
}: {
  envelopeId: CategoryEntity['id'];
  asOf?: string;
}): Promise<SuggestedContributionResult | null> {
  return asOf !== undefined
    ? getEnvelopeSuggestedContribution(envelopeId, asOf)
    : getEnvelopeSuggestedContribution(envelopeId);
}

// Read-only: an envelope's trailing average monthly spend, for the
// recurring-goal setup's historical-spending suggested default (and, per
// CLAUDE.md roadmap item 10, reusable later by a standalone
// spending-trends report) -- see `spending-history.ts`.
async function getEnvelopeAverageMonthlySpendHandler({
  envelopeId,
  monthsWindow,
}: {
  envelopeId: CategoryEntity['id'];
  monthsWindow?: number;
}): Promise<IntegerAmount> {
  return monthsWindow !== undefined
    ? getEnvelopeAverageMonthlySpend(envelopeId, monthsWindow)
    : getEnvelopeAverageMonthlySpend(envelopeId);
}
