import React, { useCallback, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import { Popover } from '@actual-app/components/popover';
import { View } from '@actual-app/components/view';

import { CoverMenu } from '#components/budget/envelope/CoverMenu';
import { CoverSuggestion } from '#components/budget/envelope/CoverSuggestion';
import { HoldMenu } from '#components/budget/envelope/HoldMenu';
import { TransferMenu } from '#components/budget/envelope/TransferMenu';
import { useContextMenu } from '#hooks/useContextMenu';
import { useFormat } from '#hooks/useFormat';
import { useUnallocatedEnvelope } from '#hooks/useUnallocatedEnvelope';

import { ToBudgetAmount } from './ToBudgetAmount';
import { ToBudgetMenu } from './ToBudgetMenu';

type ToBudgetProps = {
  month: string;
  onBudgetAction: (month: string, action: string, arg?: unknown) => void;
  prevMonthName: string;
  style?: CSSProperties;
  amountStyle?: CSSProperties;
  isCollapsed?: boolean;
  hideProgress?: boolean;
};
export function ToBudget({
  month,
  prevMonthName,
  onBudgetAction,
  style,
  amountStyle,
  isCollapsed = false,
  hideProgress = false,
}: ToBudgetProps) {
  const [menuStep, _setMenuStep] = useState<string>('actions');
  const triggerRef = useRef(null);
  const format = useFormat();

  const ref = useRef<HTMLSpanElement>(null);
  const setMenuStep = useCallback(
    (menu: string) => {
      if (menu) ref.current?.focus();
      _setMenuStep(menu);
    },
    [ref, _setMenuStep],
  );
  // The amount these menus prefill/cap at is the real Unallocated envelope
  // balance (CLAUDE.md "How money moves" #3/#4) -- not the old to-budget
  // formula cell, which no longer reflects real money once the quick-fund
  // cell stops writing to it (see `#budget/mutations`).
  const { id: unallocatedId, balance: unallocatedBalance } =
    useUnallocatedEnvelope();

  const {
    setMenuOpen,
    menuOpen,
    handleContextMenu,
    resetPosition,
    position,
    asContextMenu,
  } = useContextMenu();

  return (
    <>
      <View ref={triggerRef}>
        <ToBudgetAmount
          onClick={() => {
            resetPosition();
            setMenuOpen(true);
          }}
          prevMonthName={prevMonthName}
          style={style}
          amountStyle={amountStyle}
          isTotalsListTooltipDisabled={!isCollapsed || menuOpen}
          onContextMenu={handleContextMenu}
          hideProgress={hideProgress}
        />
      </View>

      <Popover
        triggerRef={triggerRef}
        placement={asContextMenu ? 'bottom start' : 'bottom'}
        isOpen={menuOpen}
        onOpenChange={() => {
          setMenuStep('actions');
          setMenuOpen(false);
        }}
        style={{ width: 200, margin: 1 }}
        isNonModal
        {...position}
      >
        <span tabIndex={-1} ref={ref}>
          {menuStep === 'actions' && (
            <ToBudgetMenu
              onTransfer={() => setMenuStep('transfer')}
              onCover={() => setMenuStep('cover')}
              onHoldBuffer={() => setMenuStep('buffer')}
              onResetHoldBuffer={() => {
                onBudgetAction(month, 'reset-hold');
                setMenuOpen(false);
              }}
              month={month}
              onBudgetAction={onBudgetAction}
            />
          )}
          {menuStep === 'buffer' && (
            <HoldMenu
              onClose={() => setMenuOpen(false)}
              onSubmit={amount => {
                onBudgetAction(month, 'hold', { amount });
              }}
            />
          )}
          {menuStep === 'transfer' && (
            <TransferMenu
              initialAmount={Math.max(unallocatedBalance, 0)}
              onClose={() => setMenuOpen(false)}
              onSubmit={(amount, categoryId) => {
                onBudgetAction(month, 'transfer-available', {
                  amount,
                  category: categoryId,
                });
              }}
            />
          )}
          {menuStep === 'cover' && (
            <>
              {unallocatedId && (
                <CoverSuggestion
                  envelopeId={unallocatedId}
                  onApply={(source, amount) => {
                    onBudgetAction(month, 'cover-overbudgeted', {
                      category: source,
                      amount,
                      currencyCode: format.currency.code,
                    });
                    setMenuOpen(false);
                  }}
                />
              )}
              <CoverMenu
                showToBeBudgeted={false}
                initialAmount={Math.max(-unallocatedBalance, 0)}
                onClose={() => setMenuOpen(false)}
                onSubmit={(amount, categoryId) => {
                  onBudgetAction(month, 'cover-overbudgeted', {
                    category: categoryId,
                    amount,
                    currencyCode: format.currency.code,
                  });
                }}
              />
            </>
          )}
        </span>
      </Popover>
    </>
  );
}
