import { v4 as uuidv4 } from 'uuid';

import * as db from '#server/db';
import { batchMessages } from '#server/sync';
import type { IntegerAmount } from '#shared/util';
import type {
  ApplyMovementRequest,
  ApplyMovementResult,
  CategoryEntity,
  FundMovementRequest,
  MoneyLocation,
  NegativeBalanceWarning,
  PreviewMovementResult,
} from '#types/models';

import {
  getEnvelopeBalance,
  getEnvelopeBalances,
  incrementEnvelopeBalance,
} from './balances';
import {
  getAmountAlreadyFundedFromTransaction,
  getRealTransaction,
  getTotalEnvelopeBalance,
  getTotalRealLedgerBalance,
} from './real-money';
import { getUnallocatedEnvelopeId } from './unallocated';

/**
 * The per-envelope balance change a request would cause, keyed by
 * envelope id. A transfer touches two envelopes; fund/spend touch one.
 */
function movementDeltas(
  request: ApplyMovementRequest,
): Record<CategoryEntity['id'], IntegerAmount> {
  switch (request.type) {
    case 'fund':
      return { [request.envelope]: request.amount };
    case 'spend':
      return { [request.envelope]: -request.amount };
    case 'transfer':
      return { [request.from]: -request.amount, [request.to]: request.amount };
    default: {
      const exhaustiveCheck: never = request;
      throw new Error(
        `Unknown movement request type: ${String(exhaustiveCheck)}`,
      );
    }
  }
}

function validateRequestShape(request: ApplyMovementRequest): void {
  if (!Number.isInteger(request.amount) || request.amount <= 0) {
    throw new Error(
      `applyMovement: amount must be a positive integer, got: ${request.amount}`,
    );
  }

  if (!request.date) {
    throw new Error('applyMovement: date is required');
  }

  if (request.type === 'transfer' && request.from === request.to) {
    throw new Error(
      'applyMovement: cannot transfer an envelope to itself (from and to are the same envelope)',
    );
  }
}

function envelopeExists(envelopeId: CategoryEntity['id']): boolean {
  return (
    db.firstSync<Pick<db.DbCategory, 'id'>>(
      'SELECT id FROM categories WHERE id = ? AND tombstone = 0',
      [envelopeId],
    ) != null
  );
}

function accountExists(accountId: string): boolean {
  return (
    db.firstSync<Pick<db.DbAccount, 'id'>>(
      'SELECT id FROM accounts WHERE id = ? AND tombstone = 0',
      [accountId],
    ) != null
  );
}

function assertMoneyLocationExists(location: MoneyLocation | undefined): void {
  if (!location) {
    return;
  }
  if ('account' in location) {
    if (!accountExists(location.account)) {
      throw new Error(
        `applyMovement: account not found (or closed/deleted): ${location.account}`,
      );
    }
  } else if (!envelopeExists(location.envelope)) {
    throw new Error(
      `applyMovement: envelope not found (or deleted): ${location.envelope}`,
    );
  }
}

/**
 * Enforces CLAUDE.md's core invariant for the one movement type that can
 * increase total envelope credit -- `fund` -- by requiring it to trace to
 * real money and never push total envelope balances past total real
 * ledger money. `spend` (decreases the total) and `transfer` (leaves the
 * total unchanged) can never violate this invariant, so they're not
 * checked here.
 *
 * Policy for what counts as "real money" (hard requirement, not a nudge):
 * - If `transactionId` is given, that transaction must actually exist and
 *   be a real deposit (positive amount). The running total of every
 *   `fund` movement already tied to that transaction, plus this one, may
 *   never exceed the transaction's own real amount -- otherwise the same
 *   deposit could fund more than one envelope beyond what it's worth.
 * - If no `transactionId` is given (a manual/cash deposit with no
 *   bank-imported transaction -- e.g. a gift, refund, or interest), the
 *   request must at least name a real `accountId` via `counterparty` so
 *   there is *some* traceable anchor to a real account
 *   (`assertMoneyLocationExists` already confirms the account exists). A
 *   request with neither anchor is rejected outright.
 * - Regardless of which anchor is used, the global ceiling below always
 *   applies. Envelopes are account-agnostic pooled claims against total
 *   ledger money (CLAUDE.md "Envelope rules"), so the right enforcement
 *   is against the *total* across all accounts, not a per-account claim
 *   ledger -- tracking "how much of account X is already claimed" would
 *   contradict that pooling design and still miss cross-account funding.
 *
 * CONCURRENCY -- what this function's caller (`applyMovement`) actually
 * guarantees vs. what it doesn't:
 * - Within a single loot-core process, `applyMovement` serializes every
 *   `fund` request through `withFundLock` (below) so that the read here
 *   (how much is already claimed / total envelope balance) and the
 *   ledger-row write that claims more can never be interleaved by a
 *   second concurrent `fund` call in the same process -- see
 *   `withFundLock` for why a plain `db.asyncTransaction` is NOT
 *   sufficient for that on its own.
 * - This does NOT protect against two different DEVICES (e.g. Scott's
 *   and Katie's, each running their own local DB and mutator queue)
 *   independently funding against the same `transactionId` before
 *   syncing, then merging via CRDT sync. Each device would perform this
 *   exact check locally, pass it (correctly, given what it knows), and
 *   only after sync would the double-claim become visible. Detecting and
 *   resolving that after the fact is a genuinely open, cross-device
 *   design question -- it needs a product decision (e.g. does
 *   post-sync reconciliation flag the second claim for the user to
 *   resolve? auto-clamp one of them? something else?) and is
 *   intentionally NOT solved here. Flagging this prominently rather than
 *   silently leaving it undocumented.
 */
function assertFundBackedByRealMoney(request: FundMovementRequest): void {
  const counterpartyAccount =
    request.counterparty && 'account' in request.counterparty
      ? request.counterparty.account
      : undefined;

  if (!request.transactionId && !counterpartyAccount) {
    throw new Error(
      'applyMovement: a fund movement must reference either a real transactionId or a real accountId (counterparty.account) -- an untraceable fund request is not allowed.',
    );
  }

  if (request.transactionId) {
    const transaction = getRealTransaction(request.transactionId);
    if (!transaction) {
      throw new Error(
        `applyMovement: transaction not found (or deleted): ${request.transactionId}`,
      );
    }
    if (transaction.amount <= 0) {
      throw new Error(
        `applyMovement: fund movements must be tied to a deposit (a transaction with a positive amount), got ${transaction.amount} for transaction ${request.transactionId}`,
      );
    }

    const alreadyFunded = getAmountAlreadyFundedFromTransaction(
      request.transactionId,
    );
    if (alreadyFunded + request.amount > transaction.amount) {
      throw new Error(
        `applyMovement: funding ${request.amount} from transaction ${request.transactionId} would bring total envelope credit claimed from it to ${alreadyFunded + request.amount}, exceeding the transaction's real amount (${transaction.amount})`,
      );
    }
  }

  const totalEnvelopeBalanceAfter = getTotalEnvelopeBalance() + request.amount;
  const totalRealLedgerBalance = getTotalRealLedgerBalance();
  if (totalEnvelopeBalanceAfter > totalRealLedgerBalance) {
    throw new Error(
      `applyMovement: funding ${request.amount} would bring total envelope balances to ${totalEnvelopeBalanceAfter}, exceeding total real money across ledger accounts (${totalRealLedgerBalance}). Envelope balances may never exceed real ledger money.`,
    );
  }
}

/**
 * Validates real errors: malformed amounts/dates, entities that don't
 * exist, and -- for `fund` requests only -- that the money is real (see
 * `assertFundBackedByRealMoney`). This NEVER validates "would this take
 * an envelope negative" -- that's `checkNegativeBalance`'s job, and it is
 * always a dismissible warning, never a block (see CLAUDE.md "Envelope
 * rules"). The real-money check above is different: it is CLAUDE.md's
 * unconditional core invariant, not a nudge, so it always throws rather
 * than warn.
 */
function validateRequest(request: ApplyMovementRequest): void {
  validateRequestShape(request);

  if (request.type === 'transfer') {
    if (!envelopeExists(request.from)) {
      throw new Error(
        `applyMovement: envelope not found (or deleted): ${request.from}`,
      );
    }
    if (!envelopeExists(request.to)) {
      throw new Error(
        `applyMovement: envelope not found (or deleted): ${request.to}`,
      );
    }
  } else {
    if (!envelopeExists(request.envelope)) {
      throw new Error(
        `applyMovement: envelope not found (or deleted): ${request.envelope}`,
      );
    }
    assertMoneyLocationExists(request.counterparty);

    if (request.type === 'fund') {
      assertFundBackedByRealMoney(request);
    }
  }
}

function counterpartyColumns(
  location: MoneyLocation | undefined,
): Pick<db.DbEnvelopeLedger, 'counterparty_kind' | 'counterparty_id'> {
  if (!location) {
    return { counterparty_kind: null, counterparty_id: null };
  }
  if ('account' in location) {
    return { counterparty_kind: 'account', counterparty_id: location.account };
  }
  return { counterparty_kind: 'envelope', counterparty_id: location.envelope };
}

type LedgerRowInput = Omit<db.DbEnvelopeLedger, 'id'>;

function buildLedgerRows(
  request: ApplyMovementRequest,
  createdAt: string,
): LedgerRowInput[] {
  const base = {
    date: request.date,
    notes: request.notes ?? null,
    transaction_id: request.transactionId ?? null,
    planned_allocation_id: request.plannedAllocationId ?? null,
    reverses_id: request.reversesId ?? null,
    created_at: createdAt,
  };

  switch (request.type) {
    case 'fund':
      return [
        {
          ...base,
          envelope_id: request.envelope,
          amount: request.amount,
          movement_type: 'fund',
          ...counterpartyColumns(request.counterparty),
        },
      ];
    case 'spend':
      return [
        {
          ...base,
          envelope_id: request.envelope,
          amount: -request.amount,
          movement_type: 'spend',
          ...counterpartyColumns(request.counterparty),
        },
      ];
    case 'transfer': {
      const transferId = uuidv4();
      return [
        {
          ...base,
          envelope_id: request.from,
          amount: -request.amount,
          movement_type: 'transfer',
          counterparty_kind: 'envelope',
          counterparty_id: request.to,
          transfer_id: transferId,
        },
        {
          ...base,
          envelope_id: request.to,
          amount: request.amount,
          movement_type: 'transfer',
          counterparty_kind: 'envelope',
          counterparty_id: request.from,
          transfer_id: transferId,
        },
      ];
    }
    default: {
      const exhaustiveCheck: never = request;
      throw new Error(
        `Unknown movement request type: ${String(exhaustiveCheck)}`,
      );
    }
  }
}

/**
 * Suggests a specific cover source for a shortfall on `envelopeId`:
 * prefer the reserved Unallocated envelope (if it has funds and isn't
 * the envelope in question), otherwise the envelope with the largest
 * positive balance in the same category group. Returns null if nothing
 * suitable is found -- the caller should just show the negative balance
 * with no suggested action.
 */
async function suggestCoverSource(
  envelopeId: CategoryEntity['id'],
  shortfall: IntegerAmount,
): Promise<NegativeBalanceWarning['suggestedCover']> {
  const unallocatedId = getUnallocatedEnvelopeId();
  if (unallocatedId !== envelopeId) {
    const unallocatedBalance = getEnvelopeBalance(unallocatedId);
    if (unallocatedBalance > 0) {
      return {
        source: { envelope: unallocatedId },
        amount: Math.min(unallocatedBalance, shortfall),
      };
    }
  }

  const envelope = db.firstSync<Pick<db.DbCategory, 'cat_group'>>(
    'SELECT cat_group FROM categories WHERE id = ?',
    [envelopeId],
  );
  if (!envelope) {
    return null;
  }

  const candidate = db.firstSync<{ id: string; balance: number }>(
    `
    SELECT c.id AS id, IFNULL(eb.balance, 0) AS balance
    FROM categories c
    LEFT JOIN envelope_balances eb ON eb.id = c.id
    WHERE c.cat_group = ? AND c.id != ? AND c.tombstone = 0 AND c.is_reserved = 0
    ORDER BY balance DESC
    LIMIT 1
    `,
    [envelope.cat_group, envelopeId],
  );

  if (!candidate || candidate.balance <= 0) {
    return null;
  }

  return {
    source: { envelope: candidate.id },
    amount: Math.min(candidate.balance, shortfall),
  };
}

async function buildWarning(
  envelopeId: CategoryEntity['id'],
  resultingBalance: IntegerAmount,
): Promise<NegativeBalanceWarning | null> {
  if (resultingBalance >= 0) {
    return null;
  }
  return {
    type: 'negative-balance',
    envelope: envelopeId,
    resultingBalance,
    suggestedCover: await suggestCoverSource(envelopeId, -resultingBalance),
  };
}

/**
 * Pure, read-only: computes the resulting balance(s) a movement request
 * would cause, and any negative-balance warnings, without writing
 * anything. The UI is expected to call this before `applyMovement` to
 * show a gentle, dismissible nudge -- `applyMovement` itself never
 * blocks on this.
 */
export async function previewMovement(
  request: ApplyMovementRequest,
): Promise<PreviewMovementResult> {
  const deltas = movementDeltas(request);
  const envelopeIds = Object.keys(deltas);
  const previousBalances = await getEnvelopeBalances(envelopeIds);

  const balances: Record<string, IntegerAmount> = {};
  const warnings: NegativeBalanceWarning[] = [];

  for (const envelopeId of envelopeIds) {
    const resultingBalance = previousBalances[envelopeId] + deltas[envelopeId];
    balances[envelopeId] = resultingBalance;

    const warning = await buildWarning(envelopeId, resultingBalance);
    if (warning) {
      warnings.push(warning);
    }
  }

  return { balances, warnings };
}

/**
 * Computes the warning (if any) for a single envelope receiving `delta`,
 * without needing a full movement request. Exposed standalone since the
 * UI may want to check "what if I typed this amount" for a single field
 * before it has enough info to build a full request.
 */
export async function checkNegativeBalance(
  envelopeId: CategoryEntity['id'],
  delta: IntegerAmount,
): Promise<NegativeBalanceWarning | null> {
  const currentBalance = getEnvelopeBalance(envelopeId);
  return buildWarning(envelopeId, currentBalance + delta);
}

/**
 * In-process serialization queue for `fund` movements only -- the one
 * movement type whose validation (`assertFundBackedByRealMoney`) reads a
 * running total (how much of a transaction/the real ledger is already
 * claimed) that a *later write* in the same call then relies on staying
 * true. `getTotalEnvelopeBalance`/`getAmountAlreadyFundedFromTransaction`
 * (the check) are themselves synchronous, but the write that must stay
 * consistent with them -- `batchMessages` awaiting `db.insertWithSchema`
 * for the ledger row(s) -- is async, and even though this codebase's
 * underlying sqlite layer (sql.js) executes each individual statement
 * synchronously with no real I/O, every `await` on one of those async
 * wrappers still yields to the JS microtask queue. In a single-threaded
 * Node/JS process, that yield -- between one call's check and its write --
 * is exactly the window where a second concurrent
 * `applyMovement({ type: 'fund' })` call can run its own check-then-act
 * sequence against the same not-yet-updated state -- a classic
 * check-then-act race, demonstrated by QA with two concurrent
 * `applyMovement` calls funding two different envelopes off the same $100
 * transaction, both succeeding.
 *
 * Why not just wrap the check+insert in `db.asyncTransaction` instead, as
 * one might expect from a real database? Verified by reading
 * `platform/server/sqlite/index.ts`: this codebase's sqlite layer is
 * sql.js, a single in-memory connection with no separate threads/
 * processes and no row/table locking. `asyncTransaction`/`transaction`
 * here only manage BEGIN/SAVEPOINT/COMMIT *nesting* for rollback safety --
 * a second concurrent call made while the first is mid-transaction does
 * NOT block; it just increments a shared `transactionDepth` counter and
 * runs its own queries interleaved with the first's, coalesced into the
 * same commit. That gives atomicity for a single caller, not mutual
 * exclusion between concurrent callers. In a single-threaded JS process,
 * the only real mutual-exclusion primitive available is to prevent any
 * `await` from occurring between the check and the write for competing
 * callers -- i.e. fully serialize them -- which is what this queue does.
 *
 * This is a plain promise chain, not a real lock: each call's work only
 * starts after the previous one has fully settled (resolved OR rejected),
 * so at most one `fund` movement's validate-then-write section ever runs
 * at a time in this process. `spend`/`transfer` don't need this -- they
 * can never increase total envelope credit, so they can't violate the
 * invariant this queue protects.
 *
 * Residual limitation (explicitly NOT addressed here -- see the longer
 * comment on `assertFundBackedByRealMoney`): this only serializes calls
 * within a single process. It does not, and cannot, protect against two
 * different devices each funding independently against the same
 * transaction before syncing.
 */
let fundQueue: Promise<void> = Promise.resolve();

function withFundLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = fundQueue.then(fn);
  // Whatever happens to `result` (resolve or reject), the queue itself
  // must keep moving for the next caller -- only `result`'s own promise
  // carries the outcome back to this call's caller.
  fundQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/**
 * The single primitive for moving real money into, out of, or between
 * envelopes (see CLAUDE.md "How money moves"). Writes one ledger row for
 * fund/spend, or two rows sharing a transfer_id for an envelope-to-
 * envelope transfer, and keeps the envelope_balances cache in sync via
 * `incrementEnvelopeBalance` -- an atomic per-envelope delta write, not a
 * read-then-write -- so concurrent movements against the same envelope
 * (e.g. two concurrent `spend` calls) can never lose one's update to the
 * other's (see `incrementEnvelopeBalance`'s doc comment).
 *
 * Only validates real errors: bad amounts/dates, missing entities, and --
 * for `fund` requests -- that the credit traces to real money and cannot
 * push total envelope balances past total real ledger money (see
 * `assertFundBackedByRealMoney`; this is CLAUDE.md's hard, unconditional
 * core invariant, not a nudge). Never rejects because a resulting balance
 * would be negative -- that's surfaced via `warnings` for the UI to show
 * as a dismissible nudge (see CLAUDE.md "Envelope rules" -- a completely
 * separate concern from the real-money invariant above).
 *
 * `fund` requests run through `withFundLock` so that no two `fund` calls
 * in this process can interleave their validate-then-write sections (see
 * `withFundLock` for why this is necessary and what it does/doesn't
 * guarantee). This is a *separate* concern from `incrementEnvelopeBalance`
 * -- `withFundLock` protects the real-money ceiling check (which reads a
 * running total that a later write must not have invalidated),
 * `incrementEnvelopeBalance` protects the balance-cache write itself from
 * lost updates. `spend`/`transfer` don't need `withFundLock` (they can't
 * violate the real-money ceiling), but every movement type needs the
 * atomic cache write.
 */
export async function applyMovement(
  request: ApplyMovementRequest,
): Promise<ApplyMovementResult> {
  if (request.type === 'fund') {
    return withFundLock(() => applyMovementUnlocked(request));
  }
  return applyMovementUnlocked(request);
}

async function applyMovementUnlocked(
  request: ApplyMovementRequest,
): Promise<ApplyMovementResult> {
  validateRequest(request);

  const deltas = movementDeltas(request);
  const envelopeIds = Object.keys(deltas);

  const createdAt = new Date().toISOString();
  const ledgerRowIds: string[] = [];

  // Write the ledger row(s) and the balance-cache delta(s) together. The
  // cache write is `incrementEnvelopeBalance` -- a single atomic SQL
  // statement per envelope, not a read-modify-write in JS -- specifically
  // so that two concurrent movements against the same envelope (e.g. two
  // concurrent `spend` calls) can never lose one's update to the other
  // (see `incrementEnvelopeBalance`'s doc comment for the full
  // reasoning). Do NOT reintroduce a "read current balance, compute new
  // value, write it back" step here.
  await batchMessages(async () => {
    for (const row of buildLedgerRows(request, createdAt)) {
      const id: string = await db.insertWithSchema('envelope_ledger', row);
      ledgerRowIds.push(id);
    }

    for (const envelopeId of envelopeIds) {
      incrementEnvelopeBalance(envelopeId, deltas[envelopeId], createdAt);
    }
  });

  // Re-read the now-authoritative post-write balances rather than
  // computing them from a pre-write snapshot, so the warnings and the
  // returned `balances` reflect what was actually just committed to the
  // cache (including any concurrent movement that landed in between).
  const newBalances = await getEnvelopeBalances(envelopeIds);
  const warnings: NegativeBalanceWarning[] = [];

  for (const envelopeId of envelopeIds) {
    const warning = await buildWarning(envelopeId, newBalances[envelopeId]);
    if (warning) {
      warnings.push(warning);
    }
  }

  return { ledgerRowIds, balances: newBalances, warnings };
}
