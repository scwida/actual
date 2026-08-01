import { Trans, useTranslation } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type {
  Cadence,
  SuggestedContributionResult,
} from '@actual-app/core/types/models';

import { FinancialText } from '#components/FinancialText';
import { useFormat } from '#hooks/useFormat';

/**
 * A per-period noun for "per {{cadence}} to reach your goal" -- a literal
 * `t()` call per case (rather than a dynamic-key lookup) so the
 * translation-string extractor picks up every variant statically.
 */
function getCadenceNoun(t: (key: string) => string, cadence: Cadence): string {
  switch (cadence.type) {
    case 'weekly':
      return t('week');
    case 'monthly':
      return t('month');
    case 'quarterly':
      return t('quarter');
    case 'annual':
      return t('year');
    case 'custom':
      return t('period');
    default: {
      const exhaustiveCheck: never = cadence;
      throw new Error(
        `getCadenceNoun: unknown cadence: ${String(exhaustiveCheck)}`,
      );
    }
  }
}

type SuggestedContributionDisplayProps = {
  result: SuggestedContributionResult;
  cadence: Cadence;
};

/**
 * Displays a dated goal's suggested per-period contribution (CLAUDE.md
 * "Envelope goal types" / "Envelope rules": "the app computes a suggested
 * per-paycheck/weekly/monthly contribution to hit it"). The two
 * `SuggestedContributionResult` variants are shown with genuinely distinct
 * copy and styling -- a passed target date is a warning state, not a
 * suggestion of "$0/period" that would look like the goal is on track.
 */
export function SuggestedContributionDisplay({
  result,
  cadence,
}: SuggestedContributionDisplayProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const cadenceLabel = getCadenceNoun(t, cadence);

  if (result.status === 'target-date-passed') {
    return (
      <View
        style={{
          padding: '8px 10px',
          borderRadius: 8,
          backgroundColor: 'rgba(180,35,24,0.14)',
          border: '1px solid rgba(180,35,24,0.30)',
          gap: 2,
        }}
      >
        <Text style={{ fontSize: 12, fontWeight: 700, color: '#b42318' }}>
          <Trans>Target date has passed</Trans>
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          <FinancialText
            as="span"
            style={{ fontSize: 12, fontWeight: 700, color: '#b42318' }}
          >
            {format(result.shortfall, 'financial')}
          </FinancialText>
          <Text style={{ fontSize: 12, color: '#b42318' }}>
            <Trans>still needed to reach this goal.</Trans>
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={{
        padding: '8px 10px',
        borderRadius: 8,
        backgroundColor: 'rgba(52,199,89,0.18)',
        border: '1px solid rgba(52,199,89,0.35)',
        gap: 2,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: 4,
        }}
      >
        <Text style={{ fontSize: 12, fontWeight: 700, color: '#1a7a35' }}>
          <Trans>Contribute</Trans>
        </Text>
        <FinancialText
          as="span"
          style={{ fontSize: 12, fontWeight: 700, color: '#1a7a35' }}
        >
          {format(result.suggestedAmount, 'financial')}
        </FinancialText>
        <Text style={{ fontSize: 12, fontWeight: 700, color: '#1a7a35' }}>
          {t('per {{cadence}} to reach your goal', { cadence: cadenceLabel })}
        </Text>
      </View>
      <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
        {t('{{count}} periods remaining', {
          count: result.periodsRemaining,
        })}
      </Text>
    </View>
  );
}
