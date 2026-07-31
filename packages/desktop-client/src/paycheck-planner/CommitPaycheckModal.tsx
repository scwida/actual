import { useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import type { SuggestedReduction } from '@actual-app/core/server/envelopes/planner/commit';
import type {
  PlannedAllocation,
  PlannedPaycheck,
} from '@actual-app/core/server/envelopes/planner/types';
import { q } from '@actual-app/core/shared/query';
import type { IntegerAmount } from '@actual-app/core/shared/util';
import type {
  CategoryEntity,
  TransactionEntity,
} from '@actual-app/core/types/models';
import type { TransObjectLiteral } from '@actual-app/core/types/util';

import { FinancialText } from '#components/FinancialText';
import { AmountInput } from '#components/util/AmountInput';
import { DisplayId } from '#components/util/DisplayId';
import { useDateFormat } from '#hooks/useDateFormat';
import { useFormat } from '#hooks/useFormat';
import { useQuery } from '#hooks/useQuery';
import { addNotification } from '#notifications/notificationsSlice';
import { transactionsSearch } from '#queries';
import { useDispatch } from '#redux';

import {
  commitPlannedPaycheck,
  matchPaycheckTransaction,
  previewCommitPaycheck,
} from './usePlannedPaychecks';

type MatchedTransaction = {
  id: string;
  amount: IntegerAmount;
};

type Props = {
  paycheck: PlannedPaycheck;
  allocations: readonly PlannedAllocation[];
  envelopeNamesById: Record<CategoryEntity['id'], string>;
  alreadyMatchedTransactionIds: ReadonlySet<string>;
  onClose: () => void;
};

export function CommitPaycheckModal({
  paycheck,
  allocations,
  envelopeNamesById,
  alreadyMatchedTransactionIds,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const format = useFormat();

  const [matchedTransaction, setMatchedTransaction] =
    useState<MatchedTransaction | null>(() =>
      paycheck.actual_transaction_id != null && paycheck.actual_amount != null
        ? { id: paycheck.actual_transaction_id, amount: paycheck.actual_amount }
        : null,
    );
  const [step, setStep] = useState<'match' | 'review'>(
    matchedTransaction ? 'review' : 'match',
  );
  const [overrides, setOverrides] = useState<
    Record<CategoryEntity['id'], IntegerAmount>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SuggestedReduction | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const handlePickTransaction = (transaction: TransactionEntity) => {
    setMatchError(null);
    setIsMatching(true);
    // Wait for the match to actually persist server-side before
    // transitioning to the review step -- `previewCommitPaycheck` (fired
    // by the effect below once `matchedTransaction` changes) reads the
    // planned paycheck's real `actual_amount` from the server, so it must
    // never run before this write has landed.
    void matchPaycheckTransaction(paycheck.id, transaction.id)
      .then(() => {
        setMatchedTransaction({
          id: transaction.id,
          amount: transaction.amount,
        });
        setOverrides({});
        setStep('review');
      })
      .catch((err: unknown) => {
        setMatchError(
          err instanceof Error ? err.message : t('Failed to match deposit.'),
        );
      })
      .finally(() => {
        setIsMatching(false);
      });
  };

  // Fetches the real, server-side suggested reduction whenever the
  // matched transaction changes -- including on mount, for a paycheck
  // that was already matched before this modal opened. `matchedTransaction`
  // is only ever set once `matchPaycheckTransaction` has resolved (see
  // `handlePickTransaction`), so this never races that write.
  useEffect(() => {
    if (!matchedTransaction) {
      setPreview(null);
      return;
    }

    let cancelled = false;
    setPreviewError(null);
    void previewCommitPaycheck(paycheck.id)
      .then(result => {
        if (!cancelled) {
          setPreview(result);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPreview(null);
          setPreviewError(
            err instanceof Error
              ? err.message
              : t('Failed to compute suggested amounts.'),
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [matchedTransaction, paycheck.id, t]);

  const approvedAmounts = useMemo(() => {
    if (!preview) return {};
    return { ...preview.suggested, ...overrides };
  }, [preview, overrides]);

  const totalDrafted = useMemo(
    () => allocations.reduce((sum, a) => sum + a.amount, 0),
    [allocations],
  );
  const totalApproved = useMemo(
    () => Object.values(approvedAmounts).reduce((sum, a) => sum + a, 0),
    [approvedAmounts],
  );
  const actualAmount = matchedTransaction?.amount ?? 0;
  const exceedsDeposit = totalApproved > actualAmount;
  const leftoverToUnallocated = Math.max(0, actualAmount - totalApproved);

  async function handleConfirm() {
    setCommitError(null);
    setIsSubmitting(true);
    try {
      await commitPlannedPaycheck(paycheck.id, approvedAmounts);
      dispatch(
        addNotification({
          notification: {
            type: 'message',
            message: t('Paycheck committed.'),
          },
        }),
      );
      onClose();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t('There was an error committing this paycheck.');
      setCommitError(message);
      dispatch(
        addNotification({
          notification: { type: 'error', message },
        }),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop open">
      <div className="modal modal-wide">
        <div className="modal-header">
          <span className="modal-title">
            {step === 'match' ? (
              <Trans>Match this paycheck to a deposit</Trans>
            ) : (
              <Trans>Review &amp; commit paycheck</Trans>
            )}
          </span>
          <button type="button" onClick={onClose} aria-label={t('Close')}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          {step === 'match' ? (
            <TransactionPicker
              excludeIds={alreadyMatchedTransactionIds}
              onPick={handlePickTransaction}
              disabled={isMatching}
            />
          ) : (
            matchedTransaction && (
              <>
                <p className="commit-review-intro">
                  <Trans>
                    Real deposit matched:{' '}
                    <FinancialText>
                      {
                        {
                          amount: format(
                            matchedTransaction.amount,
                            'financial',
                          ),
                        } as TransObjectLiteral
                      }
                    </FinancialText>
                  </Trans>{' '}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setStep('match')}
                  >
                    <Trans>Change matched deposit</Trans>
                  </button>
                </p>

                {!preview && !previewError && (
                  <p className="commit-review-intro">
                    <Trans>Loading suggested amounts…</Trans>
                  </p>
                )}
                {previewError && (
                  <p className="commit-review-error">{previewError}</p>
                )}

                {preview && (
                  <>
                    <table className="alloc-table review-table">
                      <thead>
                        <tr>
                          <th>
                            <Trans>Envelope</Trans>
                          </th>
                          <th className="num">
                            <Trans>Drafted</Trans>
                          </th>
                          <th className="num">
                            <Trans>Suggested</Trans>
                          </th>
                          <th className="num">
                            <Trans>Approved</Trans>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {allocations.map(allocation => (
                          <tr key={allocation.id}>
                            <td>
                              {envelopeNamesById[allocation.envelope_id] ??
                                allocation.envelope_id}
                            </td>
                            <td className="num">
                              <FinancialText as="span">
                                {format(allocation.amount, 'financial')}
                              </FinancialText>
                            </td>
                            <td className="num">
                              <FinancialText as="span">
                                {format(
                                  preview.suggested[allocation.envelope_id] ??
                                    0,
                                  'financial',
                                )}
                              </FinancialText>
                            </td>
                            <td className="num">
                              <AmountInput
                                value={
                                  approvedAmounts[allocation.envelope_id] ?? 0
                                }
                                sign="+"
                                onUpdate={amount =>
                                  setOverrides(prev => ({
                                    ...prev,
                                    [allocation.envelope_id]: amount,
                                  }))
                                }
                                style={{ maxWidth: 130, marginLeft: 'auto' }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="commit-review-totals">
                      <div>
                        <span>
                          <Trans>Total drafted</Trans>
                        </span>
                        <FinancialText as="span">
                          {format(totalDrafted, 'financial')}
                        </FinancialText>
                      </div>
                      <div>
                        <span>
                          <Trans>Total approved</Trans>
                        </span>
                        <FinancialText as="span">
                          {format(totalApproved, 'financial')}
                        </FinancialText>
                      </div>
                      <div>
                        <span>
                          <Trans>Actual deposit</Trans>
                        </span>
                        <FinancialText as="span">
                          {format(actualAmount, 'financial')}
                        </FinancialText>
                      </div>
                      {leftoverToUnallocated > 0 && (
                        <div>
                          <span>
                            <Trans>Goes to Unallocated</Trans>
                          </span>
                          <FinancialText as="span">
                            {format(leftoverToUnallocated, 'financial')}
                          </FinancialText>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {exceedsDeposit && (
                  <p className="commit-review-error">
                    <Trans>
                      Approved amounts exceed the actual deposit. Reduce an
                      approved amount before committing.
                    </Trans>
                  </p>
                )}
                {matchError && (
                  <p className="commit-review-error">{matchError}</p>
                )}
                {commitError && (
                  <p className="commit-review-error">{commitError}</p>
                )}
              </>
            )
          )}
        </div>

        <div className="modal-footer">
          <button
            className="btn btn-secondary btn-sm"
            type="button"
            onClick={onClose}
          >
            <Trans>Cancel</Trans>
          </button>
          {step === 'review' && (
            <button
              className="btn btn-primary btn-sm"
              type="button"
              onClick={() => void handleConfirm()}
              disabled={
                !matchedTransaction ||
                !preview ||
                exceedsDeposit ||
                isSubmitting
              }
            >
              <Trans>Confirm &amp; commit</Trans>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

type TransactionPickerProps = {
  excludeIds: ReadonlySet<string>;
  onPick: (transaction: TransactionEntity) => void;
  disabled?: boolean;
};

function TransactionPicker({
  excludeIds,
  onPick,
  disabled = false,
}: TransactionPickerProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const [search, setSearch] = useState('');
  const dateFormat = useDateFormat() || 'MM/dd/yyyy';

  const { data, isLoading } = useQuery<TransactionEntity>(() => {
    let query = q('transactions')
      .filter({ amount: { $gt: 0 } })
      .select('*')
      .orderBy({ date: 'desc' })
      .limit(50);
    if (search.trim()) {
      query = transactionsSearch(query, search.trim(), dateFormat);
    }
    return query;
  }, [search, dateFormat]);

  const candidates = (data ?? []).filter(
    transaction => !excludeIds.has(transaction.id),
  );

  return (
    <>
      <p className="commit-review-intro">
        <Trans>
          Only unmatched real deposits are shown. Pick the one that is this
          paycheck.
        </Trans>
      </p>
      <input
        className="form-input"
        type="text"
        placeholder={t('Search deposits…')}
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ marginBottom: 'var(--space-3)' }}
      />
      <div className="txn-picker-list">
        {isLoading && (
          <p className="commit-review-intro">
            <Trans>Loading…</Trans>
          </p>
        )}
        {!isLoading && candidates.length === 0 && (
          <p className="commit-review-intro">
            <Trans>No matching deposits found.</Trans>
          </p>
        )}
        {candidates.map(transaction => (
          <button
            key={transaction.id}
            type="button"
            className="txn-picker-row"
            onClick={() => onPick(transaction)}
            disabled={disabled}
          >
            <span className="txn-picker-date">{transaction.date}</span>
            <span className="txn-picker-payee">
              {transaction.payee ? (
                <DisplayId type="payees" id={transaction.payee} />
              ) : (
                t('No payee')
              )}
            </span>
            <span className="txn-picker-account">
              {transaction.account ? (
                <DisplayId type="accounts" id={transaction.account} />
              ) : (
                t('No account')
              )}
            </span>
            <FinancialText as="span" className="txn-picker-amount">
              {format(transaction.amount, 'financial')}
            </FinancialText>
          </button>
        ))}
      </div>
    </>
  );
}
