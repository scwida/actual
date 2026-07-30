import React, { memo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { SvgDotsHorizontalTriple } from '@actual-app/components/icons/v1';
import {
  SvgArrowButtonLeft1,
  SvgArrowButtonRight1,
  SvgArrowButtonSingleLeft1,
} from '@actual-app/components/icons/v2';
import { Menu } from '@actual-app/components/menu';
import { Popover } from '@actual-app/components/popover';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { seedDemoCategories } from '#budget/seedDemoCategories';
import { useGlobalPref } from '#hooks/useGlobalPref';

import { RenderMonths } from './RenderMonths';
import { getScrollbarWidth } from './util';

import { useBudgetComponents } from '.';

type BudgetTotalsProps = {
  toggleHiddenCategories: () => void;
  expandAllCategories: () => void;
  collapseAllCategories: () => void;
};

export const BudgetTotals = memo(function BudgetTotals({
  toggleHiddenCategories,
  expandAllCategories,
  collapseAllCategories,
}: BudgetTotalsProps) {
  const { t } = useTranslation();
  const [categoryExpandedStatePref, setCategoryExpandedStatePref] =
    useGlobalPref('categoryExpandedState');
  const categoryExpandedState = categoryExpandedStatePref ?? 0;
  const [goalChipVisibilityPref, setGoalChipVisibilityPref] = useGlobalPref(
    'budgetGoalChipVisibility',
  );
  const goalChipVisibility = goalChipVisibilityPref ?? 'expenses';
  const [menuOpen, setMenuOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const triggerRef = useRef(null);

  const cycleExpandedState = () => {
    const nextState = (categoryExpandedState + 1) % 3;
    setCategoryExpandedStatePref(nextState);
  };

  const getExpandStateLabel = () => {
    switch (categoryExpandedState) {
      case 0:
        return t('Expand');
      case 1:
        return t('Fully Expand');
      case 2:
        return t('Collapse');
      default:
        return t('Expand');
    }
  };

  const { BudgetTotalsComponent: MonthComponent } = useBudgetComponents();
  const renderMonthsStyle = {};

  return (
    <View
      data-testid="budget-totals"
      style={{
        flexDirection: 'row',
        flexShrink: 0,
        marginLeft: 14,
        marginRight: 14 + getScrollbarWidth(),
        paddingTop: 8,
        paddingBottom: 6,
        '& .hover-visible': {
          opacity: 0,
          transition: 'opacity .25s',
        },
        '&:hover .hover-visible': {
          opacity: 1,
        },
      }}
    >
      <View
        style={{
          flex: 1,
          minWidth: 0,
          color: theme.tableHeaderText,
          justifyContent: 'center',
          paddingLeft: 5,
          paddingRight: 5,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        <Button
          variant="bare"
          aria-label={getExpandStateLabel()}
          onPress={cycleExpandedState}
          className="hover-visible"
          style={{
            color: 'currentColor',
            padding: 3,
            marginRight: 10,
          }}
        >
          {categoryExpandedState === 0 ? (
            <SvgArrowButtonSingleLeft1
              style={{
                width: 12,
                height: 12,
              }}
            />
          ) : categoryExpandedState === 1 ? (
            <SvgArrowButtonLeft1
              style={{
                width: 12,
                height: 12,
              }}
            />
          ) : (
            <SvgArrowButtonRight1
              style={{
                width: 12,
                height: 12,
              }}
            />
          )}
        </Button>
        <View
          style={{
            flexGrow: '1',
            fontSize: 11.5,
            fontWeight: 600,
          }}
        >
          <Trans>Category</Trans>
        </View>
        <Button
          ref={triggerRef}
          variant="bare"
          aria-label={t('Menu')}
          onPress={() => setMenuOpen(true)}
          style={{ color: 'currentColor', padding: 3 }}
        >
          <SvgDotsHorizontalTriple
            width={15}
            height={15}
            style={{ color: theme.tableHeaderText }}
          />
        </Button>

        <Popover
          triggerRef={triggerRef}
          isOpen={menuOpen}
          onOpenChange={() => setMenuOpen(false)}
          style={{ width: 200 }}
        >
          <Menu
            onMenuSelect={type => {
              if (type === 'toggle-visibility') {
                toggleHiddenCategories();
              } else if (type === 'expandAllCategories') {
                expandAllCategories();
              } else if (type === 'collapseAllCategories') {
                collapseAllCategories();
              } else if (type === 'seed-demo-categories') {
                setSeeding(true);
                void seedDemoCategories().finally(() => setSeeding(false));
              } else if (type === 'goal-chips-all') {
                setGoalChipVisibilityPref('all');
              } else if (type === 'goal-chips-expenses') {
                setGoalChipVisibilityPref('expenses');
              } else if (type === 'goal-chips-hidden') {
                setGoalChipVisibilityPref('hidden');
              }
              setMenuOpen(false);
            }}
            items={[
              {
                name: 'toggle-visibility',
                text: t('Toggle hidden categories'),
              },
              {
                name: 'expandAllCategories',
                text: t('Expand all'),
              },
              {
                name: 'collapseAllCategories',
                text: t('Collapse all'),
              },
              Menu.line,
              {
                name: 'goal-chips-all',
                text:
                  goalChipVisibility === 'all'
                    ? t('✓ Goal chips: All categories')
                    : t('Goal chips: All categories'),
              },
              {
                name: 'goal-chips-expenses',
                text:
                  goalChipVisibility === 'expenses'
                    ? t('✓ Goal chips: Expenses only')
                    : t('Goal chips: Expenses only'),
              },
              {
                name: 'goal-chips-hidden',
                text:
                  goalChipVisibility === 'hidden'
                    ? t('✓ Goal chips: Hidden')
                    : t('Goal chips: Hidden'),
              },
              Menu.line,
              {
                name: 'seed-demo-categories',
                text: seeding ? t('Loading…') : t('Load demo categories'),
              },
            ]}
          />
        </Popover>
      </View>
      <RenderMonths style={renderMonthsStyle}>
        <MonthComponent />
      </RenderMonths>
    </View>
  );
});
