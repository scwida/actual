import { send } from '@actual-app/core/platform/client/connection';
import type {
  ApplyMovementRequest,
  ApplyMovementResult,
  CategoryEntity,
  NegativeBalanceWarning,
  PreviewMovementResult,
} from '@actual-app/core/types/models';

/**
 * Thin client-side wrappers around the envelope engine's `apply-movement`/
 * `preview-movement` IPC handlers (see
 * `packages/loot-core/src/server/envelopes/movement.ts`). Every
 * budget-table interaction that reroutes an old formula-engine action onto
 * a real envelope-to-envelope transfer (CLAUDE.md "The budget table's
 * allocation cell") goes through these -- never a parallel calculation in
 * the UI layer.
 */
export async function previewEnvelopeMovement(
  request: ApplyMovementRequest,
): Promise<PreviewMovementResult> {
  return send('envelope/preview-movement', request);
}

export async function applyEnvelopeMovement(
  request: ApplyMovementRequest,
): Promise<ApplyMovementResult> {
  return send('envelope/apply-movement', request);
}

/**
 * Surfaces the current negative-balance warning (and suggested cover
 * source, if any) for a single envelope, with no side effects.
 *
 * There is no dedicated IPC handler for "just check this envelope's
 * current warning" -- the engine's own `checkNegativeBalance` (see
 * `movement.ts`) is exported but never registered on `EnvelopeHandlers`,
 * so it isn't reachable from the client. Rather than adding a new IPC
 * handler (out of this task's scope -- see the accompanying report), this
 * reuses the already-exposed `envelope/preview-movement` handler with a
 * zero-amount `fund` request: `previewMovement` computes
 * `resultingBalance = currentBalance + delta` and only ever reads/returns
 * state, so with `amount: 0` the "resulting" balance IS the envelope's
 * actual current balance -- the exact same computation
 * `checkNegativeBalance(envelopeId, 0)` would do internally, just reached
 * through the handler that's already public. `previewMovement` never
 * calls `validateRequest` (see its doc comment in `movement.ts`), so a
 * `fund` shape with no real transaction/account backing is safe to pass
 * here -- nothing about a fund's real-money requirement is enforced by
 * preview, and nothing is written.
 */
export async function getEnvelopeNegativeBalanceWarning(
  envelopeId: CategoryEntity['id'],
  date: string,
): Promise<NegativeBalanceWarning | null> {
  const { warnings } = await previewEnvelopeMovement({
    type: 'fund',
    envelope: envelopeId,
    amount: 0,
    date,
  });
  return warnings.find(warning => warning.envelope === envelopeId) ?? null;
}
