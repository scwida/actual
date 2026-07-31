import React from 'react';
import type { CSSProperties } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';

import { EnvelopeCellValue } from '#components/budget/envelope/EnvelopeBudgetComponents';
import { sumTotalEnvelopeBalance } from '#components/budget/util';
import { PrivacyFilter } from '#components/PrivacyFilter';
import { CellValueText } from '#components/spreadsheet/CellValue';
import { useCategories } from '#hooks/useCategories';
import type { EnvelopeBalanceMap } from '#hooks/useEnvelopeBalances';
import { useLocale } from '#hooks/useLocale';
import type { Binding, SheetFields } from '#spreadsheet';
import { envelopeBudget } from '#spreadsheet/bindings';

type SummaryRowProps = {
  label: string;
  binding: Binding<'envelope-budget', SheetFields<'envelope-budget'>>;
  invert?: boolean;
  labelStyle?: CSSProperties;
  valueStyle?: CSSProperties;
  /**
   * When provided, overrides the value read from `binding`'s spreadsheet
   * cell -- used for the "Available" row, which shows the real,
   * ledger-backed envelope total (CLAUDE.md "The Envelopes") instead of
   * the old computed `total-leftover` cell. `binding` is still required
   * for the cell's sheet name/type plumbing.
   */
  valueOverride?: number;
};

function SummaryRow({
  label,
  binding,
  invert = false,
  labelStyle,
  valueStyle,
  valueOverride,
}: SummaryRowProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        padding: '5px 0',
      }}
    >
      <span
        style={{
          fontSize: 13,
          color: theme.pageTextLight,
          ...labelStyle,
        }}
      >
        {label}
      </span>
      <PrivacyFilter>
        <EnvelopeCellValue binding={binding} type="financial">
          {props => {
            const v =
              valueOverride !== undefined ? valueOverride : (props.value ?? 0);
            return (
              <CellValueText
                {...props}
                value={invert ? -v : v}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: theme.pageText,
                  fontVariantNumeric: 'tabular-nums',
                  ...valueStyle,
                }}
              />
            );
          }}
        </EnvelopeCellValue>
      </PrivacyFilter>
    </View>
  );
}

function Divider() {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: theme.tableBorder,
        margin: '8px 0',
      }}
    />
  );
}

type MonthSummaryPanelProps = {
  month: string;
  /**
   * Every envelope's current real, ledger-backed balance -- see
   * `#hooks/useEnvelopeBalances`. Hoisted once in `Budget()` rather than
   * fetched here, so this panel shares a single live-query subscription
   * with the rest of the envelope-mode table.
   */
  envelopeBalances: EnvelopeBalanceMap;
};

export function MonthSummaryPanel({
  month,
  envelopeBalances,
}: MonthSummaryPanelProps) {
  const { t } = useTranslation();
  const locale = useLocale();

  const displayMonth = monthUtils.format(month, 'MMMM', locale);
  const prevMonthName = monthUtils.format(
    monthUtils.prevMonth(month),
    'MMMM',
    locale,
  );

  const { data: { grouped: categoryGroups } = { grouped: [] } } =
    useCategories();
  // Real, ledger-backed total (CLAUDE.md "The Envelopes") instead of the
  // old computed `total-leftover` spreadsheet cell.
  const totalBalance = sumTotalEnvelopeBalance(
    categoryGroups,
    envelopeBalances,
  );

  const balanceColor =
    totalBalance > 0
      ? '#027a48'
      : totalBalance < 0
        ? '#b42318'
        : theme.pageTextLight;

  return (
    <View
      style={{
        width: 304,
        flexShrink: 0,
        ...styles.glassCard,
        padding: '18px 18px',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: '#1c1c1e',
          marginBottom: 14,
          letterSpacing: '-0.01em',
        }}
      >
        <Trans>{{ displayMonth }}&apos;s Summary</Trans>
      </div>

      <SummaryRow
        label={t('Left Over from {{prevMonthName}}', { prevMonthName })}
        binding={envelopeBudget.fromLastMonth}
      />
      <SummaryRow
        label={t('Assigned in {{displayMonth}}', { displayMonth })}
        binding={envelopeBudget.totalBudgeted}
        invert
      />
      <SummaryRow label={t('Activity')} binding={envelopeBudget.totalSpent} />

      <Divider />

      <SummaryRow
        label={t('Available')}
        binding={envelopeBudget.totalBalance}
        valueOverride={totalBalance}
        valueStyle={{ color: balanceColor, fontSize: 14, fontWeight: 700 }}
        labelStyle={{ fontWeight: 600, color: theme.pageText }}
      />

      <Divider />

      <SummaryRow
        label={t('Total Income')}
        binding={envelopeBudget.totalIncome}
      />
      <SummaryRow
        label={t('Overspent in {{prevMonthName}}', { prevMonthName })}
        binding={envelopeBudget.lastMonthOverspent}
      />
    </View>
  );
}
