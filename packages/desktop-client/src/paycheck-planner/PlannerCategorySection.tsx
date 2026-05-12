import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { useSheetValue } from '#hooks/useSheetValue';
import { envelopeBudget, trackingBudget } from '#spreadsheet/bindings';

import { GoalModal } from './GoalModal';
import { useGoalsContext } from './GoalsContext';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export type PlannerCategoryRow = {
  id: string;
  name: string;
  groupName?: string;
  planned: number;
  alreadyBudgeted: number;
  isSnowball?: boolean;
};

type RowItemProps = {
  row: PlannerCategoryRow;
  budgetType: 'envelope' | 'tracking';
  onChangeAmount: (id: string, value: string) => void;
};

function PlannerRowItem({ row, budgetType, onChangeAmount }: RowItemProps) {
  const { t } = useTranslation();
  const { goals, setGoal, removeGoal } = useGoalsContext();
  const goal = goals[row.id];
  const [goalModalOpen, setGoalModalOpen] = useState(false);

  const envelopeCents =
    useSheetValue<'envelope-budget', 'budget'>(
      envelopeBudget.catBudgeted(row.id),
    ) ?? 0;
  const trackingCents =
    useSheetValue<'tracking-budget', 'budget'>(
      trackingBudget.catBudgeted(row.id),
    ) ?? 0;
  const budgetedCents =
    budgetType === 'tracking' ? trackingCents : envelopeCents;

  // Goal amount takes priority over Actual's current budgeted amount.
  const monthlyTarget = goal ? goal.amount : (budgetedCents as number) / 100;

  const assigned = row.planned;
  const totalAllocated = row.alreadyBudgeted + assigned;
  const diff = totalAllocated - monthlyTarget;
  const pct = monthlyTarget > 0 ? Math.min(totalAllocated / monthlyTarget, 1) : 0;
  const progressColor =
    pct >= 1
      ? 'var(--color-success)'
      : pct > 0
        ? 'var(--color-warning)'
        : 'var(--color-text-faint)';

  return (
    <>
      <tr className={row.isSnowball ? 'snowball-row' : ''}>
        <td>
          <div>
            <span className="category-name">{row.name}</span>
            <span className="category-detail">{row.groupName ?? ''}</span>
          </div>
        </td>

        <td className="num">
          {goal ? (
            <button
              type="button"
              onClick={() => setGoalModalOpen(true)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: 'var(--color-primary)',
                fontWeight: 600,
                fontSize: 'inherit',
                fontFamily: 'inherit',
              }}
              title={t('Edit goal')}
            >
              {currencyFormatter.format(monthlyTarget)}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setGoalModalOpen(true)}
              style={{
                background: 'none',
                border: '1.5px dashed var(--color-border)',
                borderRadius: 'var(--radius-full)',
                padding: '2px 10px',
                cursor: 'pointer',
                color: 'var(--color-text-faint)',
                fontSize: '0.75rem',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              {t('+ Goal')}
            </button>
          )}
        </td>

        <td className="num">
          <span
            style={{
              color:
                row.alreadyBudgeted > 0
                  ? 'var(--color-text)'
                  : 'var(--color-text-faint)',
            }}
          >
            {currencyFormatter.format(row.alreadyBudgeted)}
          </span>
        </td>

        <td className="num">
          <input
            className="amount-input"
            type="number"
            min="0"
            step="0.01"
            value={assigned}
            onChange={e => onChangeAmount(row.id, e.target.value)}
            aria-label={t('Amount for {{name}}', { name: row.name })}
          />
        </td>

        <td className="num">
          <span
            className={
              diff > 0
                ? 'diff-positive'
                : diff < 0
                  ? 'diff-negative'
                  : 'diff-zero'
            }
          >
            {currencyFormatter.format(diff)}
          </span>
          <span className="progress-bar-wrap">
            <span
              className="progress-bar-fill"
              style={{
                width: `${pct * 100}%`,
                backgroundColor: progressColor,
              }}
            />
          </span>
        </td>
      </tr>
      {goalModalOpen && (
        <GoalModal
          categoryId={row.id}
          categoryName={row.name}
          existingGoal={goal}
          onSave={g => {
            setGoal(g);
            setGoalModalOpen(false);
          }}
          onRemove={() => {
            removeGoal(row.id);
            setGoalModalOpen(false);
          }}
          onClose={() => setGoalModalOpen(false)}
        />
      )}
    </>
  );
}

type Props = {
  title: string;
  rows: PlannerCategoryRow[];
  budgetType: 'envelope' | 'tracking';
  onChangeAmount: (categoryId: string, value: string) => void;
};

export function PlannerCategorySection({
  title,
  rows,
  budgetType,
  onChangeAmount,
}: Props) {
  const sectionTotal = rows.reduce((sum, row) => sum + (row.planned || 0), 0);

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="section-card">
      <div className="section-card-header">
        <div className="section-card-title">{title}</div>
        <div className="section-summary">
          <span className="section-total">
            {currencyFormatter.format(sectionTotal)}
          </span>
        </div>
      </div>

      <table className="alloc-table">
        <thead>
          <tr>
            <th>
              <Trans>Category</Trans>
            </th>
            <th className="num">
              <Trans>Monthly Target</Trans>
            </th>
            <th className="num">
              <Trans>Already Budgeted</Trans>
            </th>
            <th className="num">
              <Trans>This Paycheck</Trans>
            </th>
            <th className="num">
              <Trans>vs Target</Trans>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <PlannerRowItem
              key={row.id}
              row={row}
              budgetType={budgetType}
              onChangeAmount={onChangeAmount}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
