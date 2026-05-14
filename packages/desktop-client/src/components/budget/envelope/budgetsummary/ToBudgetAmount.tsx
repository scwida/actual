import React from 'react';
import type { CSSProperties, MouseEventHandler } from 'react';
import { useTranslation } from 'react-i18next';

import { Block } from '@actual-app/components/block';
import { theme } from '@actual-app/components/theme';
import { Tooltip } from '@actual-app/components/tooltip';
import { View } from '@actual-app/components/view';
import { css } from '@emotion/css';

import {
  useEnvelopeSheetName,
  useEnvelopeSheetValue,
} from '#components/budget/envelope/EnvelopeBudgetComponents';
import { FinancialText } from '#components/FinancialText';
import { PrivacyFilter } from '#components/PrivacyFilter';
import { useFormat } from '#hooks/useFormat';
import { envelopeBudget } from '#spreadsheet/bindings';

import { TotalsList } from './TotalsList';

type BudgetProgressBarProps = {
  progressPct: number;
  isNegative: boolean;
};

function BudgetProgressBar({
  progressPct,
  isNegative,
}: BudgetProgressBarProps) {
  const barColor = isNegative ? '#b42318' : '#0d7e82';
  return (
    <div
      style={{
        height: 5,
        backgroundColor: 'rgba(0,0,0,0.08)',
        borderRadius: 3,
        overflow: 'hidden',
        width: '100%',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${Math.min(1, progressPct) * 100}%`,
          backgroundColor: barColor,
          borderRadius: 3,
          transition: 'width 0.4s ease',
        }}
      />
    </div>
  );
}

type ToBudgetAmountProps = {
  prevMonthName: string;
  style?: CSSProperties;
  amountStyle?: CSSProperties;
  onClick: () => void;
  onContextMenu?: MouseEventHandler;
  isTotalsListTooltipDisabled?: boolean;
  hideProgress?: boolean;
};

export function ToBudgetAmount({
  prevMonthName,
  style,
  amountStyle,
  onClick,
  isTotalsListTooltipDisabled = false,
  onContextMenu,
  hideProgress = false,
}: ToBudgetAmountProps) {
  const { t } = useTranslation();
  const sheetName = useEnvelopeSheetName(envelopeBudget.toBudget);
  const sheetValue = useEnvelopeSheetValue({
    name: envelopeBudget.toBudget,
    value: 0,
  });
  const incomeAvailable =
    (useEnvelopeSheetValue({
      name: envelopeBudget.incomeAvailable,
      value: 0,
    }) as number) ?? 0;
  const totalBudgeted =
    (useEnvelopeSheetValue({
      name: envelopeBudget.totalBudgeted,
      value: 0,
    }) as number) ?? 0;

  const format = useFormat();
  const availableValue = sheetValue;
  if (typeof availableValue !== 'number' && availableValue !== null) {
    throw new Error(
      'Expected availableValue to be a number but got ' + availableValue,
    );
  }
  const num = availableValue ?? 0;
  const isNegative = num < 0;
  const isPositive = num > 0;

  // Progress = how much of available income has been assigned
  const budgetedAmount = Math.abs(totalBudgeted);
  const progressPct =
    incomeAvailable > 0 ? budgetedAmount / incomeAvailable : 0;

  const amountColor = isPositive
    ? theme.toBudgetPositive
    : isNegative
      ? theme.toBudgetNegative
      : theme.toBudgetZero;

  return (
    <View style={{ gap: 2, ...style }}>
      <Block
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: theme.pageTextLight,
          marginBottom: 4,
        }}
      >
        {isNegative ? t('Overbudgeted') : t('To be budgeted')}
      </Block>
      <View>
        <Tooltip
          content={
            <TotalsList
              prevMonthName={prevMonthName}
              style={{
                padding: 7,
              }}
            />
          }
          placement="bottom"
          offset={3}
          triggerProps={{ isDisabled: isTotalsListTooltipDisabled }}
        >
          <PrivacyFilter>
            <Block
              onClick={onClick}
              onContextMenu={onContextMenu}
              data-cellname={sheetName}
              className={css({
                ':hover': { borderBottomColor: amountColor },
              })}
              style={{
                fontSize: 36,
                fontWeight: 700,
                letterSpacing: '-0.03em',
                userSelect: 'none',
                cursor: 'pointer',
                color: amountColor,
                paddingBottom: 2,
                borderBottom: '2px solid transparent',
                ...amountStyle,
              }}
            >
              <FinancialText>{format(num, 'financial')}</FinancialText>
            </Block>
          </PrivacyFilter>
        </Tooltip>
      </View>

      {!hideProgress && (
        <View style={{ gap: 4, marginTop: 6 }}>
          <BudgetProgressBar
            progressPct={progressPct}
            isNegative={isNegative}
          />
          <Block
            style={{
              fontSize: 11,
              color: theme.pageTextLight,
              textAlign: 'right',
            }}
          >
            <PrivacyFilter>
              {isNegative
                ? t('Overbudgeted by {{amount}}', {
                    amount: format(Math.abs(num), 'financial'),
                  })
                : t('Remaining: {{amount}}', {
                    amount: format(num, 'financial'),
                  })}
            </PrivacyFilter>
          </Block>
        </View>
      )}
    </View>
  );
}
