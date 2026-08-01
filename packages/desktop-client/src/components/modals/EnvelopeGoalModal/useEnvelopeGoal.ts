import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listen, send } from '@actual-app/core/platform/client/connection';
import type { IntegerAmount } from '@actual-app/core/shared/util';
import type {
  CategoryEntity,
  EnvelopeGoal,
  SetEnvelopeGoalInput,
  SuggestedContributionResult,
} from '@actual-app/core/types/models';

/**
 * Any sync-event `tables` entry in this set means the data this hook
 * surfaces may be stale and needs a refetch -- mirrors
 * `#hooks/useEnvelopeBalances`'s `RELEVANT_TABLES` for the same reason:
 * `envelope_goal` is a normal CRDT-tracked table (unlike the balance
 * cache), but months-covered/suggested-contribution are recomputed live
 * from the envelope's CURRENT real balance server-side, so a balance
 * change (surfaced via `envelope_ledger`) needs to trigger a refetch here
 * too, not just a goal-configuration change.
 */
const RELEVANT_TABLES = new Set([
  'envelope_goal',
  'envelope_ledger',
  'envelope_balances',
  'categories',
]);

export type EnvelopeGoalData = {
  /** `null` while the initial fetch is still in flight. */
  goal: EnvelopeGoal | null;
  /** `null` = no recurring goal (see `envelope/goal/months-covered`). */
  monthsCovered: number | null;
  /** `null` = no dated goal (see `envelope/goal/suggested-contribution`). */
  suggestedContribution: SuggestedContributionResult | null;
  /** Trailing average monthly spend, for the recurring-goal setup default. */
  averageMonthlySpend: IntegerAmount | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
};

/**
 * Live data for a single envelope's real-backend goal (CLAUDE.md "Envelope
 * goal types"). Refetches on mount and whenever a relevant sync event comes
 * in -- e.g. another device funding/spending this envelope while this
 * modal is open should update the live months-covered / suggested-
 * contribution figures, not go stale until the modal is reopened.
 */
export function useEnvelopeGoal(
  envelopeId: CategoryEntity['id'] | null,
): EnvelopeGoalData {
  const { t } = useTranslation();
  const [goal, setGoal] = useState<EnvelopeGoal | null>(null);
  const [monthsCovered, setMonthsCovered] = useState<number | null>(null);
  const [suggestedContribution, setSuggestedContribution] =
    useState<SuggestedContributionResult | null>(null);
  const [averageMonthlySpend, setAverageMonthlySpend] =
    useState<IntegerAmount | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    if (!envelopeId) {
      return;
    }
    setIsLoading(true);
    setError(null);
    Promise.all([
      send('envelope/goal/get', { envelopeId }),
      send('envelope/goal/months-covered', { envelopeId }),
      send('envelope/goal/suggested-contribution', { envelopeId }),
      send('envelope/goal/average-monthly-spend', { envelopeId }),
    ])
      .then(([nextGoal, nextMonthsCovered, nextSuggestion, nextAverage]) => {
        setGoal(nextGoal);
        setMonthsCovered(nextMonthsCovered);
        setSuggestedContribution(nextSuggestion);
        setAverageMonthlySpend(nextAverage);
      })
      .catch(() => {
        setError(t("Failed to load this envelope's goal."));
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [envelopeId, t]);

  useEffect(() => {
    refetch();

    return listen('sync-event', event => {
      if (
        (event.type === 'applied' || event.type === 'success') &&
        event.tables.some(table => RELEVANT_TABLES.has(table))
      ) {
        refetch();
      }
    });
  }, [refetch]);

  return {
    goal,
    monthsCovered,
    suggestedContribution,
    averageMonthlySpend,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Thin wrapper around `envelope/goal/set` -- creates, replaces, or clears
 * (`{ type: 'none' }`) an envelope's goal. Callers should `refetch()` (or
 * rely on the sync-event listener above) to pick up the result rather than
 * trusting the return value as the new source of truth, for consistency
 * with every other write in this app.
 */
export async function setEnvelopeGoal(
  envelopeId: CategoryEntity['id'],
  goal: SetEnvelopeGoalInput,
): Promise<EnvelopeGoal> {
  return send('envelope/goal/set', { envelopeId, goal });
}
