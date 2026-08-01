import { Trans, useTranslation } from 'react-i18next';

import { Input } from '@actual-app/components/input';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { Cadence } from '@actual-app/core/types/models';

type CadenceType = Cadence['type'];

const CADENCE_TYPES: CadenceType[] = [
  'weekly',
  'monthly',
  'quarterly',
  'annual',
  'custom',
];

/**
 * A single shared UI for picking a `Cadence` (CLAUDE.md "Envelope goal
 * types": "one, the other, or neither" for goal type, but the cadence
 * primitive itself is explicitly one shared concept reused by both a
 * recurring goal's ongoing cadence and a dated goal's contribution
 * cadence -- see `packages/loot-core/src/types/models/envelope-goal.ts`'s
 * `Cadence` doc comment). Deliberately the ONLY cadence picker in the
 * app -- do not build a second one for the other goal type.
 */
type CadencePickerProps = {
  value: Cadence;
  onChange: (cadence: Cadence) => void;
  disabled?: boolean;
};

export function CadencePicker({
  value,
  onChange,
  disabled = false,
}: CadencePickerProps) {
  const { t } = useTranslation();

  const labels: Record<CadenceType, string> = {
    weekly: t('Weekly'),
    monthly: t('Monthly'),
    quarterly: t('Quarterly'),
    annual: t('Annual'),
    custom: t('Custom'),
  };

  const customDays = value.type === 'custom' ? value.days : 30;

  return (
    <View style={{ gap: 8 }}>
      <View
        role="radiogroup"
        aria-label={t('Cadence')}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 6,
        }}
      >
        {CADENCE_TYPES.map(type => {
          const isActive = value.type === type;
          return (
            <View
              key={type}
              role="radio"
              aria-checked={isActive}
              tabIndex={disabled ? -1 : 0}
              onClick={() => {
                if (disabled) return;
                onChange(
                  type === 'custom' ? { type, days: customDays } : { type },
                );
              }}
              onKeyDown={e => {
                if (disabled) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onChange(
                    type === 'custom' ? { type, days: customDays } : { type },
                  );
                }
              }}
              style={{
                textAlign: 'center',
                padding: '6px 4px',
                borderRadius: 8,
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
                backgroundColor: isActive
                  ? 'rgba(13,126,130,0.16)'
                  : 'rgba(255,255,255,0.30)',
                border: `1px solid ${
                  isActive ? '#0d7e82' : 'rgba(255,255,255,0.50)'
                }`,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? '#0d7e82' : theme.pageText,
                }}
              >
                {labels[type]}
              </Text>
            </View>
          );
        })}
      </View>

      {value.type === 'custom' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
            <Trans>Every</Trans>
          </Text>
          <Input
            type="number"
            min={1}
            value={String(value.days)}
            disabled={disabled}
            onChangeValue={newValue => {
              const days = parseInt(newValue, 10);
              onChange({
                type: 'custom',
                days: Number.isFinite(days) && days > 0 ? days : 1,
              });
            }}
            style={{ width: 64 }}
          />
          <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
            <Trans>days</Trans>
          </Text>
        </View>
      )}
    </View>
  );
}
