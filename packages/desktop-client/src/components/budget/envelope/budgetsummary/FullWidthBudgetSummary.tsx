import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import {
  SvgCheveronLeft,
  SvgCheveronRight,
  SvgDotsHorizontalTriple,
} from '@actual-app/components/icons/v1';
import { Popover } from '@actual-app/components/popover';
import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';

import { useEnvelopeBudget } from '#components/budget/envelope/EnvelopeBudgetContext';
import type { MonthBounds } from '#components/budget/MonthsContext';
import { NotesButton } from '#components/NotesButton';
import { useLocale } from '#hooks/useLocale';
import { useUndo } from '#hooks/useUndo';

import { BudgetMonthMenu } from './BudgetMonthMenu';
import { ToBudget } from './ToBudget';

type FullWidthBudgetSummaryProps = {
  month: string;
  startMonth: string;
  monthBounds: MonthBounds;
  onMonthSelect: (month: string) => void;
};

export function FullWidthBudgetSummary({
  month,
  startMonth,
  monthBounds,
  onMonthSelect,
}: FullWidthBudgetSummaryProps) {
  const locale = useLocale();
  const { onBudgetAction } = useEnvelopeBudget();
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef(null);
  const { showUndoNotification } = useUndo();
  const { t } = useTranslation();

  const prevMonth = monthUtils.prevMonth(startMonth);
  const nextMonth = monthUtils.nextMonth(startMonth);
  const isPrevDisabled = prevMonth < monthBounds.start;
  const isNextDisabled = nextMonth > monthBounds.end;

  const prevMonthName = monthUtils.format(
    monthUtils.prevMonth(month),
    'MMM',
    locale,
  );
  const displayMonth = monthUtils.format(startMonth, 'MMMM yyyy', locale);
  const displayMonthShort = monthUtils.format(month, "MMMM ''yy", locale);

  return (
    <View
      style={{
        ...styles.glassCard,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 22px',
        flexShrink: 0,
        position: 'relative',
        '& .hover-visible': { opacity: 0, transition: 'opacity .2s' },
        '&:hover .hover-visible': { opacity: 1 },
      }}
    >
      {/* Month navigation — left side */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Button
          variant="bare"
          aria-label={t('Previous month')}
          onPress={() => onMonthSelect(prevMonth)}
          isDisabled={isPrevDisabled}
          style={{
            padding: '4px 8px',
            color: isPrevDisabled ? 'rgba(0,0,0,0.20)' : 'rgba(0,0,0,0.45)',
            borderRadius: 6,
          }}
        >
          <SvgCheveronLeft width={16} height={16} />
        </Button>

        <div
          style={{
            fontSize: 30,
            fontWeight: 800,
            color: '#1c1c1e',
            letterSpacing: '-0.04em',
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          {displayMonth}
        </div>

        <Button
          variant="bare"
          aria-label={t('Next month')}
          onPress={() => onMonthSelect(nextMonth)}
          isDisabled={isNextDisabled}
          style={{
            padding: '4px 8px',
            color: isNextDisabled ? 'rgba(0,0,0,0.20)' : 'rgba(0,0,0,0.45)',
            borderRadius: 6,
          }}
        >
          <SvgCheveronRight width={16} height={16} />
        </Button>
      </View>

      {/* TBB — right side */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 16,
        }}
      >
        {/* Action buttons */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 2,
          }}
          className="hover-visible"
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
            onPress={() => setMenuOpen(true)}
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
            onOpenChange={() => setMenuOpen(false)}
          >
            <BudgetMonthMenu
              onCopyLastMonthBudget={() => {
                onBudgetAction(month, 'copy-last');
                setMenuOpen(false);
                showUndoNotification({
                  message: t(
                    "{{displayMonthShort}} budgets have all been set to last month's budgeted amounts.",
                    { displayMonthShort },
                  ),
                });
              }}
              onSetBudgetsToZero={() => {
                onBudgetAction(month, 'set-zero');
                setMenuOpen(false);
                showUndoNotification({
                  message: t(
                    '{{displayMonthShort}} budgets have all been set to zero.',
                    { displayMonthShort },
                  ),
                });
              }}
              onSetMonthsAverage={numberOfMonths => {
                onBudgetAction(month, `set-${numberOfMonths}-avg`);
                setMenuOpen(false);
                showUndoNotification({
                  message:
                    numberOfMonths === 12
                      ? t(
                          `${displayMonthShort} budgets have all been set to yearly average.`,
                        )
                      : t(
                          `${displayMonthShort} budgets have all been set to ${numberOfMonths} month average.`,
                        ),
                });
              }}
              onCheckTemplates={() => {
                onBudgetAction(month, 'check-templates');
                setMenuOpen(false);
              }}
              onApplyBudgetTemplates={() => {
                onBudgetAction(month, 'apply-goal-template');
                setMenuOpen(false);
                showUndoNotification({
                  message: t(
                    '{{displayMonthShort}} budget templates have been applied.',
                    { displayMonthShort },
                  ),
                });
              }}
              onOverwriteWithBudgetTemplates={() => {
                onBudgetAction(month, 'overwrite-goal-template');
                setMenuOpen(false);
                showUndoNotification({
                  message: t(
                    '{{displayMonthShort}} budget templates have been overwritten.',
                    { displayMonthShort },
                  ),
                });
              }}
              onEndOfMonthCleanup={() => {
                onBudgetAction(month, 'cleanup-goal-template');
                setMenuOpen(false);
                showUndoNotification({
                  message: t(
                    '{{displayMonthShort}} end-of-month cleanup templates have been applied.',
                    { displayMonthShort },
                  ),
                });
              }}
            />
          </Popover>
        </View>

        {/* TBB amount — right-aligned */}
        <View style={{ alignItems: 'flex-end' }}>
          <ToBudget
            prevMonthName={prevMonthName}
            month={month}
            onBudgetAction={onBudgetAction}
            style={{ alignItems: 'flex-end', gap: 2 }}
            amountStyle={{
              fontSize: 27,
              fontWeight: 800,
              letterSpacing: '-0.04em',
            }}
            hideProgress
          />
        </View>
      </View>
    </View>
  );
}
