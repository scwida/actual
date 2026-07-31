import React, { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import * as monthUtils from '@actual-app/core/shared/months';

import type { EnvelopeBalanceMap } from '#hooks/useEnvelopeBalances';

type EnvelopeBudgetContextDefinition = {
  summaryCollapsed: boolean;
  onBudgetAction: (month: string, action: string, arg?: unknown) => void;
  onToggleSummaryCollapse: () => void;
  currentMonth: string;
  /**
   * Every envelope's current real, ledger-backed balance
   * (`categories.balance` -- see `#hooks/useEnvelopeBalances`), hoisted
   * once here so category/group/total rows don't each mount their own
   * live-query subscription. Used for the envelope-mode balance display
   * (CLAUDE.md "The Envelopes") instead of the old computed
   * `leftover-{cat}` spreadsheet cell.
   */
  envelopeBalances: EnvelopeBalanceMap;
};

const EnvelopeBudgetContext = createContext<EnvelopeBudgetContextDefinition>({
  summaryCollapsed: false,
  onBudgetAction: () => {
    throw new Error('Unitialised context method called: onBudgetAction');
  },
  onToggleSummaryCollapse: () => {
    throw new Error(
      'Unitialised context method called: onToggleSummaryCollapse',
    );
  },
  currentMonth: 'unknown',
  envelopeBalances: {},
});

type EnvelopeBudgetProviderProps = Omit<
  EnvelopeBudgetContextDefinition,
  'currentMonth'
> & {
  children: ReactNode;
};
export function EnvelopeBudgetProvider({
  summaryCollapsed,
  onBudgetAction,
  onToggleSummaryCollapse,
  envelopeBalances,
  children,
}: EnvelopeBudgetProviderProps) {
  const currentMonth = monthUtils.currentMonth();

  return (
    <EnvelopeBudgetContext.Provider
      value={{
        currentMonth,
        summaryCollapsed,
        onBudgetAction,
        onToggleSummaryCollapse,
        envelopeBalances,
      }}
    >
      {children}
    </EnvelopeBudgetContext.Provider>
  );
}

export function useEnvelopeBudget() {
  return useContext(EnvelopeBudgetContext);
}
