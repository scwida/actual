import type { IntegerAmount } from '#shared/util';

import type { AccountEntity } from './account';
import type { CategoryEntity } from './category';

/**
 * A location money can live in/come from/go to. Envelopes are pooled
 * claims against total ledger balance -- not pinned to one account -- so
 * this is intentionally just "an account, or an envelope", never a
 * combination of both.
 */
export type MoneyLocation =
  | { account: AccountEntity['id'] }
  | { envelope: CategoryEntity['id'] };

export type EnvelopeMovementType = 'fund' | 'spend' | 'transfer';

type BaseMovementRequest = {
  date: string;
  notes?: string;
  /** The real transaction (in `transactions`) this movement is tied to, if any. */
  transactionId?: string;
  /** The planned_allocation row this movement fulfills, if any (paycheck commit). */
  plannedAllocationId?: string;
  /** If this movement is a compensating correction, the ledger row it reverses. */
  reversesId?: string;
};

export type FundMovementRequest = BaseMovementRequest & {
  type: 'fund';
  envelope: CategoryEntity['id'];
  amount: IntegerAmount;
  /** Where the money is coming from, e.g. an account. */
  counterparty?: MoneyLocation;
};

export type SpendMovementRequest = BaseMovementRequest & {
  type: 'spend';
  envelope: CategoryEntity['id'];
  amount: IntegerAmount;
  /** Where the money is going, e.g. an account. */
  counterparty?: MoneyLocation;
};

export type TransferMovementRequest = BaseMovementRequest & {
  type: 'transfer';
  from: CategoryEntity['id'];
  to: CategoryEntity['id'];
  amount: IntegerAmount;
};

export type ApplyMovementRequest =
  | FundMovementRequest
  | SpendMovementRequest
  | TransferMovementRequest;

/**
 * A gentle, dismissible nudge -- never a block -- surfaced when a movement
 * would (or did) take an envelope negative.
 */
export type NegativeBalanceWarning = {
  type: 'negative-balance';
  envelope: CategoryEntity['id'];
  resultingBalance: IntegerAmount;
  suggestedCover: {
    source: MoneyLocation;
    amount: IntegerAmount;
  } | null;
};

export type ApplyMovementResult = {
  ledgerRowIds: string[];
  balances: Record<CategoryEntity['id'], IntegerAmount>;
  warnings: NegativeBalanceWarning[];
};

export type PreviewMovementResult = {
  balances: Record<CategoryEntity['id'], IntegerAmount>;
  warnings: NegativeBalanceWarning[];
};
