import * as db from '#server/db';
import type { IntegerAmount } from '#shared/util';
import type { CategoryEntity, TransactionEntity } from '#types/models';

import { applyMovement } from './movement';
import { getUnallocatedEnvelopeId } from './unallocated';

/**
 * The engine-side hook for CLAUDE.md movement type 2 ("Envelope -> Ledger
 * (spending). Buying something debits an envelope regardless of payment
 * method... the envelope doesn't care how you paid, only whether the
 * money was there."). Before this file existed, assigning a category to a
 * transaction only ever wrote the `category` column -- it never touched
 * `envelope_ledger`/`envelope_balances` (verified by grepping
 * `server/transactions/` and `server/accounts/` for any reference to
 * `applyMovement`/the envelope engine: none existed). The OLD budget
 * engine (`server/budget/`) never needed a hook like this because its
 * "spent" figure was a formula cell that live-recomputed
 * `SUM(amount) ... WHERE category = X` straight from `transactions` on
 * every read (see `server/budget/base.ts`'s `createCategory` /
 * `handleTransactionChange`) -- there was nothing to keep in sync. The
 * new engine's `envelope_balances` cache is NOT derived from
 * `transactions` at all; it is only ever derived from `envelope_ledger`,
 * which is only ever written by `applyMovement`. Without this file,
 * categorizing a transaction had zero effect on any envelope's real
 * balance.
 *
 * A real, alive, negative-amount (outflow) transaction that has never been
 * categorized at all (e.g. freshly bank-imported, before the user assigns
 * it a category) is NOT a no-op here: `getTotalRealLedgerBalance()`
 * (`real-money.ts`) counts every alive on-budget transaction toward the
 * real ledger ceiling regardless of category, so the moment such a row
 * exists, the real ledger total has already dropped by its amount -- and
 * something has to debit a matching envelope or the ceiling invariant
 * breaks immediately. This file debits the reserved Unallocated envelope
 * for exactly that amount as soon as such a transaction is reconciled (see
 * "WHY A NEVER-CATEGORIZED REAL OUTFLOW..." below) -- it is only a genuine
 * no-op for transactions that don't count against the ledger ceiling at
 * all (zero-amount, positive/income-side, parent, or deleted rows).
 *
 * Everything here reuses `applyMovement` as the sole write path (per
 * CLAUDE.md/the engine's own design) -- this file only ever decides
 * *which* movement requests to build, never writes `envelope_ledger` or
 * `envelope_balances` directly.
 *
 * ============================================================================
 * WHY "REVERSE THEN REAPPLY" MUST APPLY THE NEW SPEND *BEFORE* RELEASING
 * THE OLD ONE (a bug found and fixed during this file's own design, not a
 * hypothetical):
 * ============================================================================
 * A first draft of this file modeled "recategorize A -> B" as a single
 * `transfer` movement from A to B. That is WRONG: a `transfer` is an
 * *additional* debit on `from` and credit on `to` -- it does not cancel
 * the original `spend` row's own effect on A's cached balance. Reusing it
 * here would double-debit A (once via the original spend, again via the
 * transfer's `from` leg).
 *
 * The correct compensating primitive for "give an envelope back money it
 * was already debited" is a `fund` movement on that same envelope (a
 * positive delta cancels the spend's negative delta). But `fund` is the
 * one movement type `applyMovement` ceiling-checks
 * (`assertFundBackedByRealMoney`): total envelope balance may never
 * exceed total real ledger money. Naively doing "release old (fund) THEN
 * apply new (spend)" can transiently push the running total above the
 * real ledger ceiling and throw, even though the *net* result of the pair
 * is always valid -- and this is not a rare corner case: it happens any
 * time the budget is fully allocated (envelope total == ledger total),
 * which is the explicit, ordinary goal of zero-based budgeting, not an
 * edge case.
 *
 * The fix is pure ordering, no new primitive: apply the NEW spend FIRST
 * (spend only ever *decreases* the running total, so it can never itself
 * violate the ceiling), THEN release the OLD claim (fund) SECOND. Given
 * the invariant already held before this reconciliation runs (E_before <=
 * L_before, by induction), and that the transaction's own row in
 * `transactions` has already been committed with its final amount/
 * category/tombstone state by the time this hook runs (`db.updateTransaction`
 * / `db.deleteTransaction` inside `batchUpdateTransactions` happen first),
 * doing the spend first guarantees the running total never transiently
 * exceeds what it was immediately before this reconciliation began, which
 * is already known to satisfy the ceiling. See `reconcileSingleTransaction`
 * for where this ordering is applied.
 *
 * ============================================================================
 * WHY A BARE "UNCATEGORIZE" (clear the category, transaction otherwise
 * unchanged and still alive) ROUTES ITS CLAIM TO THE RESERVED UNALLOCATED
 * ENVELOPE VIA A TRANSFER -- NOT A BARE RELEASE, AND NOT LEFT IN PLACE:
 * ============================================================================
 * Deleting a transaction, or editing its amount down (or to non-negative),
 * genuinely frees up room in the real ledger total by that same amount --
 * `getTotalRealLedgerBalance()` already reflects it by the time this hook
 * runs, since the `transactions` row is mutated before this hook is
 * invoked. Releasing the matching envelope claim (via the `fund`-based
 * `releaseClaim` below) in that case is provably always safe (see
 * `currentOutflowAmount`/`releasable` below).
 *
 * Clearing ONLY the category (transaction otherwise unchanged, still a
 * real, alive, unmodified outflow) is different: the real ledger total has
 * NOT moved at all. A bare release with no destination in that case would
 * manufacture envelope credit for a dollar that has already, really, left
 * the ledger for a purchase that still happened -- exactly the class of
 * bug CLAUDE.md's core invariant exists to prevent.
 *
 * Resolved policy (product decision, not re-litigated here): this claim is
 * neither left attributed to its last real envelope nor bare-released.
 * Instead it is moved with an envelope->envelope `transfer` from its
 * current envelope into the reserved Unallocated envelope
 * (`getUnallocatedEnvelopeId()`, see `unallocated.ts`), for the full
 * remaining claim amount -- see `transferClaimToUnallocated`. This reuses
 * `applyMovement`'s existing `type: 'transfer'` primitive rather than a new
 * bare-reversal code path: per `movement.ts`'s `validateRequest`,
 * `assertFundBackedByRealMoney` (this engine's one and only real-money
 * ceiling check) is invoked ONLY for `type: 'fund'` requests -- a
 * `transfer` is validated only for entity existence (`from`/`to` envelopes
 * must exist), never against the ceiling -- so moving a claim this way is
 * exactly as safe as any other envelope-to-envelope transfer already is in
 * this engine, by construction, with no new validation logic required.
 * This also matches how the reserved Unallocated envelope already behaves
 * for any other undestined deposit (CLAUDE.md "How money moves" #4).
 *
 * ============================================================================
 * WHY A NEVER-CATEGORIZED REAL OUTFLOW (no existing claim, no category, but
 * a real alive negative amount) DEBITS UNALLOCATED ON ARRIVAL, NOT A NO-OP:
 * ============================================================================
 * This is the symmetric counterpart to the bare-uncategorize case just
 * above, for the case where there was never a claim to move in the first
 * place. There, an EXISTING claim gets *transferred* to Unallocated,
 * because the money already had a home (some envelope) that needs to give
 * it up cleanly. Here, a brand-new transaction with no category has no
 * existing claim to transfer -- but it is still a real, alive outflow that
 * `getTotalRealLedgerBalance()` counts against the ledger ceiling the
 * instant it's committed (see the top of this docblock). Treating this as
 * a no-op (the bug this section documents the fix for) lets the real
 * ledger total drop with nothing debited anywhere, silently violating
 * CLAUDE.md's core invariant -- reproduced directly: fully fund envelope A
 * to exactly the ledger ceiling, add a brand-new uncategorized outflow
 * transaction, and total envelope balance now exceeds total real ledger
 * balance with zero ledger writes to explain why.
 *
 * The fix is a brand-new `spend` movement (the same primitive
 * `applySpendMovement` already issues for a normal categorized outflow),
 * just targeting the reserved Unallocated envelope instead of a
 * user-chosen one -- not a new write path. `spend` only ever *decreases*
 * the running envelope total, so (like the "new spend before old release"
 * ordering above) it can never itself violate the ceiling, unconditionally
 * safe to apply immediately with no ordering concerns.
 *
 * Composition with categorizing that same transaction LATER: once a
 * transaction whose claim has landed on Unallocated this way gets a real
 * category assigned, `reconcileSingleTransaction`'s existing recategorize
 * branch (new spend on the chosen envelope FIRST, then release the old
 * claim SECOND) handles it with no special-casing -- Unallocated is just
 * another `active.envelope` value to that code, and `releaseClaim` doesn't
 * care which envelope it's releasing from. Verified by tracing: the branch
 * only ever reads `active.envelope`/`active.amount` off whatever
 * `getCurrentClaim` returned and calls `releaseClaim(t, active, ...)`
 * generically -- there is no `if (active.envelope === unallocatedId)`
 * anywhere in that path, unlike `transferClaimToUnallocated`'s deliberate
 * self-transfer guard (which is guarding a different thing: a transfer
 * FROM Unallocated TO itself, not a release).
 *
 * ============================================================================
 * WHY AN INCREASED, STILL-UNCATEGORIZED OUTFLOW (or a resize of a claim
 * that's already ON Unallocated) NEEDS A FULL RELEASE + FRESH CONSOLIDATED
 * SPEND, NOT A PARTIAL TOP-UP:
 * ============================================================================
 * QA reproduced a second gap in the bare-uncategorize handling above: it
 * only ever transfers `Math.min(active.amount, currentOutflow)` -- the
 * LESSER of the existing claim and the transaction's current real
 * outflow. Whenever the outflow amount is edited UPWARD with no category
 * change (e.g. a never-categorized $3000 outflow edited to $5000, or a
 * transaction categorized to envelope A at $3000 that's uncategorized AND
 * bumped to $5000 in the same update), the extra amount
 * (`currentOutflow - active.amount`) was never captured anywhere --
 * exactly the same class of bug as the never-categorized-outflow case
 * above (real money leaves the ledger with nothing debited to match),
 * just triggered by an amount edit instead of a fresh add.
 *
 * The naive fix -- leave the existing claim's transfer/release logic
 * alone and just tack on one more, independent `spend` movement for the
 * excess -- is WRONG for a subtler reason than the real-money ceiling:
 * `getCurrentClaim` resolves "the current claim" for a transaction by
 * picking the single most-recently-created unreversed `spend`-or-
 * positive-`transfer` row (`ORDER BY created_at DESC LIMIT 1`). If both
 * the old claim's row (or its transfer's positive leg) AND a brand-new
 * independent spend row for the excess are left unreversed at the same
 * time, there are now TWO rows that satisfy that query, and the next
 * reconciliation would silently pick whichever was written last and
 * under-report the true claim size -- corrupting every future edit to
 * that transaction, not just this one.
 *
 * The actual fix: whenever the outflow grew past what the existing claim
 * covers, don't try to represent the old and new portions as separate
 * rows at all. Fully release the ENTIRE existing claim (bounded by
 * `active.amount`, wherever it currently lives) and replace it with ONE
 * fresh, consolidated `spend` against Unallocated sized to the
 * transaction's ENTIRE current outflow. This guarantees exactly one
 * unreversed matching row afterward, by construction.
 *
 * The exact same one-row-replacement approach also fixes a second,
 * previously-latent gap this investigation surfaced: a claim that is
 * already sitting on Unallocated (from either of the two cases above)
 * being resized -- up OR down -- while remaining uncategorized.
 * `transferClaimToUnallocated` refuses to transfer an envelope to itself,
 * so it silently no-ops when `active.envelope` is already Unallocated;
 * combined with the (correct, provably-safe) partial release for a
 * decrease, this left NO unreversed claim row at all afterward for a
 * same-envelope resize, which would have caused the NEXT reconciliation
 * of that same transaction to treat it as claim-less and issue a second,
 * fully duplicate spend on top of the already-correct balance -- a real,
 * if delayed, ceiling violation. Folding this case into the same
 * "fully release, then one fresh consolidated spend" path fixes it
 * identically to the increased-outflow case.
 *
 * Ordering (spend before release) is verified load-bearing here, not
 * assumed by analogy: `releaseClaim` is a `fund` movement, the one type
 * `assertFundBackedByRealMoney` ceiling-checks. Releasing the OLD claim's
 * full `active.amount` before the new, smaller-or-equal spend is applied
 * can transiently push the running envelope total above the real ledger
 * ceiling and throw, in BOTH the growth case and the same-envelope-resize
 * case, whenever the budget is at or near fully allocated -- e.g. fully
 * fund envelope A to the ceiling, categorize a $5000 outflow to it, then
 * in one update clear the category and drop the amount to $3000:
 * releasing the full $5000 first momentarily claims $5000 that nothing
 * has freed up yet (the compensating $3000 debit hasn't landed), even
 * though the correct net result (a $2000 net release) never violates
 * anything. `spend` can only ever *decrease* the running total, so
 * applying it first is unconditionally safe, per the same induction
 * argument as "WHY 'REVERSE THEN REAPPLY'..." above.
 */

type ClaimAmount = IntegerAmount;

type ActiveClaim = {
  /** The `envelope_ledger` row id this claim currently lives on. */
  id: string;
  envelope: CategoryEntity['id'];
  amount: ClaimAmount;
};

/**
 * The envelope (if any) currently claiming money against `transactionId`,
 * found by walking to the *current* unreversed end of that transaction's
 * claim history. A brand-new claim is a `spend` row. A claim that has
 * since moved to a different envelope (see `reconcileSingleTransaction`)
 * shows up as the positive ("to") leg of the `transfer` that moved it --
 * the negative ("from") leg is never a valid "current holder" since it's
 * where the money left, not where it landed. Rows referenced by another
 * row's `reverses_id` are excluded -- they've been superseded.
 */
function getCurrentClaim(
  transactionId: TransactionEntity['id'],
): ActiveClaim | null {
  const row = db.firstSync<{
    id: string;
    envelope_id: string;
    amount: number;
  }>(
    `
    SELECT id, envelope_id, amount FROM envelope_ledger
    WHERE transaction_id = ?
      AND (
        movement_type = 'spend'
        OR (movement_type = 'transfer' AND amount > 0)
      )
      AND id NOT IN (
        SELECT reverses_id FROM envelope_ledger WHERE reverses_id IS NOT NULL
      )
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [transactionId],
  );
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    envelope: row.envelope_id,
    amount: Math.abs(row.amount),
  };
}

/**
 * How much of this transaction's own amount is CURRENTLY a real, alive,
 * non-parent outflow -- i.e. how much of it the real ledger total
 * currently counts against this specific row. Zero for deleted rows,
 * parent rows (split parents never independently count -- see
 * `real-money.ts`'s `getTotalRealLedgerBalance`, which excludes
 * `isParent` rows for exactly this reason), and non-outflow (zero or
 * positive) amounts.
 */
function currentOutflowAmount(
  t: TransactionEntity,
  opts: { deleted: boolean },
): ClaimAmount {
  if (opts.deleted || t.is_parent) {
    return 0;
  }
  return t.amount < 0 ? -t.amount : 0;
}

async function applySpendMovement(
  t: TransactionEntity,
  envelope: CategoryEntity['id'],
  amount: ClaimAmount,
): Promise<void> {
  await applyMovement({
    type: 'spend',
    envelope,
    amount,
    date: t.date,
    transactionId: t.id,
    counterparty: { account: t.account },
    notes: `Categorized spend for transaction ${t.id}`,
  });
}

/**
 * Releases (gives back) `amount` of a previously-claimed envelope debit.
 * Deliberately does NOT set `transactionId` -- `assertFundBackedByRealMoney`
 * would require that transaction to still exist and be a positive deposit,
 * which is never true here (the transaction this release is tied to is,
 * by construction, either an outflow, edited, or deleted). `counterparty`
 * (the transaction's own account) is the traceable anchor instead;
 * `reversesId` links this compensating entry back to the claim it
 * releases, per the ledger's append-only/compensating-entry convention.
 */
async function releaseClaim(
  t: TransactionEntity,
  active: ActiveClaim,
  amount: ClaimAmount,
): Promise<void> {
  await applyMovement({
    type: 'fund',
    envelope: active.envelope,
    amount,
    date: t.date,
    counterparty: { account: t.account },
    reversesId: active.id,
    notes: `Release of envelope claim for transaction ${t.id}`,
  });
}

/**
 * Moves `amount` of a still-alive, still-real outflow claim out of
 * `active.envelope` and into the reserved Unallocated envelope, via a
 * single `transfer` movement -- see this file's top docblock ("WHY A BARE
 * 'UNCATEGORIZE'...") for why a transfer (net-zero, never ceiling-checked)
 * is the safe primitive here, unlike a bare release.
 *
 * `reversesId: active.id` marks the claim's previous ledger row as
 * superseded, the same append-only/compensating-entry convention used by
 * `releaseClaim` -- this is what makes `getCurrentClaim` find the
 * transfer's positive ("to") leg (landing on Unallocated) as the new
 * current holder on the next reconciliation, per its own doc comment.
 *
 * No-ops if the claim is already sitting on Unallocated (e.g. a prior
 * uncategorize already moved it there and nothing has re-claimed it since)
 * -- `applyMovement` rejects a transfer from an envelope to itself, and
 * there is nothing to do in that case anyway.
 */
async function transferClaimToUnallocated(
  t: TransactionEntity,
  active: ActiveClaim,
  amount: ClaimAmount,
): Promise<void> {
  const unallocatedId = getUnallocatedEnvelopeId();
  if (active.envelope === unallocatedId) {
    return;
  }

  await applyMovement({
    type: 'transfer',
    from: active.envelope,
    to: unallocatedId,
    amount,
    date: t.date,
    transactionId: t.id,
    reversesId: active.id,
    notes: `Uncategorized -- moved envelope claim for transaction ${t.id} to Unallocated`,
  });
}

/**
 * Reconciles a single transaction row's envelope claim against its
 * current (already-committed) state. Safe to call repeatedly with an
 * unchanged transaction -- the "already correct" short-circuit below
 * means a no-op replay never writes to `envelope_ledger` at all.
 */
async function reconcileSingleTransaction(
  t: TransactionEntity,
  opts: { deleted: boolean },
): Promise<void> {
  const active = getCurrentClaim(t.id);
  const currentOutflow = currentOutflowAmount(t, opts);
  const desired =
    currentOutflow > 0 && t.category
      ? { envelope: t.category, amount: currentOutflow }
      : null;

  if (!active) {
    if (desired) {
      await applySpendMovement(t, desired.envelope, desired.amount);
    } else if (currentOutflow > 0) {
      // A real, alive, negative-amount outflow that has simply never been
      // categorized (e.g. freshly bank-imported, before the user assigns
      // it a category) -- NOT a genuinely inert row (a zero-amount or
      // positive/income-side transaction with no category, which stays a
      // true no-op below). `currentOutflowAmount` is the exact same
      // "should this transaction even count against an envelope" gate
      // `applySpendMovement`'s caller already uses for the categorized
      // case; reused here rather than re-deriving it. See this file's
      // docblock ("WHY A NEVER-CATEGORIZED REAL OUTFLOW...") for why this
      // must debit Unallocated immediately rather than staying a no-op.
      await applySpendMovement(t, getUnallocatedEnvelopeId(), currentOutflow);
    }
    return;
  }

  if (
    desired &&
    desired.envelope === active.envelope &&
    desired.amount === active.amount
  ) {
    // Already correct -- idempotent no-op, nothing written. This is what
    // makes replaying an unchanged mutation (e.g. a sync replay, or an
    // edit that didn't touch category/amount) safe.
    return;
  }

  if (desired) {
    // See this file's docblock for why the new spend MUST be applied
    // before the old claim is released.
    await applySpendMovement(t, desired.envelope, desired.amount);
    await releaseClaim(t, active, active.amount);
    return;
  }

  // No envelope wants this transaction's claim anymore (deleted, cleared
  // category, became a parent, or the amount flipped non-negative).
  if (currentOutflow === 0) {
    // Real ledger contribution from this row has dropped to zero -- the
    // entire existing claim is provably free to release (see docblock),
    // nothing new to claim anywhere.
    if (active.amount > 0) {
      await releaseClaim(t, active, active.amount);
    }
    return;
  }

  const unallocatedId = getUnallocatedEnvelopeId();
  const excess = Math.max(0, currentOutflow - active.amount);
  const alreadyOnUnallocated = active.envelope === unallocatedId;

  if (alreadyOnUnallocated && currentOutflow === active.amount) {
    // Idempotent replay -- the claim is already exactly where (and at the
    // size) it should be.
    return;
  }

  if (excess > 0 || alreadyOnUnallocated) {
    // Either (a) the transaction's real outflow grew past whatever the
    // existing claim covers -- see this file's docblock ("WHY AN
    // INCREASED, STILL-UNCATEGORIZED OUTFLOW...") -- or (b) the existing
    // claim already lives on
    // Unallocated and merely needs resizing, where
    // `transferClaimToUnallocated`'s own self-transfer guard (an envelope
    // can't transfer to itself) makes the transfer primitive unusable.
    // Both are handled identically: fully release the old claim and
    // replace it with exactly ONE fresh, consolidated spend sized to the
    // transaction's entire current outflow -- never two independent
    // unreversed rows for the same transaction, which would silently
    // corrupt `getCurrentClaim`'s single-row resolution (`ORDER BY
    // created_at DESC LIMIT 1`) on the very next reconciliation (see
    // docblock).
    //
    // Spend FIRST (can only ever *decrease* the running total, so it's
    // unconditionally safe -- see "WHY 'REVERSE THEN REAPPLY'..." above),
    // release SECOND -- verified this ordering is load-bearing here, not
    // just copied by convention: `releaseClaim` is a `fund` movement,
    // which IS ceiling-checked, and releasing the old claim's full
    // `active.amount` BEFORE the compensating spend can transiently push
    // the running total above the real ledger ceiling and throw. This is
    // the branch that actually needs this ordering (not the bottom
    // branch below, whose release amount is already provably safe on
    // its own regardless of order) -- concretely: fund envelope A with a
    // real $3000 deposit (ledger total starts at $3000), categorize a
    // $3000 outflow to envA (envA and the ledger both drop to $0), then
    // in one update clear that transaction's category AND increase its
    // amount to $5000 -- landing here since `excess = max(0, 5000 -
    // 3000) = 2000 > 0`. By the time this runs, the transaction's own
    // amount edit has already dropped the real ledger total to -$2000.
    // Releasing the old $3000 claim FIRST would momentarily push total
    // envelope balance to $3000 against that -$2000 ledger total --
    // exceeding it by $5000 -- and throw. Applying the new $5000 spend
    // on Unallocated FIRST instead lands on -$5000, still <= -$2000, so
    // the subsequent $3000 release (envA back to $3000, total -$2000)
    // never exceeds the ceiling at any intermediate point.
    await applySpendMovement(t, unallocatedId, currentOutflow);
    await releaseClaim(t, active, active.amount);
    return;
  }

  // Existing claim lives on a real envelope and the real outflow shrank
  // (or stayed the same) -- release whatever's provably freed, and
  // transfer whatever's still outstanding into Unallocated. See this
  // file's docblock ("WHY A BARE 'UNCATEGORIZE'...").
  const releasable = Math.max(0, active.amount - currentOutflow);
  if (releasable > 0) {
    await releaseClaim(t, active, releasable);
  }
  const stillOutstanding = Math.min(active.amount, currentOutflow);
  if (stillOutstanding > 0) {
    await transferClaimToUnallocated(t, active, stillOutstanding);
  }
}

/**
 * Handles one specific, otherwise-unsafe transition: an EXISTING,
 * already-categorized transaction retroactively being split into a
 * parent + new child rows (Actual's normal "split this transaction" flow
 * -- see `shared/transactions.ts`'s `splitTransaction`, which flips
 * `is_parent` on the existing row and gives the first child the parent's
 * original category). Left to the general per-transaction reconciliation
 * above, the parent's claim would look like a bare "no envelope wants
 * this anymore" case (`is_parent` makes `currentOutflowAmount` return 0)
 * -- but unlike a genuine delete, the real ledger total has NOT actually
 * dropped: the children's own rows pick up the exact same total (Actual
 * enforces split children summing to the parent amount), so blindly
 * releasing the parent's full claim here would manufacture credit with no
 * matching ledger-side change, and the children's own fresh `spend`
 * movements (never ceiling-checked) would silently compound it into a
 * real, undetected invariant violation.
 *
 * Instead, this distributes the parent's existing claim directly to the
 * new children's envelopes: apply each child's own spend FIRST (decreases
 * the running total, never checked), then release whatever the parent's
 * claim still has left (bounded by what was actually distributed, in
 * case of any mismatch) -- the same safe "spend before release" ordering
 * used everywhere else in this file. Must run before the general
 * per-transaction pass processes the new child rows, so each child's own
 * reconciliation finds its claim already in place instead of creating a
 * second one.
 */
async function distributeParentClaimToChildren(
  parent: TransactionEntity,
): Promise<void> {
  const active = getCurrentClaim(parent.id);
  if (!active) {
    // Parent never had (or has already lost) a real claim -- nothing to
    // distribute. This is also the path for a genuinely brand-new split
    // (parent row itself newly added, never independently categorized).
    return;
  }

  const children = db.runQuery<
    Pick<db.DbTransaction, 'id' | 'category' | 'amount'>
  >(
    `SELECT id, category, amount FROM transactions
     WHERE parent_id = ? AND isChild = 1 AND tombstone = 0`,
    [parent.id],
    true,
  );

  let distributed = 0;
  for (const child of children) {
    if (!child.category || child.amount == null || child.amount >= 0) {
      continue;
    }
    const childOutflow = -child.amount;
    await applyMovement({
      type: 'spend',
      envelope: child.category,
      amount: childOutflow,
      date: parent.date,
      transactionId: child.id,
      counterparty: { account: parent.account },
      notes: `Categorized spend for split child ${child.id} of ${parent.id}`,
    });
    distributed += childOutflow;
  }

  // Bounded by `distributed`, not blindly `active.amount`: if children
  // ever don't sum to the parent's original claim (shouldn't happen --
  // Actual enforces this at save time -- but this is the one place this
  // file cannot re-verify that from the raw rows alone), only release
  // what was actually just re-claimed by the children, leaving any
  // mismatch attributed to the parent's original envelope rather than
  // risk releasing more than is provably backed.
  const releasable = Math.min(active.amount, distributed);
  if (releasable > 0) {
    await releaseClaim(parent, active, releasable);
  }
}

/**
 * Entry point called from `batchUpdateTransactions` after every
 * transaction mutation (add/update/delete, including bulk/import
 * batches) has already been committed to the `transactions` table.
 * Reconciles each affected transaction's envelope claim to match.
 *
 * Split transactions: parent rows never get a movement of their own
 * (`currentOutflowAmount` returns 0 for `is_parent` rows) -- each child is
 * its own independent category assignment and reconciled on its own via
 * the general per-transaction pass. The one exception is an EXISTING
 * transaction retroactively converted into a split parent, handled by
 * `distributeParentClaimToChildren` first (see its docblock).
 *
 * Deliberately does NOT wrap these calls in one outer `batchMessages` --
 * `batchMessages` defers every underlying write (via `sendMessages`'s
 * `_BATCHED` queue) until the OUTERMOST call finishes, so a single
 * enclosing `batchMessages` here would hide earlier writes in this same
 * pass (e.g. a split's per-child spends) from the synchronous
 * `envelope_ledger` reads (`getCurrentClaim`) that later steps in this
 * same pass depend on for both correctness (the distribution step's
 * release amount) and idempotency (the "already correct" no-op check).
 * Each `applyMovement` call already batches its own ledger row(s) plus
 * balance-cache write internally; leaving these calls un-nested means
 * every one of them commits and becomes readable before the next runs.
 */
export async function reconcileEnvelopeMovements({
  added,
  updated,
  deleted,
}: {
  added: TransactionEntity[];
  updated: TransactionEntity[];
  deleted: TransactionEntity[];
}): Promise<void> {
  for (const t of updated) {
    if (t.is_parent) {
      await distributeParentClaimToChildren(t);
    }
  }

  for (const t of added) {
    await reconcileSingleTransaction(t, { deleted: false });
  }
  for (const t of updated) {
    await reconcileSingleTransaction(t, { deleted: false });
  }
  for (const t of deleted) {
    await reconcileSingleTransaction(t, { deleted: true });
  }
}
