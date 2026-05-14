import React, { memo, useRef } from 'react';
import type { ComponentProps, CSSProperties } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { SvgCheveronDown } from '@actual-app/components/icons/v1';
import {
  SvgArrowsSynchronize,
  SvgCalendar3,
} from '@actual-app/components/icons/v2';
import { Popover } from '@actual-app/components/popover';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { css } from '@emotion/css';

import { BalanceWithCarryover } from '#components/budget/BalanceWithCarryover';
import { makeAmountGrey } from '#components/budget/util';
import { NotesButton } from '#components/NotesButton';
import { CellValue, CellValueText } from '#components/spreadsheet/CellValue';
import { Field, Row, SheetCell } from '#components/table';
import type { SheetCellProps } from '#components/table';
import { useCategoryScheduleGoalTemplateIndicator } from '#hooks/useCategoryScheduleGoalTemplateIndicator';
import { useContextMenu } from '#hooks/useContextMenu';
import { useFormat } from '#hooks/useFormat';
import { useNavigate } from '#hooks/useNavigate';
import { useSheetName } from '#hooks/useSheetName';
import { useSheetValue } from '#hooks/useSheetValue';
import { useUndo } from '#hooks/useUndo';
import { useGoalsContext } from '#paycheck-planner/GoalsContext';
import type { Binding, SheetFields } from '#spreadsheet';
import { envelopeBudget } from '#spreadsheet/bindings';
import type { CategoryGroupMonthProps, CategoryMonthProps } from '..';

import { BalanceMovementMenu } from './BalanceMovementMenu';
import { BudgetMenu } from './BudgetMenu';
import { IncomeMenu } from './IncomeMenu';

function useGoalBarData(categoryId: string) {
  const { t } = useTranslation();
  const { goals } = useGoalsContext();
  const goal = goals[categoryId];
  const budgetedCents =
    (useSheetValue<'envelope-budget', 'budget'>(
      envelopeBudget.catBudgeted(categoryId),
    ) as number) ?? 0;
  const balanceCents =
    (useSheetValue<'envelope-budget', 'leftover'>(
      envelopeBudget.catBalance(categoryId),
    ) as number) ?? 0;
  const spentCents =
    (useSheetValue<'envelope-budget', 'sum-amount'>(
      envelopeBudget.catSumAmount(categoryId),
    ) as number) ?? 0;

  if (!goal) {
    const isFullySpent = balanceCents === 0 && spentCents < 0;
    return {
      hasGoal: false,
      isFullySpent,
      statusText: isFullySpent ? t('Fully Spent') : null,
      statusColor: '#98a2b3',
      pct: 0,
      barColor: '#d0d5dd',
    };
  }

  const budgetedDollars = budgetedCents / 100;
  const pct = goal.amount > 0 ? Math.min(budgetedDollars / goal.amount, 1) : 0;
  const remaining = goal.amount - budgetedDollars;
  const barColor = pct >= 1 ? '#027a48' : pct > 0 ? '#b54708' : '#d0d5dd';

  let statusText: string;
  let statusColor: string;
  if (pct >= 1) {
    statusText = t('Funded');
    statusColor = '#027a48';
  } else if (budgetedDollars > 0) {
    statusText = `$${remaining.toFixed(2)} ${t('more needed')}`;
    statusColor = '#b54708';
  } else {
    statusText = `${t('Goal')}: $${goal.amount.toFixed(2)}`;
    statusColor = '#98a2b3';
  }

  return {
    hasGoal: true,
    isFullySpent: false,
    statusText,
    statusColor,
    pct,
    barColor,
  };
}

/** Status text label shown to the LEFT of the balance pill */
export function EnvelopeGoalStatus({ categoryId }: { categoryId: string }) {
  const { statusText, statusColor } = useGoalBarData(categoryId);
  if (!statusText) return null;
  return (
    <span
      style={{
        fontSize: 10,
        color: statusColor,
        whiteSpace: 'nowrap',
        lineHeight: 1,
        opacity: 0.85,
      }}
    >
      {statusText}
    </span>
  );
}

/** Thin progress bar shown below the pill */
export function EnvelopeGoalProgressBar({
  categoryId,
}: {
  categoryId: string;
}) {
  const { hasGoal, pct, barColor } = useGoalBarData(categoryId);
  if (!hasGoal || pct === 0) return null;
  return (
    <div
      style={{
        height: 3,
        backgroundColor: '#e4e7ec',
        borderRadius: 2,
        overflow: 'hidden',
        marginTop: 3,
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${pct * 100}%`,
          backgroundColor: barColor,
          borderRadius: 2,
          transition: 'width 0.3s ease',
        }}
      />
    </div>
  );
}

/** @deprecated Use EnvelopeGoalStatus + EnvelopeGoalProgressBar separately */
export function EnvelopeGoalBar({ categoryId }: { categoryId: string }) {
  return (
    <>
      <EnvelopeGoalStatus categoryId={categoryId} />
      <EnvelopeGoalProgressBar categoryId={categoryId} />
    </>
  );
}

export function useEnvelopeSheetName<
  FieldName extends SheetFields<'envelope-budget'>,
>(binding: Binding<'envelope-budget', FieldName>) {
  return useSheetName(binding);
}

export function useEnvelopeSheetValue<
  FieldName extends SheetFields<'envelope-budget'>,
>(binding: Binding<'envelope-budget', FieldName>) {
  return useSheetValue(binding);
}

export const EnvelopeCellValue = <
  FieldName extends SheetFields<'envelope-budget'>,
>(
  props: ComponentProps<typeof CellValue<'envelope-budget', FieldName>>,
) => {
  return <CellValue {...props} />;
};

const EnvelopeSheetCell = <FieldName extends SheetFields<'envelope-budget'>>(
  props: SheetCellProps<'envelope-budget', FieldName>,
) => {
  return <SheetCell {...props} />;
};

const _COL_GOAL = 140;
const _COL_NUM = 110;

const headerLabelStyle: CSSProperties = {
  flex: 1,
  flexBasis: 0,
  padding: '0 5px',
  textAlign: 'right',
};

const cellStyle: CSSProperties = {
  color: theme.tableHeaderText,
  fontWeight: 600,
};

export const BudgetTotalsMonth = memo(function BudgetTotalsMonth() {
  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        paddingTop: 10,
        paddingBottom: 10,
      }}
    >
      <View style={headerLabelStyle}>
        <Text
          style={{
            color: theme.tableHeaderText,
            fontSize: 11.5,
            fontWeight: 600,
          }}
        >
          <Trans>Assigned</Trans>
        </Text>
        <EnvelopeCellValue
          binding={envelopeBudget.totalBudgeted}
          type="financial"
        >
          {props => (
            <CellValueText {...props} value={-props.value} style={cellStyle} />
          )}
        </EnvelopeCellValue>
      </View>
      <View style={headerLabelStyle}>
        <Text
          style={{
            color: theme.tableHeaderText,
            fontSize: 11.5,
            fontWeight: 600,
          }}
        >
          <Trans>Activity</Trans>
        </Text>
        <EnvelopeCellValue binding={envelopeBudget.totalSpent} type="financial">
          {props => <CellValueText {...props} style={cellStyle} />}
        </EnvelopeCellValue>
      </View>
      <View
        style={{ ...headerLabelStyle, paddingRight: styles.monthRightPadding }}
      >
        <Text
          style={{
            color: theme.tableHeaderText,
            fontSize: 11.5,
            fontWeight: 600,
          }}
        >
          <Trans>Available</Trans>
        </Text>
        <EnvelopeCellValue
          binding={envelopeBudget.totalBalance}
          type="financial"
        >
          {props => <CellValueText {...props} style={cellStyle} />}
        </EnvelopeCellValue>
      </View>
    </View>
  );
});

export function IncomeHeaderMonth() {
  return (
    <Row
      style={{
        color: theme.tableHeaderText,
        alignItems: 'center',
        paddingRight: 10,
      }}
    >
      <View style={{ flex: 1, textAlign: 'right' }}>
        <Trans>Received</Trans>
      </View>
    </Row>
  );
}

export const ExpenseGroupMonth = memo(function ExpenseGroupMonth({
  month: _month,
  group,
}: CategoryGroupMonthProps) {
  const { id } = group;

  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
      }}
    >
      <EnvelopeSheetCell
        name="budgeted"
        width="flex"
        textAlign="right"
        style={{
          fontWeight: 600,
          ...styles.tnum,
          borderTopWidth: 0,
          borderBottomWidth: 0,
        }}
        valueProps={{
          binding: envelopeBudget.groupBudgeted(id),
          type: 'financial',
        }}
      />
      <EnvelopeSheetCell
        name="spent"
        width="flex"
        textAlign="right"
        style={{
          fontWeight: 600,
          ...styles.tnum,
          borderTopWidth: 0,
          borderBottomWidth: 0,
        }}
        valueProps={{
          binding: envelopeBudget.groupSumAmount(id),
          type: 'financial',
        }}
      />
      <EnvelopeSheetCell
        name="balance"
        width="flex"
        textAlign="right"
        style={{
          fontWeight: 600,
          paddingRight: styles.monthRightPadding,
          ...styles.tnum,
          borderTopWidth: 0,
          borderBottomWidth: 0,
        }}
        valueProps={{
          binding: envelopeBudget.groupBalance(id),
          type: 'financial',
        }}
      />
    </View>
  );
});

export const ExpenseCategoryMonth = memo(function ExpenseCategoryMonth({
  month,
  category,
  editing,
  onEdit,
  onBudgetAction,
  onShowActivity,
}: CategoryMonthProps) {
  const { t } = useTranslation();
  const format = useFormat();

  const budgetMenuTriggerRef = useRef(null);
  const balanceMenuTriggerRef = useRef(null);
  const {
    setMenuOpen: setBudgetMenuOpen,
    menuOpen: budgetMenuOpen,
    handleContextMenu: handleBudgetContextMenu,
    resetPosition: resetBudgetPosition,
    position: budgetPosition,
  } = useContextMenu();
  const {
    setMenuOpen: setBalanceMenuOpen,
    menuOpen: balanceMenuOpen,
    handleContextMenu: handleBalanceContextMenu,
    resetPosition: resetBalancePosition,
    position: balancePosition,
  } = useContextMenu();

  const onMenuAction = (...args: Parameters<typeof onBudgetAction>) => {
    onBudgetAction(...args);
    setBudgetMenuOpen(false);
  };

  const { showUndoNotification } = useUndo();

  const navigate = useNavigate();

  const rawBalance =
    (useEnvelopeSheetValue(envelopeBudget.catBalance(category.id)) as number) ??
    0;
  const { hasGoal, pct } = useGoalBarData(category.id);
  const isPartiallyFunded = hasGoal && pct > 0 && pct < 1;

  const balancePillBg =
    rawBalance < 0
      ? 'rgba(180,35,24,0.14)'
      : rawBalance === 0
        ? 'rgba(120,120,130,0.12)'
        : isPartiallyFunded
          ? 'rgba(255,204,0,0.22)'
          : 'rgba(52,199,89,0.18)';

  const balancePillColor =
    rawBalance < 0
      ? '#b42318'
      : rawBalance === 0
        ? '#5a5a65'
        : isPartiallyFunded
          ? '#7a5800'
          : '#1a7a35';

  const { schedule, scheduleStatus, isScheduleRecurring, description } =
    useCategoryScheduleGoalTemplateIndicator({
      category,
      month,
    });

  const showScheduleIndicator = schedule && scheduleStatus;

  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        '& .hover-visible': {
          opacity: 0,
          transition: 'opacity .25s',
        },
        '&:hover .hover-visible, & .force-visible .hover-visible': {
          opacity: 1,
        },
        '& .hover-expand': {
          maxWidth: 0,
          overflow: 'hidden',
          transition: 'max-width 0s .25s',
        },
        '&:hover .hover-expand, & .hover-expand.force-visible': {
          maxWidth: '300px',
          overflow: 'visible',
          transition: 'max-width 0s linear 0s',
        },
      }}
    >
      <View
        ref={budgetMenuTriggerRef}
        style={{
          flex: 1,
          flexDirection: 'row',
        }}
        onContextMenu={e => {
          if (editing) return;
          handleBudgetContextMenu(e);
        }}
      >
        {!editing && (
          <>
            <View
              style={{
                paddingLeft: 3,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <NotesButton
                id={`${category.id}-${month}`}
                defaultColor={theme.pageTextLight}
              />
            </View>
            <View
              className={`hover-expand ${budgetMenuOpen ? 'force-visible' : ''}`}
              style={{
                flexDirection: 'row',
                flexShrink: 1,
                paddingLeft: 3,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Button
                variant="bare"
                onPress={() => {
                  resetBudgetPosition(2, -4);
                  setBudgetMenuOpen(true);
                }}
                style={{
                  padding: 3,
                }}
              >
                <SvgCheveronDown
                  width={14}
                  height={14}
                  className="hover-visible"
                />
              </Button>
              <Popover
                triggerRef={budgetMenuTriggerRef}
                placement="bottom left"
                isOpen={budgetMenuOpen}
                onOpenChange={() => setBudgetMenuOpen(false)}
                style={{ width: 200 }}
                isNonModal
                {...budgetPosition}
              >
                <BudgetMenu
                  onCopyLastMonthAverage={() => {
                    onMenuAction(month, 'copy-single-last', {
                      category: category.id,
                    });
                    showUndoNotification({
                      message: t(`Budget set to last month's budget.`),
                    });
                  }}
                  onSetMonthsAverage={numberOfMonths => {
                    if (
                      numberOfMonths !== 3 &&
                      numberOfMonths !== 6 &&
                      numberOfMonths !== 12
                    ) {
                      return;
                    }

                    onMenuAction(month, `set-single-${numberOfMonths}-avg`, {
                      category: category.id,
                    });
                    showUndoNotification({
                      message: t(
                        'Budget set to {{numberOfMonths}}-month average.',
                        { numberOfMonths },
                      ),
                    });
                  }}
                  onApplyBudgetTemplate={() => {
                    onMenuAction(month, 'apply-single-category-template', {
                      category: category.id,
                    });
                    showUndoNotification({
                      message: t(`Budget template applied.`),
                    });
                  }}
                />
              </Popover>
            </View>
          </>
        )}
        <EnvelopeSheetCell
          name="budget"
          exposed={editing}
          focused={editing}
          width="flex"
          onExpose={() => onEdit(category.id, month)}
          style={{
            ...(editing && { zIndex: 100 }),
            ...styles.tnum,
            borderTopWidth: 0,
            borderBottomWidth: 0,
          }}
          textAlign="right"
          valueStyle={{
            cursor: 'default',
            margin: 1,
            padding: '0 4px',
            borderRadius: 4,
            ':hover': {
              boxShadow: 'inset 0 0 0 1px ' + theme.pageTextSubdued, //remove mobile color variable
              backgroundColor: theme.budgetCurrentMonth,
            },
          }}
          valueProps={{
            binding: envelopeBudget.catBudgeted(category.id),
            type: 'financial',
            getValueStyle: makeAmountGrey,
            formatExpr: format.forEdit,
            unformatExpr: format.fromEdit,
          }}
          inputProps={{
            onBlur: () => {
              onEdit(null);
            },
            style: {
              backgroundColor: theme.budgetCurrentMonth,
            },
          }}
          onSave={(parsedIntegerAmount: number | null) => {
            onBudgetAction(month, 'budget-amount', {
              category: category.id,
              amount: parsedIntegerAmount ?? 0,
            });
          }}
        />
      </View>
      <Field
        name="spent"
        width="flex"
        style={{ textAlign: 'right', borderTopWidth: 0, borderBottomWidth: 0 }}
      >
        <View
          data-testid="category-month-spent"
          onClick={() => onShowActivity(category.id, month)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: showScheduleIndicator
              ? 'space-between'
              : 'flex-end',
            gap: 2,
          }}
        >
          {showScheduleIndicator && (
            <View title={description}>
              <Button
                variant="bare"
                style={{
                  color:
                    scheduleStatus === 'missed'
                      ? theme.budgetNumberNegative
                      : scheduleStatus === 'due'
                        ? theme.templateNumberUnderFunded
                        : theme.upcomingText,
                }}
                onPress={() =>
                  schedule._account
                    ? navigate(`/accounts/${schedule._account}`)
                    : navigate('/accounts')
                }
              >
                {isScheduleRecurring ? (
                  <SvgArrowsSynchronize style={{ width: 12, height: 12 }} />
                ) : (
                  <SvgCalendar3 style={{ width: 12, height: 12 }} />
                )}
              </Button>
            </View>
          )}
          <EnvelopeCellValue
            binding={envelopeBudget.catSumAmount(category.id)}
            type="financial"
          >
            {props => (
              <CellValueText
                {...props}
                className={css({
                  cursor: 'pointer',
                  ':hover': { textDecoration: 'underline' },
                  ...makeAmountGrey(props.value),
                })}
              />
            )}
          </EnvelopeCellValue>
        </View>
      </Field>
      <Field
        ref={balanceMenuTriggerRef}
        name="balance"
        width="flex"
        truncate={false}
        style={{
          paddingRight: styles.monthRightPadding,
          borderTopWidth: 0,
          borderBottomWidth: 0,
        }}
      >
        <View
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          {/* Status label + pill in a row */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <EnvelopeGoalStatus categoryId={category.id} />
            <Button
              variant="bare"
              onPress={() => {
                resetBalancePosition(-6, -4);
                setBalanceMenuOpen(true);
              }}
              onContextMenu={e => {
                handleBalanceContextMenu(e);
                const rect = e.currentTarget.getBoundingClientRect();
                resetBalancePosition(
                  e.clientX - rect.right + 200 - 8,
                  e.clientY - rect.bottom - 8,
                );
              }}
              style={{
                background: balancePillBg,
                borderRadius: 100,
                padding: '4px 12px',
                color: balancePillColor,
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              <BalanceWithCarryover
                carryover={envelopeBudget.catCarryover(category.id)}
                balance={envelopeBudget.catBalance(category.id)}
                goal={envelopeBudget.catGoal(category.id)}
                budgeted={envelopeBudget.catBudgeted(category.id)}
                longGoal={envelopeBudget.catLongGoal(category.id)}
                tooltipDisabled={balanceMenuOpen}
              />
            </Button>
          </View>
          {/* Goal progress bar below */}
          <View style={{ width: '100%' }}>
            <EnvelopeGoalProgressBar categoryId={category.id} />
          </View>
        </View>

        <Popover
          triggerRef={balanceMenuTriggerRef}
          placement="bottom end"
          isOpen={balanceMenuOpen}
          onOpenChange={() => setBalanceMenuOpen(false)}
          style={{
            margin: 1,
            minWidth: 190,
          }}
          isNonModal
          {...balancePosition}
        >
          <BalanceMovementMenu
            categoryId={category.id}
            month={month}
            onBudgetAction={onBudgetAction}
            onClose={() => setBalanceMenuOpen(false)}
          />
        </Popover>
      </Field>
    </View>
  );
});

type IncomeGroupMonthProps = {
  month: string;
};
export function IncomeGroupMonth({ month: _month }: IncomeGroupMonthProps) {
  return (
    <View style={{ flex: 1 }}>
      <EnvelopeSheetCell
        name="received"
        width="flex"
        textAlign="right"
        style={{
          fontWeight: 600,
          paddingRight: styles.monthRightPadding,
          ...styles.tnum,
        }}
        valueProps={{
          binding: envelopeBudget.groupIncomeReceived,
          type: 'financial',
        }}
      />
    </View>
  );
}

export function IncomeCategoryMonth({
  category,
  isLast,
  month,
  onShowActivity,
  onBudgetAction,
}: CategoryMonthProps) {
  const incomeMenuTriggerRef = useRef(null);
  const {
    setMenuOpen: setIncomeMenuOpen,
    menuOpen: incomeMenuOpen,
    handleContextMenu: handleIncomeContextMenu,
    resetPosition: resetIncomePosition,
    position: incomePosition,
  } = useContextMenu();

  return (
    <View style={{ flex: 1 }}>
      <Field
        name="received"
        width="flex"
        truncate={false}
        ref={incomeMenuTriggerRef}
        style={{
          textAlign: 'right',
          ...(isLast && { borderBottomWidth: 0 }),
        }}
      >
        <View
          name="received"
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            position: 'relative',
          }}
        >
          <Button
            variant="bare"
            onPress={() => {
              resetIncomePosition(-6, -4);
              setIncomeMenuOpen(true);
            }}
            onContextMenu={e => {
              handleIncomeContextMenu(e);
              // We need to calculate differently from the hook due to being aligned to the right
              const rect = e.currentTarget.getBoundingClientRect();
              resetIncomePosition(
                e.clientX - rect.right + 200 - 8,
                e.clientY - rect.bottom - 8,
              );
            }}
            style={{
              background: 'transparent',
              padding: 0,
              paddingRight: styles.monthRightPadding,
            }}
          >
            <BalanceWithCarryover
              carryover={envelopeBudget.catCarryover(category.id)}
              balance={envelopeBudget.catSumAmount(category.id)}
              goal={envelopeBudget.catGoal(category.id)}
              budgeted={envelopeBudget.catBudgeted(category.id)}
              longGoal={envelopeBudget.catLongGoal(category.id)}
            />
          </Button>
          <Popover
            triggerRef={incomeMenuTriggerRef}
            placement="bottom end"
            isOpen={incomeMenuOpen}
            onOpenChange={() => setIncomeMenuOpen(false)}
            style={{ margin: 1 }}
            isNonModal
            {...incomePosition}
          >
            <IncomeMenu
              categoryId={category.id}
              month={month}
              onBudgetAction={onBudgetAction}
              onShowActivity={onShowActivity}
              onClose={() => setIncomeMenuOpen(false)}
            />
          </Popover>
        </View>
      </Field>
    </View>
  );
}

export { BudgetSummary } from './budgetsummary/BudgetSummary';
