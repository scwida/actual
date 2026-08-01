import { Trans, useTranslation } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

/**
 * A recurring goal's months-covered figure is considered "full" once it
 * reaches this many months -- an arbitrary but generous horizon (within
 * CLAUDE.md's suggested "3-6 months" range) past which showing more bar
 * fill wouldn't communicate anything additional; the exact numeric value
 * is always shown alongside the bar regardless of where it falls.
 */
const FULL_THRESHOLD_MONTHS = 6;

type MonthsCoveredIndicatorProps = {
  monthsCovered: number;
};

/**
 * Numeric + progress-bar display of a recurring goal's months-covered
 * indicator (CLAUDE.md "Envelope goal types": "current balance / recurring
 * target = how many future months this envelope can already handle").
 *
 * A negative value means the envelope is behind, not merely "at zero" --
 * per CLAUDE.md's "never let the user believe they have money they don't
 * have" philosophy this gets a visually distinct treatment (a full-width
 * red bar with an explicit "behind" label), not an empty/faint bar that
 * would look indistinguishable from "just barely not covered".
 */
export function MonthsCoveredIndicator({
  monthsCovered,
}: MonthsCoveredIndicatorProps) {
  const { t } = useTranslation();
  const isBehind = monthsCovered < 0;
  const pct = isBehind ? 1 : Math.min(monthsCovered / FULL_THRESHOLD_MONTHS, 1);
  const isFull = monthsCovered >= FULL_THRESHOLD_MONTHS;

  const barColor = isBehind
    ? '#b42318'
    : isFull
      ? '#1a7a35'
      : monthsCovered < 1
        ? '#7a5800'
        : '#1a7a35';
  const barBg = isBehind ? 'rgba(180,35,24,0.14)' : 'rgba(120,120,130,0.12)';

  return (
    <View style={{ gap: 6 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: 600, color: theme.pageText }}>
          {isBehind
            ? t('{{months}} months behind', {
                months: Math.abs(monthsCovered).toFixed(1),
              })
            : t('{{months}} months covered', {
                months: monthsCovered.toFixed(1),
              })}
        </Text>
        {isFull && !isBehind && (
          <Text
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#1a7a35',
              backgroundColor: 'rgba(52,199,89,0.18)',
              borderRadius: 100,
              padding: '2px 8px',
            }}
          >
            <Trans>Fully covered</Trans>
          </Text>
        )}
        {isBehind && (
          <Text
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#b42318',
              backgroundColor: 'rgba(180,35,24,0.14)',
              borderRadius: 100,
              padding: '2px 8px',
            }}
          >
            <Trans>Behind</Trans>
          </Text>
        )}
      </View>
      <View
        style={{
          height: 8,
          backgroundColor: barBg,
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            height: '100%',
            width: `${pct * 100}%`,
            backgroundColor: barColor,
            borderRadius: 4,
            transition: 'width 0.3s ease',
          }}
        />
      </View>
    </View>
  );
}
