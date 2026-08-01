import { useTranslation } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { EnvelopeGoalType } from '@actual-app/core/types/models';

export type GoalSelection = 'none' | EnvelopeGoalType;

const GOAL_SELECTIONS: GoalSelection[] = ['none', 'recurring', 'dated'];

/**
 * Mutually-exclusive selection between the two real goal types plus "no
 * goal" (CLAUDE.md "Envelope goal types": "one, the other, or neither;
 * never both at once"). A radiogroup, not independent checkboxes, so this
 * is structurally as well as visually a single choice.
 */
type GoalTypePickerProps = {
  value: GoalSelection;
  onChange: (selection: GoalSelection) => void;
};

export function GoalTypePicker({ value, onChange }: GoalTypePickerProps) {
  const { t } = useTranslation();

  const meta: Record<GoalSelection, { label: string; description: string }> = {
    none: {
      label: t('No goal'),
      description: t('Just a plain envelope with no target.'),
    },
    recurring: {
      label: t('Recurring target'),
      description: t('An ongoing amount with no end date, e.g. $85/month.'),
    },
    dated: {
      label: t('Dated goal'),
      description: t('A target balance by a specific date.'),
    },
  };

  return (
    <View
      role="radiogroup"
      aria-label={t('Goal type')}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8,
      }}
    >
      {GOAL_SELECTIONS.map(selection => {
        const isActive = value === selection;
        return (
          <View
            key={selection}
            role="radio"
            aria-checked={isActive}
            tabIndex={0}
            onClick={() => onChange(selection)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onChange(selection);
              }
            }}
            style={{
              padding: '10px 10px 8px',
              borderRadius: 10,
              cursor: 'pointer',
              backgroundColor: isActive
                ? 'rgba(13,126,130,0.16)'
                : 'rgba(255,255,255,0.30)',
              border: `1px solid ${
                isActive ? '#0d7e82' : 'rgba(255,255,255,0.50)'
              }`,
              gap: 4,
              minWidth: 0,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: isActive ? '#0d7e82' : theme.pageText,
              }}
            >
              {meta[selection].label}
            </Text>
            <Text
              style={{
                fontSize: 11,
                color: theme.pageTextSubdued,
                lineHeight: 1.35,
              }}
            >
              {meta[selection].description}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
