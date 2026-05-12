import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { GoalModal } from './GoalModal';
import { useGoalsContext } from './GoalsContext';
import type { CategoryGoal } from './useGoals';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

function goalLabel(goal: CategoryGoal, compact: boolean): string {
  if (compact) return '';
  switch (goal.type) {
    case 'monthly-contribution':
      return ' Monthly';
    case 'needed-for-spending':
      return goal.dayOfMonth ? ` By the ${goal.dayOfMonth}th` : ' Monthly';
    case 'savings-balance':
      return goal.targetDate ? ` By ${goal.targetDate}` : ' Savings';
    case 'debt-payoff':
      return goal.dayOfMonth ? ` Due the ${goal.dayOfMonth}th` : ' Debt';
    default:
      return '';
  }
}

type Props = {
  categoryId: string;
  categoryName: string;
  /** Compact mode for the budget sidebar — shows amount only, no label text */
  compact?: boolean;
  /** Hide the chip entirely when no goal is set (caller applies .hover-visible CSS class instead) */
  hideWhenNoGoal?: boolean;
};

export function CategoryGoalChip({
  categoryId,
  categoryName,
  compact = false,
  hideWhenNoGoal = false,
}: Props) {
  const { t } = useTranslation();
  const { goals, setGoal, removeGoal } = useGoalsContext();
  const [modalOpen, setModalOpen] = useState(false);
  const goal = goals[categoryId];

  if (!goal && hideWhenNoGoal) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        title={goal ? t('Edit goal') : t('Set a goal')}
        style={{
          flexShrink: 0,
          border: goal
            ? '1px solid var(--color-primary)'
            : '1px solid var(--color-border)',
          background: goal ? 'var(--color-primary-light)' : 'transparent',
          cursor: 'pointer',
          fontSize: '0.7rem',
          padding: '2px 6px',
          borderRadius: 'var(--radius-full)',
          color: goal ? 'var(--color-primary)' : 'var(--color-text-faint)',
          fontWeight: goal ? 600 : 400,
          whiteSpace: 'nowrap',
          lineHeight: 1.4,
        }}
      >
        {goal ? (
          <>
            {currencyFormatter.format(goal.amount)}
            {!compact && (
              <span style={{ fontWeight: 400 }}>{goalLabel(goal, false)}</span>
            )}
          </>
        ) : (
          <Trans>+ Goal</Trans>
        )}
      </button>

      {modalOpen && (
        <GoalModal
          categoryId={categoryId}
          categoryName={categoryName}
          existingGoal={goal}
          onSave={saved => {
            setGoal(saved);
            setModalOpen(false);
          }}
          onRemove={() => {
            removeGoal(categoryId);
            setModalOpen(false);
          }}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
