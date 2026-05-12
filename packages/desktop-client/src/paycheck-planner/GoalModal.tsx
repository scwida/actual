import { useState } from 'react';
import { Trans } from 'react-i18next';

import type { CategoryGoal, GoalType } from './useGoals';

type Props = {
  categoryName: string;
  existingGoal: CategoryGoal | undefined;
  onSave: (goal: CategoryGoal) => void;
  onRemove: () => void;
  onClose: () => void;
  categoryId: string;
};

const GOAL_TYPES: { type: GoalType; label: string; description: string }[] = [
  {
    type: 'monthly-contribution',
    label: 'Monthly Contribution',
    description: 'Set aside a fixed amount every month.',
  },
  {
    type: 'needed-for-spending',
    label: 'Needed for Spending',
    description: 'Refill this category by a certain day each month.',
  },
  {
    type: 'savings-balance',
    label: 'Savings Balance',
    description: 'Accumulate a total amount by a target date.',
  },
  {
    type: 'debt-payoff',
    label: 'Pay Off Debt',
    description: 'Make a fixed monthly payment to eliminate debt.',
  },
];

export function GoalModal({
  categoryName,
  existingGoal,
  onSave,
  onRemove,
  onClose,
  categoryId,
}: Props) {
  const [selectedType, setSelectedType] = useState<GoalType>(
    existingGoal?.type ?? 'monthly-contribution',
  );
  const [amount, setAmount] = useState(
    existingGoal ? String(existingGoal.amount) : '',
  );
  const [dayOfMonth, setDayOfMonth] = useState(
    existingGoal?.dayOfMonth ? String(existingGoal.dayOfMonth) : '',
  );
  const [targetDate, setTargetDate] = useState(existingGoal?.targetDate ?? '');

  const handleSave = () => {
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) return;

    const goal: CategoryGoal = {
      categoryId,
      type: selectedType,
      amount: parsedAmount,
    };

    if (
      (selectedType === 'needed-for-spending' ||
        selectedType === 'debt-payoff') &&
      dayOfMonth
    ) {
      goal.dayOfMonth = Math.min(31, Math.max(1, parseInt(dayOfMonth, 10)));
    }

    if (selectedType === 'savings-balance' && targetDate) {
      goal.targetDate = targetDate;
    }

    onSave(goal);
  };

  const showDayOfMonth =
    selectedType === 'needed-for-spending' || selectedType === 'debt-payoff';
  const showTargetDate = selectedType === 'savings-balance';

  return (
    <div className="modal-backdrop open">
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <span className="modal-title">
            {existingGoal ? (
              <Trans>Edit Goal</Trans>
            ) : (
              <Trans>Set a Goal</Trans>
            )}
          </span>
          <button type="button" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <p
            style={{
              margin: '0 0 1rem',
              color: 'var(--color-text-muted)',
              fontSize: '0.875rem',
            }}
          >
            {categoryName}
          </p>

          {/* Goal type selector */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              marginBottom: '1.25rem',
            }}
          >
            {GOAL_TYPES.map(gt => (
              <label
                key={gt.type}
                aria-label={gt.label}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${selectedType === gt.type ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  backgroundColor:
                    selectedType === gt.type
                      ? 'var(--color-primary-light)'
                      : 'var(--color-surface)',
                  cursor: 'pointer',
                  transition: 'var(--transition)',
                }}
              >
                <input
                  type="radio"
                  name="goal-type"
                  value={gt.type}
                  checked={selectedType === gt.type}
                  onChange={() => setSelectedType(gt.type)}
                  style={{ marginTop: 2, accentColor: 'var(--color-primary)' }}
                />
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>
                    <Trans>{gt.label}</Trans>
                  </div>
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--color-text-muted)',
                      marginTop: 2,
                    }}
                  >
                    <Trans>{gt.description}</Trans>
                  </div>
                </div>
              </label>
            ))}
          </div>

          {/* Amount */}
          <div className="form-group">
            <label className="form-label" htmlFor="goal-amount">
              {selectedType === 'savings-balance' ? (
                <Trans>Target Balance ($)</Trans>
              ) : (
                <Trans>Monthly Amount ($)</Trans>
              )}
            </label>
            <input
              id="goal-amount"
              className="form-input"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
          </div>

          {/* Day of month — for needed-for-spending and debt-payoff */}
          {showDayOfMonth && (
            <div className="form-group">
              <label className="form-label" htmlFor="goal-day">
                <Trans>Due day of month</Trans>
              </label>
              <input
                id="goal-day"
                className="form-input"
                type="number"
                min="1"
                max="31"
                placeholder="e.g. 15"
                value={dayOfMonth}
                onChange={e => setDayOfMonth(e.target.value)}
              />
              <p
                style={{
                  margin: '0.25rem 0 0',
                  fontSize: '0.75rem',
                  color: 'var(--color-text-faint)',
                }}
              >
                <Trans>Use 31 for end of month.</Trans>
              </p>
            </div>
          )}

          {/* Target date — for savings-balance */}
          {showTargetDate && (
            <div className="form-group">
              <label className="form-label" htmlFor="goal-target-date">
                <Trans>Target date</Trans>
              </label>
              <input
                id="goal-target-date"
                className="form-input"
                type="date"
                value={targetDate}
                onChange={e => setTargetDate(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="modal-footer">
          {existingGoal && (
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              style={{ marginRight: 'auto', color: 'var(--color-error)' }}
              onClick={onRemove}
            >
              <Trans>Remove Goal</Trans>
            </button>
          )}
          <button
            className="btn btn-secondary btn-sm"
            type="button"
            onClick={onClose}
          >
            <Trans>Cancel</Trans>
          </button>
          <button
            className="btn btn-primary btn-sm"
            type="button"
            onClick={handleSave}
            disabled={!amount || parseFloat(amount) <= 0}
          >
            <Trans>Save Goal</Trans>
          </button>
        </div>
      </div>
    </div>
  );
}
