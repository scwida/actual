import React, { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';
import type { IntegerAmount } from '@actual-app/core/shared/util';
import type {
  CategoryEntity,
  NegativeBalanceWarning,
} from '@actual-app/core/types/models';

import { getEnvelopeNegativeBalanceWarning } from '#budget/envelopeMovements';
import { useCategoriesById } from '#hooks/useCategories';
import { useFormat } from '#hooks/useFormat';
import { useUnallocatedEnvelopeId } from '#hooks/useUnallocatedEnvelope';

type CoverSuggestionProps = {
  /** The envelope currently negative -- what we're trying to cover. */
  envelopeId: CategoryEntity['id'];
  /**
   * One-click apply: a real transfer from the suggested source into
   * `envelopeId`, for the suggested amount. The caller is still expected
   * to also offer a manual picker (this is a suggestion, never forced --
   * CLAUDE.md "Envelope rules").
   */
  onApply: (source: CategoryEntity['id'], amount: IntegerAmount) => void;
};

/**
 * Surfaces the envelope engine's own suggested cover source
 * (`NegativeBalanceWarning.suggestedCover`, computed by
 * `suggestCoverSource` in `packages/loot-core/src/server/envelopes/movement.ts`)
 * as a one-click action, alongside whatever manual source/amount picker
 * the caller renders below it. Renders nothing if there's no suggestion
 * (e.g. the envelope isn't actually negative, or no suitable source was
 * found).
 */
export function CoverSuggestion({ envelopeId, onApply }: CoverSuggestionProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const { id: unallocatedId } = useUnallocatedEnvelopeId();
  const {
    data: { list: categoriesById } = {
      list: {} as Record<string, CategoryEntity>,
    },
  } = useCategoriesById();
  const [warning, setWarning] = useState<NegativeBalanceWarning | null>(null);

  useEffect(() => {
    let isCurrent = true;
    void getEnvelopeNegativeBalanceWarning(
      envelopeId,
      monthUtils.currentDay(),
    ).then(result => {
      if (isCurrent) {
        setWarning(result);
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [envelopeId]);

  const suggestion = warning?.suggestedCover;
  if (!suggestion || !('envelope' in suggestion.source)) {
    return null;
  }

  const sourceId = suggestion.source.envelope;
  const sourceName =
    sourceId === unallocatedId
      ? t('Unallocated')
      : (categoriesById[sourceId]?.name ?? sourceId);

  return (
    <View style={{ padding: '10px 10px 0' }}>
      <Text
        style={{
          ...styles.verySmallText,
          color: theme.pageTextLight,
          marginBottom: 4,
        }}
      >
        <Trans>Suggested cover</Trans>
      </Text>
      <Button
        variant="primary"
        style={{ width: '100%', fontSize: 12 }}
        onPress={() => onApply(sourceId, suggestion.amount)}
      >
        {t('Cover {{amount}} from {{source}}', {
          amount: format(suggestion.amount, 'financial'),
          source: sourceName,
        })}
      </Button>
    </View>
  );
}
