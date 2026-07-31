import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { PlannedPaycheck } from '@actual-app/core/server/envelopes/planner/types';
import * as monthUtils from '@actual-app/core/shared/months';
import type { IntegerAmount } from '@actual-app/core/shared/util';

import { FinancialText } from '#components/FinancialText';
import { AmountInput } from '#components/util/AmountInput';
import { useCategories } from '#hooks/useCategories';
import { useFormat } from '#hooks/useFormat';
import { SheetNameProvider } from '#hooks/useSheetName';
import { useSyncedPref } from '#hooks/useSyncedPref';
import { addNotification } from '#notifications/notificationsSlice';
import { useDispatch } from '#redux';

import { CommitPaycheckModal } from './CommitPaycheckModal';
import { PlannerCategorySection } from './PlannerCategorySection';
import {
  findPlannerSectionKey,
  getPlannerSectionTitle,
  isSnowballCategory,
  PLANNER_SECTIONS,
} from './plannerConfig';
import type { PlannerSectionKey } from './plannerConfig';
import { useEnvelopeBalances } from './useEnvelopeBalances';
import {
  cancelPlannedPaycheck,
  createPlannedPaycheck,
  updateDraftAllocation,
  usePlannedAllocations,
  usePlannedPaychecks,
} from './usePlannedPaychecks';
import { usePlannerLayoutPrefs } from './usePlannerLayoutPrefs';
import './paycheck-planner.css';

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

const getMonthFromDate = (value: string) => value.slice(0, 7);

/**
 * A paycheck's committed allocations are locked in via `approved_amount`
 * (set once, at commit time -- CLAUDE.md "Historical lock-in"); a draft
 * paycheck's current intent is just its live `amount`.
 */
function effectiveAllocationAmount(
  paycheck: Pick<PlannedPaycheck, 'status'>,
  allocation: { amount: IntegerAmount; approved_amount?: IntegerAmount | null },
): IntegerAmount {
  return paycheck.status === 'committed'
    ? (allocation.approved_amount ?? 0)
    : allocation.amount;
}

function getStatusClass(totalIncome: IntegerAmount, budgeted: IntegerAmount) {
  if (budgeted <= 0) return 'status-pending';
  if (budgeted >= totalIncome) return 'status-complete';
  return 'status-partial';
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

type AddPaycheckModalState = {
  date: string;
  amount: IntegerAmount;
};

export function PaycheckPlannerPage() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const format = useFormat();
  const [budgetType = 'envelope'] = useSyncedPref('budgetType');

  const {
    categoryAssignments,
    categoryOrder,
    sectionTitles,
    sectionOrder,
    collapsedSections,
    updateCategoryOrder,
    updateCategorySection,
    updateSectionTitle,
    updateSectionOrder,
    toggleSectionCollapsed,
  } = usePlannerLayoutPrefs();

  const { paychecks, isLoading: paychecksLoading } = usePlannedPaychecks();
  const { byPaycheck: allocationsByPaycheck } = usePlannedAllocations();
  const { balances } = useEnvelopeBalances();
  const { data } = useCategories();

  const [activePaycheckId, setActivePaycheckId] = useState<string | null>(null);
  const [addModal, setAddModal] = useState<AddPaycheckModalState | null>(null);
  const [commitModalOpen, setCommitModalOpen] = useState(false);

  // Keep the active selection valid as the (live) paycheck list loads or
  // changes -- e.g. after canceling the currently active one.
  useEffect(() => {
    if (paychecks.length === 0) return;
    if (!activePaycheckId || !paychecks.some(p => p.id === activePaycheckId)) {
      setActivePaycheckId(paychecks[0].id);
    }
  }, [paychecks, activePaycheckId]);

  const activePaycheck = paychecks.find(p => p.id === activePaycheckId) ?? null;
  const isCommitted = activePaycheck?.status === 'committed';

  const activeMonth = activePaycheck
    ? getMonthFromDate(activePaycheck.expected_date)
    : getMonthFromDate(new Date().toISOString());

  const paycheckIndex = activePaycheck
    ? paychecks.findIndex(p => p.id === activePaycheck.id)
    : -1;

  const activeAllocations = useMemo(
    () =>
      activePaycheck ? (allocationsByPaycheck[activePaycheck.id] ?? []) : [],
    [allocationsByPaycheck, activePaycheck],
  );

  const activeAllocationsByEnvelope = useMemo(() => {
    const map: Record<string, (typeof activeAllocations)[number]> = {};
    for (const allocation of activeAllocations) {
      map[allocation.envelope_id] = allocation;
    }
    return map;
  }, [activeAllocations]);

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

    return { customSections };
  }, [data, categoryAssignments, categoryOrder, sectionTitles, sectionOrder]);

  const envelopeNamesById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of data?.list ?? []) {
      map[c.id] = c.name;
    }
    return map;
  }, [data]);

  // Sum of allocations from every OTHER paycheck in the same month, keyed
  // by envelope id -- committed paychecks contribute their approved
  // amount, drafts contribute their current draft amount.
  const priorAllocationsByEnvelope = useMemo(() => {
    if (!activePaycheck) return {} as Record<string, IntegerAmount>;
    const result: Record<string, IntegerAmount> = {};
    for (const paycheck of paychecks) {
      if (paycheck.id === activePaycheck.id) continue;
      if (getMonthFromDate(paycheck.expected_date) !== activeMonth) continue;
      for (const allocation of allocationsByPaycheck[paycheck.id] ?? []) {
        result[allocation.envelope_id] =
          (result[allocation.envelope_id] ?? 0) +
          effectiveAllocationAmount(paycheck, allocation);
      }
    }
    return result;
  }, [paychecks, allocationsByPaycheck, activePaycheck, activeMonth]);

  const budgetedThisPaycheck = useMemo(() => {
    if (!activePaycheck) return 0;
    return activeAllocations.reduce(
      (sum, a) => sum + effectiveAllocationAmount(activePaycheck, a),
      0,
    );
  }, [activePaycheck, activeAllocations]);

  const totalAvailable = activePaycheck
    ? isCommitted
      ? (activePaycheck.actual_amount ?? activePaycheck.expected_amount)
      : activePaycheck.expected_amount
    : 0;
  const remaining = totalAvailable - budgetedThisPaycheck;

  const alreadyMatchedTransactionIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of paychecks) {
      if (p.id !== activePaycheck?.id && p.actual_transaction_id) {
        set.add(p.actual_transaction_id);
      }
    }
    return set;
  }, [paychecks, activePaycheck]);

  const handleAllocationChange = useCallback(
    (categoryId: string, amount: IntegerAmount) => {
      if (!activePaycheck || activePaycheck.status !== 'draft') return;
      void updateDraftAllocation(activePaycheck.id, categoryId, amount).catch(
        (err: unknown) => {
          dispatch(
            addNotification({
              notification: {
                type: 'error',
                message: t('There was an error saving this allocation.'),
                pre: err instanceof Error ? err.message : undefined,
              },
            }),
          );
        },
      );
    },
    [activePaycheck, dispatch, t],
  );

  const openAddModal = useCallback(() => {
    setAddModal({ date: new Date().toISOString().slice(0, 10), amount: 0 });
  }, []);

  const closeAddModal = useCallback(() => setAddModal(null), []);

  const saveAddModal = useCallback(async () => {
    if (!addModal || addModal.amount <= 0) return;
    try {
      const created = await createPlannedPaycheck(
        addModal.date,
        addModal.amount,
      );
      setActivePaycheckId(created.id);
      setAddModal(null);
    } catch (err) {
      dispatch(
        addNotification({
          notification: {
            type: 'error',
            message: t('There was an error creating this paycheck.'),
            pre: err instanceof Error ? err.message : undefined,
          },
        }),
      );
    }
  }, [addModal, dispatch, t]);

  const handleCancelPaycheck = useCallback(async () => {
    if (!activePaycheck || activePaycheck.status !== 'draft') return;
    const confirmed =
      typeof window.confirm === 'undefined' ||
      window.confirm(t('Cancel this planned paycheck? This cannot be undone.'));
    if (!confirmed) return;
    try {
      await cancelPlannedPaycheck(activePaycheck.id);
    } catch (err) {
      dispatch(
        addNotification({
          notification: {
            type: 'error',
            message: t('There was an error canceling this paycheck.'),
            pre: err instanceof Error ? err.message : undefined,
          },
        }),
      );
    }
  }, [activePaycheck, dispatch, t]);

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

  if (!paychecksLoading && paychecks.length === 0) {
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

  if (!activePaycheck) {
    return (
      <View
        style={{
          padding: 24,
          color: theme.pageTextLight,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Trans>Loading…</Trans>
      </View>
    );
  }

  const resolvedBudgetType =
    budgetType === 'tracking' ? 'tracking' : 'envelope';
  const matched = activePaycheck.actual_transaction_id != null;

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
          <button
            className="btn btn-secondary btn-sm"
            type="button"
            onClick={openAddModal}
          >
            <Trans>Add Paycheck</Trans>
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
              {formatDate(activePaycheck.expected_date)}
            </div>
          </div>

          <div className="income-divider" />

          <div className="income-strip-item">
            <div className="income-strip-label">
              {isCommitted ? (
                <Trans>Actual Deposit</Trans>
              ) : (
                <Trans>Expected Income</Trans>
              )}
            </div>
            <FinancialText as="div" className="income-strip-value highlight">
              {format(totalAvailable, 'financial')}
            </FinancialText>
          </div>

          <div className="income-divider" />

          <div className="income-strip-item">
            <div className="income-strip-label">
              <Trans>Budgeted</Trans>
            </div>
            <FinancialText as="div" className="income-strip-value">
              {format(budgetedThisPaycheck, 'financial')}
            </FinancialText>
          </div>

          <div className="income-strip-item">
            <div className="income-strip-label">
              <Trans>Left to Budget</Trans>
            </div>
            <FinancialText
              as="div"
              className={`income-strip-value highlight${remaining < 0 ? ' remaining-under' : ''}`}
            >
              {format(remaining, 'financial')}
            </FinancialText>
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
                  {formatDate(p.expected_date)}
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

          <span
            className={`paycheck-status-badge ${isCommitted ? 'committed' : 'draft'}`}
          >
            {isCommitted ? <Trans>Committed</Trans> : <Trans>Draft</Trans>}
          </span>

          <span className="paycheck-status-pill">
            <Trans>Status</Trans>:{' '}
            {budgetedThisPaycheck <= 0 ? (
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

          {!isCommitted && (
            <button
              className="btn btn-primary btn-sm"
              type="button"
              onClick={() => setCommitModalOpen(true)}
            >
              {matched ? (
                <Trans>Review &amp; Commit</Trans>
              ) : (
                <Trans>Match &amp; Commit</Trans>
              )}
            </button>
          )}

          {!isCommitted && (
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              style={{ color: 'var(--color-error)' }}
              onClick={() => void handleCancelPaycheck()}
            >
              <Trans>Cancel Paycheck</Trans>
            </button>
          )}
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
              const total =
                p.status === 'committed'
                  ? (p.actual_amount ?? p.expected_amount)
                  : p.expected_amount;
              const allocated = (allocationsByPaycheck[p.id] ?? []).reduce(
                (sum, a) => sum + effectiveAllocationAmount(p, a),
                0,
              );
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`paycheck-item${p.id === activePaycheck.id ? ' active' : ''}`}
                  onClick={() => setActivePaycheckId(p.id)}
                  style={{ textAlign: 'left' }}
                >
                  <div>
                    <div className="paycheck-date">
                      {formatDate(p.expected_date)}
                    </div>
                    <FinancialText as="div" className="paycheck-amount">
                      {format(total, 'financial')}
                    </FinancialText>
                  </div>
                  <span
                    className={`paycheck-status ${getStatusClass(total, allocated)}`}
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
                rows={section.categories.map(c => {
                  const allocation = activeAllocationsByEnvelope[c.id];
                  return {
                    id: c.id,
                    name: c.name,
                    groupName: c.groupName,
                    plannedAmount: allocation
                      ? effectiveAllocationAmount(activePaycheck, allocation)
                      : 0,
                    alreadyBudgetedAmount:
                      priorAllocationsByEnvelope[c.id] ?? 0,
                    currentBalance: balances[c.id] ?? 0,
                    balanceAtDraft:
                      allocation?.envelope_balance_at_draft ?? null,
                    isSnowball: isSnowballCategory(c.name),
                    readOnly: isCommitted,
                  };
                })}
                onChangeAmount={handleAllocationChange}
                onCategoryDrop={handleCategoryDrop}
                onCategoryReorder={handleCategoryReorder}
                onSectionReorder={handleSectionReorder}
                onToggleCollapse={handleToggleCollapse}
                onTitleSave={handleTitleSave}
              />
            ))}
          </div>
        </SheetNameProvider>
      </div>

      {/* Add paycheck modal */}
      {addModal && (
        <div className="modal-backdrop open">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">
                <Trans>Add Paycheck</Trans>
              </span>
              <button type="button" onClick={closeAddModal}>
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label className="form-label" htmlFor="paycheck-date">
                  <Trans>Expected date</Trans>
                </label>
                <input
                  id="paycheck-date"
                  className="form-input"
                  type="date"
                  value={addModal.date}
                  onChange={e =>
                    setAddModal(
                      prev => prev && { ...prev, date: e.target.value },
                    )
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="paycheck-amount">
                  <Trans>Expected amount</Trans>
                </label>
                <AmountInput
                  id="paycheck-amount"
                  value={addModal.amount}
                  sign="+"
                  onUpdate={amount =>
                    setAddModal(prev => prev && { ...prev, amount })
                  }
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn btn-secondary btn-sm"
                type="button"
                onClick={closeAddModal}
              >
                <Trans>Cancel</Trans>
              </button>
              <button
                className="btn btn-primary btn-sm"
                type="button"
                onClick={() => void saveAddModal()}
                disabled={addModal.amount <= 0}
              >
                <Trans>Save</Trans>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Match transaction + review + commit modal */}
      {commitModalOpen && activePaycheck && (
        <CommitPaycheckModal
          paycheck={activePaycheck}
          allocations={activeAllocations}
          envelopeNamesById={envelopeNamesById}
          alreadyMatchedTransactionIds={alreadyMatchedTransactionIds}
          onClose={() => setCommitModalOpen(false)}
        />
      )}
    </View>
  );
}
