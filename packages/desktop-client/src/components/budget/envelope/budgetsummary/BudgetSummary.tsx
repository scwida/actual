import React, { memo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { SvgDotsHorizontalTriple } from '@actual-app/components/icons/v1';
import { Popover } from '@actual-app/components/popover';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';

import { useEnvelopeBudget } from '#components/budget/envelope/EnvelopeBudgetContext';
import { NotesButton } from '#components/NotesButton';
import { useLocale } from '#hooks/useLocale';
import { SheetNameProvider } from '#hooks/useSheetName';
import { useUndo } from '#hooks/useUndo';

import { BudgetMonthMenu } from './BudgetMonthMenu';
import { ToBudget } from './ToBudget';

type BudgetSummaryProps = {
  month: string;
};
export const BudgetSummary = memo(({ month }: BudgetSummaryProps) => {
  const locale = useLocale();
  const { onBudgetAction } = useEnvelopeBudget();

  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef(null);
  const { showUndoNotification } = useUndo();

  function onMenuOpen() {
    setMenuOpen(true);
  }

  function onMenuClose() {
    setMenuOpen(false);
  }

  const prevMonthName = monthUtils.format(
    monthUtils.prevMonth(month),
    'MMM',
    locale,
  );

  const displayMonth = monthUtils.format(month, "MMMM ''yy", locale);
  const { t } = useTranslation();

  return (
    <View
      data-testid="budget-summary"
      style={{
        borderRadius: '0 0 8px 8px',
        flex: 1,
        cursor: 'default',
        overflow: 'hidden',
        '& .hover-visible': {
          opacity: 0,
          transition: 'opacity .25s',
        },
        '&:hover .hover-visible': {
          opacity: 1,
        },
      }}
    >
      <SheetNameProvider name={monthUtils.sheetForMonth(month)}>
        {/* Action buttons row */}
        <View
          style={{
            padding: '8px 12px 0',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 2,
          }}
        >
          <NotesButton
            id={`budget-${month}`}
            width={14}
            height={14}
            tooltipPosition="bottom right"
            defaultColor={theme.pageTextLight}
          />
          <Button
            ref={triggerRef}
            variant="bare"
            aria-label={t('Menu')}
            onPress={onMenuOpen}
            className="hover-visible"
          >
            <SvgDotsHorizontalTriple
              width={14}
              height={14}
              style={{ color: theme.pageTextLight }}
            />
          </Button>

          <Popover
            triggerRef={triggerRef}
            isOpen={menuOpen}
            onOpenChange={onMenuClose}
          >
            <BudgetMonthMenu
              onCopyLastMonthBudget={() => {
                onBudgetAction(month, 'copy-last');
                onMenuClose();
                showUndoNotification({
                  message: t(
                    "{{displayMonth}} budgets have all been set to last month's budgeted amounts.",
                    { displayMonth },
                  ),
                });
              }}
              onSetBudgetsToZero={() => {
                onBudgetAction(month, 'set-zero');
                onMenuClose();
                showUndoNotification({
                  message: t(
                    '{{displayMonth}} budgets have all been set to zero.',
                    { displayMonth },
                  ),
                });
              }}
              onSetMonthsAverage={numberOfMonths => {
                onBudgetAction(month, `set-${numberOfMonths}-avg`);
                onMenuClose();
                showUndoNotification({
                  message:
                    numberOfMonths === 12
                      ? t(
                          `${displayMonth} budgets have all been set to yearly average.`,
                        )
                      : t(
                          `${displayMonth} budgets have all been set to ${numberOfMonths} month average.`,
                        ),
                });
              }}
              onCheckTemplates={() => {
                onBudgetAction(month, 'check-templates');
                onMenuClose();
              }}
              onApplyBudgetTemplates={() => {
                onBudgetAction(month, 'apply-goal-template');
                onMenuClose();
                showUndoNotification({
                  message: t(
                    '{{displayMonth}} budget templates have been applied.',
                    { displayMonth },
                  ),
                });
              }}
              onOverwriteWithBudgetTemplates={() => {
                onBudgetAction(month, 'overwrite-goal-template');
                onMenuClose();
                showUndoNotification({
                  message: t(
                    '{{displayMonth}} budget templates have been overwritten.',
                    { displayMonth },
                  ),
                });
              }}
              onEndOfMonthCleanup={() => {
                onBudgetAction(month, 'cleanup-goal-template');
                onMenuClose();
                showUndoNotification({
                  message: t(
                    '{{displayMonth}} end-of-month cleanup templates have been applied.',
                    { displayMonth },
                  ),
                });
              }}
            />
          </Popover>
        </View>

        {/* Money Available amount + progress bar */}
        <View style={{ padding: '4px 20px 20px' }}>
          <ToBudget
            prevMonthName={prevMonthName}
            month={month}
            onBudgetAction={onBudgetAction}
          />
        </View>
      </SheetNameProvider>
    </View>
  );
});

BudgetSummary.displayName = 'EnvelopeBudgetSummary';
