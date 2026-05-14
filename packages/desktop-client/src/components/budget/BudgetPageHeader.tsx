// @ts-strict-ignore
import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import {
  SvgCheveronLeft,
  SvgCheveronRight,
} from '@actual-app/components/icons/v1';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';

import { useGlobalPref } from '#hooks/useGlobalPref';
import { useLocale } from '#hooks/useLocale';

import type { MonthBounds } from './MonthsContext';
import { getScrollbarWidth } from './util';

type BudgetPageHeaderProps = {
  startMonth: string;
  onMonthSelect: (month: string) => void;
  numMonths: number;
  monthBounds: MonthBounds;
};

export const BudgetPageHeader = memo<BudgetPageHeaderProps>(
  ({ startMonth, onMonthSelect, numMonths, monthBounds }) => {
    const { t } = useTranslation();
    const locale = useLocale();
    const [categoryExpandedStatePref] = useGlobalPref('categoryExpandedState');
    const categoryExpandedState = categoryExpandedStatePref ?? 0;
    const offsetMultipleMonths = numMonths === 1 ? 4 : 0;

    const prevMonth = monthUtils.prevMonth(startMonth);
    const nextMonth = monthUtils.nextMonth(startMonth);
    const isPrevDisabled = prevMonth < monthBounds.start;
    const isNextDisabled = nextMonth > monthBounds.end;

    const displayMonth = monthUtils.format(startMonth, 'MMMM yyyy', locale);

    return (
      <View
        style={{
          marginLeft:
            200 + 100 * categoryExpandedState + 5 - offsetMultipleMonths,
          flexShrink: 0,
        }}
      >
        <View
          style={{
            marginRight: 5 + getScrollbarWidth() - offsetMultipleMonths,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingTop: 14,
            paddingBottom: 10,
            gap: 16,
          }}
        >
          <Button
            variant="bare"
            aria-label={t('Previous month')}
            onPress={() => onMonthSelect(prevMonth)}
            isDisabled={isPrevDisabled}
            style={{
              padding: '4px 8px',
              color: isPrevDisabled
                ? theme.pageTextSubdued
                : theme.pageTextLight,
              borderRadius: 6,
            }}
          >
            <SvgCheveronLeft width={16} height={16} />
          </Button>

          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: theme.pageText,
              letterSpacing: '-0.02em',
              minWidth: 180,
              textAlign: 'center',
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
              color: isNextDisabled
                ? theme.pageTextSubdued
                : theme.pageTextLight,
              borderRadius: 6,
            }}
          >
            <SvgCheveronRight width={16} height={16} />
          </Button>
        </View>
      </View>
    );
  },
);

BudgetPageHeader.displayName = 'BudgetPageHeader';
