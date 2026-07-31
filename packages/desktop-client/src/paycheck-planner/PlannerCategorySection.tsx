import { useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import type { IntegerAmount } from '@actual-app/core/shared/util';
import { integerToAmount } from '@actual-app/core/shared/util';
import type { TransObjectLiteral } from '@actual-app/core/types/util';

import { FinancialText } from '#components/FinancialText';
import { AmountInput } from '#components/util/AmountInput';
import { useFormat } from '#hooks/useFormat';
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
  /** This paycheck's draft (or, once committed, approved) allocation. */
  plannedAmount: IntegerAmount;
  /** Sum of allocations from earlier paychecks this month, in cents. */
  alreadyBudgetedAmount: IntegerAmount;
  /** The envelope's current real balance, live -- see useEnvelopeBalances. */
  currentBalance: IntegerAmount;
  /**
   * The envelope's real balance snapshot taken when this allocation was
   * first drafted (`PlannedAllocation.envelope_balance_at_draft`). `null`
   * when there's no allocation drafted for this envelope yet. Compared
   * against `currentBalance` for the live drift indicator (CLAUDE.md "Live
   * drift indicators").
   */
  balanceAtDraft: IntegerAmount | null;
  isSnowball?: boolean;
  /** True once the paycheck is committed -- allocations are locked in. */
  readOnly?: boolean;
};

type RowItemProps = {
  row: PlannerCategoryRow;
  budgetType: 'envelope' | 'tracking';
  insertBefore?: boolean;
  insertAfter?: boolean;
  onChangeAmount: (id: string, amount: IntegerAmount) => void;
  onRowDragOver: (rowId: string, before: boolean) => void;
  onRowDragLeave: () => void;
};

function PlannerRowItem({
  row,
  budgetType,
  insertBefore,
  insertAfter,
  onChangeAmount,
  onRowDragOver,
  onRowDragLeave,
}: RowItemProps) {
  const { t } = useTranslation();
  const format = useFormat();
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

  const monthlyTarget = goal ? goal.amount : (budgetedCents as number) / 100;

  const assigned = integerToAmount(row.plannedAmount);
  const alreadyBudgeted = integerToAmount(row.alreadyBudgetedAmount);
  const totalAllocated = alreadyBudgeted + assigned;
  const diff = totalAllocated - monthlyTarget;
  const pct =
    monthlyTarget > 0 ? Math.min(totalAllocated / monthlyTarget, 1) : 0;
  const progressColor =
    pct >= 1
      ? 'var(--color-success)'
      : pct > 0
        ? 'var(--color-warning)'
        : 'var(--color-text-faint)';

  const drift =
    row.balanceAtDraft != null ? row.currentBalance - row.balanceAtDraft : null;

  return (
    <>
      <tr
        className={row.isSnowball ? 'snowball-row' : ''}
        draggable
        onDragStart={e => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', `cat:${row.id}`);
        }}
        onDragOver={e => {
          if (e.dataTransfer.types.includes('text/x-section')) return;
          e.preventDefault();
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          onRowDragOver(row.id, e.clientY < rect.top + rect.height / 2);
        }}
        onDragLeave={e => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            onRowDragLeave();
          }
        }}
        style={{
          boxShadow: insertBefore
            ? 'inset 0 2px 0 0 var(--color-primary)'
            : insertAfter
              ? 'inset 0 -2px 0 0 var(--color-primary)'
              : undefined,
        }}
      >
        {/* The div inside td is the flex container — NOT the td itself — to preserve table layout */}
        <td>
          <div className="drag-handle-cell">
            <span className="drag-handle" aria-hidden="true">
              ⠿
            </span>
            <div>
              <span className="category-name">{row.name}</span>
              <span className="category-detail">{row.groupName ?? ''}</span>
            </div>
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
              <FinancialText as="span">
                {currencyFormatter.format(monthlyTarget)}
              </FinancialText>
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
          <FinancialText
            as="span"
            style={{
              color:
                row.alreadyBudgetedAmount > 0
                  ? 'var(--color-text)'
                  : 'var(--color-text-faint)',
            }}
          >
            {format(row.alreadyBudgetedAmount, 'financial')}
          </FinancialText>
        </td>

        <td className="num">
          {row.readOnly ? (
            <FinancialText as="span" style={{ fontWeight: 600 }}>
              {format(row.plannedAmount, 'financial')}
            </FinancialText>
          ) : (
            <AmountInput
              value={row.plannedAmount}
              sign="+"
              onUpdate={amount => onChangeAmount(row.id, amount)}
              style={{ maxWidth: 120, marginLeft: 'auto' }}
              inputClassName="amount-input"
              id={`planner-amount-${row.id}`}
            />
          )}
          {drift != null && (
            <div className="drift-line">
              <Trans>
                Envelope now:{' '}
                <FinancialText as="span">
                  {
                    {
                      balance: format(row.currentBalance, 'financial'),
                    } as TransObjectLiteral
                  }
                </FinancialText>
              </Trans>
              {drift !== 0 && (
                <span className={drift > 0 ? 'diff-positive' : 'diff-negative'}>
                  {' '}
                  <Trans>
                    (
                    <FinancialText as="span">
                      {
                        {
                          drift: format(drift, 'financial-with-sign'),
                        } as TransObjectLiteral
                      }
                    </FinancialText>{' '}
                    since drafted)
                  </Trans>
                </span>
              )}
            </div>
          )}
        </td>

        <td className="num">
          <FinancialText
            as="span"
            className={
              diff > 0
                ? 'diff-positive'
                : diff < 0
                  ? 'diff-negative'
                  : 'diff-zero'
            }
          >
            {currencyFormatter.format(diff)}
          </FinancialText>
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
  sectionKey: string;
  rows: PlannerCategoryRow[];
  budgetType: 'envelope' | 'tracking';
  collapsed: boolean;
  onChangeAmount: (categoryId: string, amount: IntegerAmount) => void;
  onCategoryDrop: (sectionKey: string, categoryId: string) => void;
  onCategoryReorder: (sectionKey: string, orderedIds: string[]) => void;
  onSectionReorder: (
    targetSectionKey: string,
    sourceSectionKey: string,
    position: 'before' | 'after',
  ) => void;
  onToggleCollapse: (sectionKey: string) => void;
  onTitleSave: (sectionKey: string, newTitle: string) => void;
};

export function PlannerCategorySection({
  title,
  sectionKey,
  rows,
  budgetType,
  collapsed,
  onChangeAmount,
  onCategoryDrop,
  onCategoryReorder,
  onSectionReorder,
  onToggleCollapse,
  onTitleSave,
}: Props) {
  const { t } = useTranslation();
  const format = useFormat();
  const [catDragActive, setCatDragActive] = useState(false);
  const [secInsertPos, setSecInsertPos] = useState<'before' | 'after' | null>(
    null,
  );
  const [dragOverRowId, setDragOverRowId] = useState<string | null>(null);
  const [dragInsertBefore, setDragInsertBefore] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitle, setEditingTitle] = useState(title);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const sectionTotal = rows.reduce(
    (sum, row) => sum + (row.plannedAmount || 0),
    0,
  );
  const isEmpty = rows.length === 0;

  const startEditing = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    setEditingTitle(title);
    setIsEditingTitle(true);
    setTimeout(() => titleInputRef.current?.select(), 0);
  };

  const commitTitle = () => {
    const trimmed = editingTitle.trim();
    if (trimmed && trimmed !== title) {
      onTitleSave(sectionKey, trimmed);
    }
    setIsEditingTitle(false);
  };

  const cancelTitle = () => {
    setEditingTitle(title);
    setIsEditingTitle(false);
  };

  return (
    <div
      className={`section-card${catDragActive ? ' cat-drag-over' : ''}${secInsertPos === 'before' ? ' sec-insert-before' : ''}${secInsertPos === 'after' ? ' sec-insert-after' : ''}${collapsed ? ' collapsed' : ''}${isEmpty ? ' section-card-empty' : ''}`}
      onDragOver={e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (e.dataTransfer.types.includes('text/x-section')) {
          const rect = e.currentTarget.getBoundingClientRect();
          setSecInsertPos(
            e.clientY < rect.top + rect.height / 2 ? 'before' : 'after',
          );
          setCatDragActive(false);
        } else {
          // Row-level drag-over is handled by individual rows; only show
          // section highlight when hovering the section but not a specific row.
          if (!dragOverRowId) setCatDragActive(true);
          setSecInsertPos(null);
        }
      }}
      onDragLeave={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setCatDragActive(false);
          setSecInsertPos(null);
          setDragOverRowId(null);
        }
      }}
      onDrop={e => {
        e.preventDefault();
        setCatDragActive(false);
        setSecInsertPos(null);
        const raw = e.dataTransfer.getData('text/plain');
        const currentDragOverRowId = dragOverRowId;
        const currentDragInsertBefore = dragInsertBefore;
        setDragOverRowId(null);

        if (raw.startsWith('cat:')) {
          const draggedId = raw.slice(4);
          const isInThisSection = rows.some(r => r.id === draggedId);

          if (
            isInThisSection &&
            currentDragOverRowId &&
            currentDragOverRowId !== draggedId
          ) {
            // Reorder within the same section
            const ids = rows.map(r => r.id);
            const withoutDragged = ids.filter(id => id !== draggedId);
            const targetIdx = withoutDragged.indexOf(currentDragOverRowId);
            const insertIdx = currentDragInsertBefore
              ? targetIdx
              : targetIdx + 1;
            withoutDragged.splice(insertIdx, 0, draggedId);
            onCategoryReorder(sectionKey, withoutDragged);
          } else if (!isInThisSection) {
            onCategoryDrop(sectionKey, draggedId);
          }
        } else if (raw.startsWith('sec:')) {
          const sourceSectionKey = raw.slice(4);
          if (sourceSectionKey !== sectionKey) {
            const rect = e.currentTarget.getBoundingClientRect();
            const pos =
              e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
            onSectionReorder(sectionKey, sourceSectionKey, pos);
          }
        }
      }}
    >
      {/* Header — click to collapse, drag handle to reorder */}
      <div
        className="section-card-header"
        onClick={() => !isEditingTitle && onToggleCollapse(sectionKey)}
      >
        {/* Section drag handle */}
        <span
          className="section-drag-handle"
          draggable
          onDragStart={e => {
            e.stopPropagation();
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', `sec:${sectionKey}`);
            e.dataTransfer.setData('text/x-section', sectionKey);
          }}
          onClick={e => e.stopPropagation()}
          aria-label={t('Drag to reorder section')}
          title={t('Drag to reorder')}
        >
          ⠿
        </span>

        <div className="section-card-title-wrap">
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              className="section-title-input"
              value={editingTitle}
              onChange={e => setEditingTitle(e.target.value)}
              onBlur={commitTitle}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => {
                if (e.key === 'Enter') commitTitle();
                if (e.key === 'Escape') cancelTitle();
              }}
              aria-label={t('Rename section')}
            />
          ) : (
            <span className="section-card-title">{title}</span>
          )}
          {!isEditingTitle && (
            <button
              type="button"
              className="section-rename-btn"
              onClick={startEditing}
              aria-label={t('Rename {{title}}', { title })}
              title={t('Rename section')}
            >
              ✎
            </button>
          )}
        </div>

        <div className="section-summary">
          {!isEmpty && (
            <FinancialText as="span" className="section-total">
              {format(sectionTotal, 'financial')}
            </FinancialText>
          )}
          <span className="section-count">
            {rows.length}{' '}
            {rows.length === 1 ? (
              <Trans>category</Trans>
            ) : (
              <Trans>categories</Trans>
            )}
          </span>
          {/* Chevron rotates when collapsed */}
          <svg
            className="section-chevron"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </div>

      {/* Body — hidden when collapsed */}
      {!collapsed &&
        (isEmpty ? (
          <div
            className={`section-empty-drop${catDragActive ? ' drop-active' : ''}`}
          >
            <Trans>Drop categories here</Trans>
          </div>
        ) : (
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
            <tbody onDragOver={e => e.preventDefault()}>
              {rows.map(row => (
                <PlannerRowItem
                  key={row.id}
                  row={row}
                  budgetType={budgetType}
                  insertBefore={dragOverRowId === row.id && dragInsertBefore}
                  insertAfter={dragOverRowId === row.id && !dragInsertBefore}
                  onChangeAmount={onChangeAmount}
                  onRowDragOver={(rowId, before) => {
                    setDragOverRowId(rowId);
                    setDragInsertBefore(before);
                    setCatDragActive(false);
                  }}
                  onRowDragLeave={() => setDragOverRowId(null)}
                />
              ))}
            </tbody>
          </table>
        ))}
    </div>
  );
}
