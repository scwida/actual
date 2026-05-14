import { useCallback, useMemo, useState } from 'react';
import { Trans } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import * as monthUtils from '@actual-app/core/shared/months';

import { useCategories } from '#hooks/useCategories';
import { SheetNameProvider } from '#hooks/useSheetName';
import { useSyncedPref } from '#hooks/useSyncedPref';

import { PlannerCategorySection } from './PlannerCategorySection';
import {
  findPlannerSectionKey,
  getPlannerSectionTitle,
  isSnowballCategory,
  PLANNER_SECTIONS,
} from './plannerConfig';
import type { PlannerSectionKey } from './plannerConfig';
import { usePlannerStorage } from './usePlannerStorage';
import type { StoredPaycheck } from './usePlannerStorage';
import './paycheck-planner.css';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

const getMonthFromDate = (value: string) => value.slice(0, 7);

function getPaycheckTotal(paycheck: StoredPaycheck) {
  return paycheck.scott + paycheck.katie + paycheck.other;
}

function getStatusClass(totalIncome: number, budgeted: number) {
  if (budgeted <= 0) return 'status-pending';
  if (budgeted >= totalIncome) return 'status-complete';
  return 'status-partial';
}

function generateId() {
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

type Category = {
  id: string;
  name: string;
  hidden?: boolean;
  is_income?: boolean;
};

type CategoryGroup = {
  id: string;
  name: string;
  is_income?: boolean;
  categories?: Category[];
};

type PlannerCategory = {
  id: string;
  name: string;
  groupId: string;
  groupName: string;
  sectionKey: PlannerSectionKey;
  isIncome: boolean;
};

type EditModalState = {
  mode: 'add' | 'edit';
  paycheckId: string | null;
  date: string;
  scott: string;
  katie: string;
  other: string;
};

export function PaycheckPlannerPage() {
  const [budgetType = 'envelope'] = useSyncedPref('budgetType');

  const {
    paychecks,
    allocations,
    categoryAssignments,
    categoryOrder,
    sectionTitles,
    sectionOrder,
    collapsedSections,
    updateAllocation,
    updateHoldForFuture,
    updateCategoryOrder,
    addPaycheck,
    updatePaycheck,
    deletePaycheck,
    updateCategorySection,
    updateSectionTitle,
    updateSectionOrder,
    toggleSectionCollapsed,
  } = usePlannerStorage();

  const [activePaycheckId, setActivePaycheckId] = useState<string>(
    () => paychecks[0]?.id ?? '',
  );
  const [editModal, setEditModal] = useState<EditModalState | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const { data } = useCategories();

  const activePaycheck =
    paychecks.find(p => p.id === activePaycheckId) ?? paychecks[0];

  const activeMonth = activePaycheck
    ? getMonthFromDate(activePaycheck.date)
    : getMonthFromDate(new Date().toISOString());

  const paycheckIndex = paychecks.findIndex(p => p.id === activePaycheck?.id);

  const plannerData = useMemo(() => {
    const categoryGroups = (data?.grouped ?? []) as CategoryGroup[];
    const categories: PlannerCategory[] = categoryGroups.flatMap(group =>
      (group.categories ?? [])
        .filter(c => !c.hidden)
        .map(c => {
          const isIncome = Boolean(group.is_income || c.is_income);
          const sectionKey = isIncome
            ? 'income'
            : (categoryAssignments[c.id] ??
              findPlannerSectionKey(c.name, false));
          return {
            id: c.id,
            name: c.name,
            groupId: group.id,
            groupName: group.name,
            sectionKey: sectionKey as PlannerSectionKey,
            isIncome,
          };
        }),
    );

    const incomeCategories = categories.filter(c => c.isIncome);

    const defaultSections = PLANNER_SECTIONS.filter(s => s.key !== 'income');
    const allKeys = [...defaultSections.map(s => s.key as string), 'other'];
    const orderedKeys =
      sectionOrder.length > 0
        ? [
            ...sectionOrder.filter(k => allKeys.includes(k)),
            ...allKeys.filter(k => !sectionOrder.includes(k)),
          ]
        : allKeys;
    const customSections = orderedKeys.map(key => {
      const sectionCats = categories.filter(
        c => !c.isIncome && c.sectionKey === key,
      );
      const storedOrder = categoryOrder[key] ?? [];
      const catById = Object.fromEntries(sectionCats.map(c => [c.id, c]));
      const sorted = [
        ...storedOrder.filter(id => catById[id]).map(id => catById[id]),
        ...sectionCats.filter(c => !storedOrder.includes(c.id)),
      ];

      if (key === 'other') {
        return {
          key: 'other' as const,
          title: sectionTitles['other'] ?? getPlannerSectionTitle('other'),
          categories: sorted,
        };
      }
      const s = defaultSections.find(sec => sec.key === key)!;
      return {
        key: s.key,
        title: sectionTitles[s.key] ?? s.title,
        categories: sorted,
      };
    });

    return { incomeCategories, customSections };
  }, [data, categoryAssignments, categoryOrder, sectionTitles, sectionOrder]);

  // Paychecks sorted by date — used to find the immediately previous paycheck
  const sortedPaychecks = useMemo(
    () => [...paychecks].sort((a, b) => a.date.localeCompare(b.date)),
    [paychecks],
  );

  // carriedIn: holdForFuture from the paycheck immediately before the active one
  const carriedIn = useMemo(() => {
    if (!activePaycheck) return 0;
    const idx = sortedPaychecks.findIndex(p => p.id === activePaycheck.id);
    if (idx <= 0) return 0;
    return sortedPaychecks[idx - 1].holdForFuture ?? 0;
  }, [sortedPaychecks, activePaycheck]);

  // carriedIn map for every paycheck — used by the nav panel status dots
  const carriedInMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (let i = 1; i < sortedPaychecks.length; i++) {
      map[sortedPaychecks[i].id] = sortedPaychecks[i - 1].holdForFuture ?? 0;
    }
    return map;
  }, [sortedPaychecks]);

  const budgeted = useMemo(() => {
    if (!activePaycheck) return 0;
    return Object.values(allocations[activePaycheck.id] ?? {}).reduce(
      (sum, v) => sum + (Number(v) || 0),
      0,
    );
  }, [allocations, activePaycheck]);

  // Sum of allocations from all other paychecks in the same month, keyed by category id.
  const priorAllocations = useMemo(() => {
    if (!activePaycheck) return {} as Record<string, number>;
    const result: Record<string, number> = {};
    for (const p of paychecks) {
      if (p.id === activePaycheck.id) continue;
      if (getMonthFromDate(p.date) !== activeMonth) continue;
      for (const [catId, amount] of Object.entries(allocations[p.id] ?? {})) {
        result[catId] = (result[catId] ?? 0) + (Number(amount) || 0);
      }
    }
    return result;
  }, [paychecks, allocations, activePaycheck, activeMonth]);

  const totalIncome = activePaycheck ? getPaycheckTotal(activePaycheck) : 0;
  const totalAvailable = totalIncome + carriedIn;
  const holdForFuture = activePaycheck?.holdForFuture ?? 0;
  const remaining = totalAvailable - budgeted - holdForFuture;

  // Label for the next calendar month, e.g. "June"
  const nextMonthLabel = useMemo(() => {
    const next = monthUtils.nextMonth(activeMonth);
    return new Date(next + '-02').toLocaleDateString('en-US', {
      month: 'long',
    });
  }, [activeMonth]);

  const handleAllocationChange = useCallback(
    (categoryId: string, value: string) => {
      if (!activePaycheck) return;
      const dollars = Number.isFinite(Number(value)) ? Number(value) : 0;
      updateAllocation(activePaycheck.id, categoryId, dollars);
      setHasUnsavedChanges(true);
    },
    [activePaycheck, updateAllocation],
  );

  const handleHoldForFutureChange = useCallback(
    (value: string) => {
      if (!activePaycheck) return;
      const dollars = Number.isFinite(Number(value))
        ? Math.max(0, Number(value))
        : 0;
      updateHoldForFuture(activePaycheck.id, dollars);
      setHasUnsavedChanges(true);
    },
    [activePaycheck, updateHoldForFuture],
  );

  const applyToBudget = useCallback(async () => {
    if (!activePaycheck) return;
    const monthPaychecks = paychecks.filter(
      p => getMonthFromDate(p.date) === activeMonth,
    );
    // Collect every category that has any allocation in this month.
    const categoryIds = new Set<string>(
      monthPaychecks.flatMap(p => Object.keys(allocations[p.id] ?? {})),
    );
    await Promise.all(
      [...categoryIds].map(categoryId => {
        const totalDollars = monthPaychecks.reduce(
          (sum, p) => sum + (allocations[p.id]?.[categoryId] ?? 0),
          0,
        );
        return send('budget/budget-amount', {
          month: activeMonth,
          category: categoryId,
          amount: Math.round(totalDollars * 100),
        });
      }),
    );
    setHasUnsavedChanges(false);
  }, [activePaycheck, activeMonth, paychecks, allocations]);

  const openAddModal = useCallback(() => {
    setEditModal({
      mode: 'add',
      paycheckId: null,
      date: new Date().toISOString().slice(0, 10),
      scott: '0',
      katie: '0',
      other: '0',
    });
  }, []);

  const openEditModal = useCallback(() => {
    if (!activePaycheck) return;
    setEditModal({
      mode: 'edit',
      paycheckId: activePaycheck.id,
      date: activePaycheck.date,
      scott: String(activePaycheck.scott),
      katie: String(activePaycheck.katie),
      other: String(activePaycheck.other),
    });
  }, [activePaycheck]);

  const closeModal = useCallback(() => setEditModal(null), []);

  const saveModal = useCallback(() => {
    if (!editModal) return;
    const payload = {
      date: editModal.date,
      scott: Number(editModal.scott) || 0,
      katie: Number(editModal.katie) || 0,
      other: Number(editModal.other) || 0,
    };
    if (editModal.mode === 'add') {
      const newId = generateId();
      addPaycheck({ id: newId, ...payload });
      setActivePaycheckId(newId);
    } else if (editModal.paycheckId) {
      updatePaycheck({ id: editModal.paycheckId, ...payload });
    }
    setEditModal(null);
  }, [editModal, addPaycheck, updatePaycheck]);

  const handleDeletePaycheck = useCallback(() => {
    if (!activePaycheck || paychecks.length <= 1) return;
    const nextId =
      paychecks[paycheckIndex + 1]?.id ?? paychecks[paycheckIndex - 1]?.id;
    deletePaycheck(activePaycheck.id);
    if (nextId) setActivePaycheckId(nextId);
    setEditModal(null);
  }, [activePaycheck, paychecks, paycheckIndex, deletePaycheck]);

  const goToPrevPaycheck = useCallback(() => {
    if (paycheckIndex > 0) setActivePaycheckId(paychecks[paycheckIndex - 1].id);
  }, [paycheckIndex, paychecks]);

  const goToNextPaycheck = useCallback(() => {
    if (paycheckIndex < paychecks.length - 1) {
      setActivePaycheckId(paychecks[paycheckIndex + 1].id);
    }
  }, [paycheckIndex, paychecks]);

  const handleCategoryDrop = useCallback(
    (targetSectionKey: string, categoryId: string) => {
      if (!categoryId || targetSectionKey === 'income') return;
      updateCategorySection(categoryId, targetSectionKey);
      // Append to end of target section's order (removes from source implicitly
      // because the category no longer belongs to that section)
      const currentOrder = categoryOrder[targetSectionKey] ?? [];
      if (!currentOrder.includes(categoryId)) {
        updateCategoryOrder(targetSectionKey, [...currentOrder, categoryId]);
      }
    },
    [updateCategorySection, updateCategoryOrder, categoryOrder],
  );

  const handleCategoryReorder = useCallback(
    (sectionKey: string, orderedIds: string[]) => {
      updateCategoryOrder(sectionKey, orderedIds);
    },
    [updateCategoryOrder],
  );

  const handleTitleSave = useCallback(
    (sectionKey: string, newTitle: string) => {
      updateSectionTitle(sectionKey, newTitle);
    },
    [updateSectionTitle],
  );

  const handleSectionReorder = useCallback(
    (
      targetSectionKey: string,
      sourceSectionKey: string,
      position: 'before' | 'after',
    ) => {
      const currentKeys = plannerData.customSections.map(s => s.key as string);
      const filtered = currentKeys.filter(k => k !== sourceSectionKey);
      const targetIndex = filtered.indexOf(targetSectionKey);
      if (targetIndex === -1) return;
      const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
      filtered.splice(insertIndex, 0, sourceSectionKey);
      updateSectionOrder(filtered);
    },
    [plannerData.customSections, updateSectionOrder],
  );

  const handleToggleCollapse = useCallback(
    (sectionKey: string) => {
      toggleSectionCollapsed(sectionKey);
    },
    [toggleSectionCollapsed],
  );

  if (paychecks.length === 0) {
    return (
      <View
        style={{
          padding: 24,
          color: theme.pageText,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <p style={{ color: theme.pageTextLight, margin: 0 }}>
          <Trans>No paychecks yet. Add your first one to get started.</Trans>
        </p>
        <button
          className="btn btn-primary"
          type="button"
          onClick={openAddModal}
        >
          <Trans>Add Paycheck</Trans>
        </button>
      </View>
    );
  }

  const resolvedBudgetType =
    budgetType === 'tracking' ? 'tracking' : 'envelope';

  return (
    <View
      style={{
        padding: '0 16px 16px',
        color: theme.pageText,
        height: '100%',
        boxSizing: 'border-box',
        overflowY: 'auto',
      }}
    >
      {/* Page header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: '1.5rem',
          gap: '0.75rem',
        }}
      >
        <div>
          <div className="topbar-title">
            <Trans>Paycheck Planner</Trans>
          </div>
          <div className="topbar-subtitle">
            <Trans>Allocate each paycheck before you spend it</Trans>
          </div>
        </div>
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'center',
          }}
        >
          {hasUnsavedChanges && (
            <span
              style={{
                fontSize: '0.75rem',
                color: 'var(--color-warning)',
                fontWeight: 500,
              }}
            >
              <Trans>Unsaved changes</Trans>
            </span>
          )}
          <button
            className="btn btn-secondary btn-sm"
            type="button"
            onClick={openAddModal}
          >
            <Trans>Add Paycheck</Trans>
          </button>
          <button
            className={`btn btn-sm${hasUnsavedChanges ? ' btn-primary' : ' btn-secondary'}`}
            type="button"
            onClick={() => void applyToBudget()}
            disabled={!hasUnsavedChanges}
          >
            <Trans>Apply to Budget</Trans>
          </button>
        </div>
      </header>

      {/* Income strip */}
      <div className="income-strip">
        <div className="income-strip-top">
          <div className="income-strip-item">
            <div className="income-strip-label">
              <Trans>Paycheck Date</Trans>
            </div>
            <div className="income-strip-value">
              {formatDate(activePaycheck.date)}
            </div>
          </div>

          <div className="income-divider" />

          <div className="income-strip-item">
            <div className="income-strip-label">
              <Trans>Scott</Trans>
            </div>
            <div className="income-strip-value">
              {currencyFormatter.format(activePaycheck.scott)}
            </div>
          </div>

          <div className="income-strip-item">
            <div className="income-strip-label">
              <Trans>Katie</Trans>
            </div>
            <div className="income-strip-value">
              {currencyFormatter.format(activePaycheck.katie)}
            </div>
          </div>

          <div className="income-strip-item">
            <div className="income-strip-label">
              <Trans>Other</Trans>
            </div>
            <div className="income-strip-value">
              {currencyFormatter.format(activePaycheck.other)}
            </div>
          </div>

          <div className="income-divider" />

          {carriedIn > 0 && (
            <>
              <div className="income-strip-item">
                <div className="income-strip-label">
                  <Trans>Carried In</Trans>
                </div>
                <div className="income-strip-value carried-in-value">
                  +{currencyFormatter.format(carriedIn)}
                </div>
              </div>
              <div className="income-divider" />
            </>
          )}

          <div className="income-strip-item">
            <div className="income-strip-label">
              {carriedIn > 0 ? (
                <Trans>Total Available</Trans>
              ) : (
                <Trans>Total Income</Trans>
              )}
            </div>
            <div className="income-strip-value highlight">
              {currencyFormatter.format(totalAvailable)}
            </div>
          </div>

          <div className="income-divider" />

          <div className="income-strip-item">
            <div className="income-strip-label">
              <Trans>Budgeted</Trans>
            </div>
            <div className="income-strip-value">
              {currencyFormatter.format(budgeted)}
            </div>
          </div>

          {holdForFuture > 0 && (
            <div className="income-strip-item">
              <div className="income-strip-label">
                <Trans>Hold for </Trans>
                {nextMonthLabel}
              </div>
              <div className="income-strip-value held-value">
                {currencyFormatter.format(holdForFuture)}
              </div>
            </div>
          )}

          <div className="income-strip-item">
            <div className="income-strip-label">
              <Trans>Left to Budget</Trans>
            </div>
            <div
              className={`income-strip-value highlight${remaining < 0 ? ' remaining-under' : ''}`}
            >
              {currencyFormatter.format(remaining)}
            </div>
          </div>
        </div>

        <div className="income-strip-bottom">
          <div className="paycheck-strip">
            <button
              className="paycheck-nav-btn"
              type="button"
              onClick={goToPrevPaycheck}
              disabled={paycheckIndex <= 0}
            >
              &laquo;
            </button>
            <div className="paycheck-strip-inner">
              {paychecks.map(p => (
                <button
                  key={p.id}
                  type="button"
                  className={`paycheck-chip${p.id === activePaycheck.id ? ' active' : ''}`}
                  onClick={() => setActivePaycheckId(p.id)}
                >
                  {formatDate(p.date)}
                </button>
              ))}
            </div>
            <button
              className="paycheck-nav-btn"
              type="button"
              onClick={goToNextPaycheck}
              disabled={paycheckIndex >= paychecks.length - 1}
            >
              &raquo;
            </button>
          </div>

          <button
            className="paycheck-status-pill"
            type="button"
            onClick={openEditModal}
          >
            <Trans>Edit Paycheck</Trans>
          </button>

          <span className="paycheck-status-pill">
            <Trans>Status</Trans>:{' '}
            {budgeted <= 0 ? (
              <Trans>Not started</Trans>
            ) : remaining <= 0 ? (
              <Trans>Fully allocated</Trans>
            ) : (
              <Trans>In progress</Trans>
            )}
          </span>

          <span className="paycheck-status-pill">
            <Trans>Month</Trans>: {activeMonth}
          </span>
        </div>
      </div>

      {/* Main layout */}
      <div className="planner-layout">
        {/* Left nav panel */}
        <div className="paycheck-nav-panel">
          <div className="panel-header">
            <span>
              <Trans>Paychecks</Trans>
            </span>
            <span
              className="paycheck-status-pill"
              style={{
                borderColor: 'rgba(0,0,0,0.1)',
                color: 'var(--color-text-muted)',
              }}
            >
              {paychecks.length}
            </span>
          </div>
          <div className="month-list">
            {paychecks.map(p => {
              const total = getPaycheckTotal(p);
              const carried = carriedInMap[p.id] ?? 0;
              const allocated = Object.values(allocations[p.id] ?? {}).reduce(
                (sum, v) => sum + (Number(v) || 0),
                0,
              );
              const held = p.holdForFuture ?? 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`paycheck-item${p.id === activePaycheck.id ? ' active' : ''}`}
                  onClick={() => setActivePaycheckId(p.id)}
                  style={{ textAlign: 'left' }}
                >
                  <div>
                    <div className="paycheck-date">{formatDate(p.date)}</div>
                    <div className="paycheck-amount">
                      {currencyFormatter.format(total + carried)}
                    </div>
                  </div>
                  <span
                    className={`paycheck-status ${getStatusClass(total + carried, allocated + held)}`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* Allocation panel — wrapped in SheetNameProvider for the active month */}
        <SheetNameProvider name={monthUtils.sheetForMonth(activeMonth)}>
          <div className="allocation-panel">
            {plannerData.customSections.map(section => (
              <PlannerCategorySection
                key={section.key}
                title={section.title}
                sectionKey={section.key}
                budgetType={resolvedBudgetType}
                collapsed={collapsedSections.includes(section.key as string)}
                rows={section.categories.map(c => ({
                  id: c.id,
                  name: c.name,
                  groupName: c.groupName,
                  planned: allocations[activePaycheck.id]?.[c.id] ?? 0,
                  alreadyBudgeted: priorAllocations[c.id] ?? 0,
                  isSnowball: isSnowballCategory(c.name),
                }))}
                onChangeAmount={handleAllocationChange}
                onCategoryDrop={handleCategoryDrop}
                onCategoryReorder={handleCategoryReorder}
                onSectionReorder={handleSectionReorder}
                onToggleCollapse={handleToggleCollapse}
                onTitleSave={handleTitleSave}
              />
            ))}

            {/* Hold for Future row — reserves dollars from this paycheck for next month */}
            <div className="hold-forward-card">
              <div className="hold-forward-row">
                <div className="hold-forward-left">
                  <span className="hold-forward-arrow">→</span>
                  <div>
                    <div className="hold-forward-label">
                      <Trans>Hold for {{ nextMonthLabel }}</Trans>
                    </div>
                    <div className="hold-forward-hint">
                      <Trans>
                        Reserve dollars for next month — carried into your next
                        paycheck
                      </Trans>
                    </div>
                  </div>
                </div>
                <input
                  type="number"
                  className="amount-input hold-forward-input"
                  min="0"
                  step="1"
                  value={holdForFuture || ''}
                  placeholder="0"
                  onChange={e => handleHoldForFutureChange(e.target.value)}
                />
              </div>
              {holdForFuture > 0 && (
                <div className="hold-forward-summary">
                  <Trans>
                    {currencyFormatter.format(holdForFuture)} will be available
                    in your next paycheck
                  </Trans>
                </div>
              )}
            </div>
          </div>
        </SheetNameProvider>
      </div>

      {/* Add / Edit paycheck modal */}
      {editModal && (
        <div className="modal-backdrop open">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">
                {editModal.mode === 'add' ? (
                  <Trans>Add Paycheck</Trans>
                ) : (
                  <Trans>Edit Paycheck</Trans>
                )}
              </span>
              <button type="button" onClick={closeModal}>
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label className="form-label" htmlFor="paycheck-date">
                  <Trans>Date</Trans>
                </label>
                <input
                  id="paycheck-date"
                  className="form-input"
                  type="date"
                  value={editModal.date}
                  onChange={e =>
                    setEditModal(
                      prev => prev && { ...prev, date: e.target.value },
                    )
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="paycheck-scott">
                  <Trans>Scott</Trans>
                </label>
                <input
                  id="paycheck-scott"
                  className="form-input"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editModal.scott}
                  onChange={e =>
                    setEditModal(
                      prev => prev && { ...prev, scott: e.target.value },
                    )
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="paycheck-katie">
                  <Trans>Katie</Trans>
                </label>
                <input
                  id="paycheck-katie"
                  className="form-input"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editModal.katie}
                  onChange={e =>
                    setEditModal(
                      prev => prev && { ...prev, katie: e.target.value },
                    )
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="paycheck-other">
                  <Trans>Other</Trans>
                </label>
                <input
                  id="paycheck-other"
                  className="form-input"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editModal.other}
                  onChange={e =>
                    setEditModal(
                      prev => prev && { ...prev, other: e.target.value },
                    )
                  }
                />
              </div>
            </div>

            <div className="modal-footer">
              {editModal.mode === 'edit' && paychecks.length > 1 && (
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  style={{ marginRight: 'auto', color: 'var(--color-error)' }}
                  onClick={handleDeletePaycheck}
                >
                  <Trans>Delete</Trans>
                </button>
              )}
              <button
                className="btn btn-secondary btn-sm"
                type="button"
                onClick={closeModal}
              >
                <Trans>Cancel</Trans>
              </button>
              <button
                className="btn btn-primary btn-sm"
                type="button"
                onClick={saveModal}
              >
                <Trans>Save</Trans>
              </button>
            </div>
          </div>
        </div>
      )}
    </View>
  );
}
