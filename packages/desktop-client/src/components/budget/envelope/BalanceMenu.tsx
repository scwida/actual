import React from 'react';
import type { ComponentProps, ComponentPropsWithoutRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Menu } from '@actual-app/components/menu';

import { envelopeBudget } from '#spreadsheet/bindings';

import { useEnvelopeSheetValue } from './EnvelopeBudgetComponents';

type BalanceMenuProps = Omit<
  ComponentPropsWithoutRef<typeof Menu>,
  'onMenuSelect' | 'items'
> & {
  categoryId: string;
  onTransfer?: () => void;
  onCarryover?: (carryOver: boolean) => void;
  onCover?: () => void;
  /**
   * Opens the real-balance-engine envelope goal settings view (CLAUDE.md
   * "Envelope goal types") -- a separate detail/settings surface, not this
   * menu itself. See `#components/modals/EnvelopeGoalModal`.
   */
  onGoal?: () => void;
};

export function BalanceMenu({
  categoryId,
  onTransfer,
  onCarryover,
  onCover,
  onGoal,
  ...props
}: BalanceMenuProps) {
  const { t } = useTranslation();

  const carryover = useEnvelopeSheetValue(
    envelopeBudget.catCarryover(categoryId),
  );
  const balance =
    useEnvelopeSheetValue(envelopeBudget.catBalance(categoryId)) ?? 0;

  // The `as` cast below matches the established workaround used elsewhere
  // in this codebase (see e.g. `CategoryGroupMenuModal.tsx`) for a known
  // TypeScript symbol-widening quirk: `Menu.line` loses its precise
  // `unique symbol` type once spread inside a conditionally-built array
  // literal like this, and no amount of explicit `MenuItem<string>[]`
  // annotation on individual segments resolves it -- `satisfies` doesn't
  // help either, since it still runs the same assignability check that's
  // failing.
  const items = [
    ...(balance > 0
      ? [
          {
            name: 'transfer',
            text: t('Transfer to another category'),
          },
        ]
      : []),
    ...(balance < 0
      ? [
          {
            name: 'cover',
            text: t('Cover overspending'),
          },
        ]
      : []),
    {
      name: 'carryover',
      text: carryover
        ? t('Remove overspending rollover')
        : t('Rollover overspending'),
    },
    ...(onGoal
      ? [
          Menu.line,
          {
            name: 'goal',
            text: t('Set goal…'),
          },
        ]
      : []),
  ] as ComponentProps<typeof Menu>['items'];

  return (
    <Menu
      {...props}
      onMenuSelect={name => {
        switch (name) {
          case 'transfer':
            onTransfer?.();
            break;
          case 'carryover':
            onCarryover?.(!carryover);
            break;
          case 'cover':
            onCover?.();
            break;
          case 'goal':
            onGoal?.();
            break;
          default:
            break;
        }
      }}
      items={items}
    />
  );
}
