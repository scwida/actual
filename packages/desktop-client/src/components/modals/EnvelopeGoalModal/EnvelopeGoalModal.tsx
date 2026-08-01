import { useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { IntegerAmount } from '@actual-app/core/shared/util';
import type {
  Cadence,
  SetEnvelopeGoalInput,
} from '@actual-app/core/types/models';
import { addDays, format as formatDate } from 'date-fns';

import {
  Modal,
  ModalCloseButton,
  ModalHeader,
  ModalTitle,
} from '#components/common/Modal';
import { FinancialText } from '#components/FinancialText';
import { FieldLabel } from '#components/mobile/MobileForms';
import { DateSelect } from '#components/select/DateSelect';
import { AmountInput } from '#components/util/AmountInput';
import { useCategory } from '#hooks/useCategory';
import { useDateFormat } from '#hooks/useDateFormat';
import { useFormat } from '#hooks/useFormat';
import type { Modal as ModalType } from '#modals/modalsSlice';

import { CadencePicker } from './CadencePicker';
import { GoalTypePicker } from './GoalTypePicker';
import type { GoalSelection } from './GoalTypePicker';
import { MonthsCoveredIndicator } from './MonthsCoveredIndicator';
import { SuggestedContributionDisplay } from './SuggestedContributionDisplay';
import { setEnvelopeGoal, useEnvelopeGoal } from './useEnvelopeGoal';

const DEFAULT_CADENCE: Cadence = { type: 'monthly' };

type EnvelopeGoalModalProps = Extract<
  ModalType,
  { name: 'envelope-goal-edit' }
>['options'];

/**
 * The envelope detail/settings view for configuring a real-backend
 * envelope goal (CLAUDE.md "Envelope goal types"). Deliberately separate
 * from the budget grid's quick-fund cell -- "Goal configuration ... happens
 * in a separate envelope detail/settings view", not inline in the grid.
 *
 * This is a NEW UI surface for the real `envelope/goal/*` engine handlers
 * -- unrelated to (and does not touch) the local-storage-backed prototype
 * goal system in `packages/desktop-client/src/paycheck-planner/` or the
 * old `goal_def` template mini-language in
 * `#components/budget/goals/`.
 */
export function EnvelopeGoalModal({ envelopeId }: EnvelopeGoalModalProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const dateFormat = useDateFormat() || 'yyyy-MM-dd';

  const { data: category } = useCategory(envelopeId);
  const {
    goal,
    monthsCovered,
    suggestedContribution,
    averageMonthlySpend,
    isLoading,
    error,
    refetch,
  } = useEnvelopeGoal(envelopeId);

  const [selection, setSelection] = useState<GoalSelection>('none');
  const [recurringAmount, setRecurringAmount] = useState<IntegerAmount>(0);
  const [recurringCadence, setRecurringCadence] =
    useState<Cadence>(DEFAULT_CADENCE);
  const [isRecurringAmountSuggested, setIsRecurringAmountSuggested] =
    useState(false);
  const [datedAmount, setDatedAmount] = useState<IntegerAmount>(0);
  const [datedDate, setDatedDate] = useState<string>(() =>
    formatDate(addDays(new Date(), 30), 'yyyy-MM-dd'),
  );
  const [datedCadence, setDatedCadence] = useState<Cadence>(DEFAULT_CADENCE);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Seed the edit form from the envelope's ALREADY-SAVED goal exactly once,
  // the first time it loads -- a later live refetch (e.g. another device
  // changing something else about this envelope while this modal is open)
  // must never clobber form input the user is actively editing.
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current || !goal) {
      return;
    }
    initializedRef.current = true;
    setSelection(goal.type);
    if (goal.type === 'recurring') {
      setRecurringAmount(goal.targetAmount);
      setRecurringCadence(goal.cadence);
    } else if (goal.type === 'dated') {
      setDatedAmount(goal.targetAmount);
      setDatedDate(goal.targetDate);
      setDatedCadence(goal.contributionCadence);
    }
  }, [goal]);

  function handleSelectionChange(next: GoalSelection) {
    setSelection(next);
    // Historical-spending suggested default (CLAUDE.md: "a smart default,
    // not a hard rule") -- only ever offered when setting up a genuinely
    // NEW recurring goal: transitioning in from none/dated, or the amount
    // field is still empty. Never overwrites a value the user already
    // typed.
    if (
      next === 'recurring' &&
      recurringAmount === 0 &&
      averageMonthlySpend != null &&
      averageMonthlySpend > 0
    ) {
      setRecurringAmount(averageMonthlySpend);
      setIsRecurringAmountSuggested(true);
    }
  }

  async function handleSave(onDone: () => void) {
    let input: SetEnvelopeGoalInput;
    if (selection === 'none') {
      input = { type: 'none' };
    } else if (selection === 'recurring') {
      input = {
        type: 'recurring',
        targetAmount: recurringAmount,
        cadence: recurringCadence,
      };
    } else {
      input = {
        type: 'dated',
        targetAmount: datedAmount,
        targetDate: datedDate,
        contributionCadence: datedCadence,
      };
    }

    setSaveError(null);
    setIsSaving(true);
    try {
      await setEnvelopeGoal(envelopeId, input);
      refetch();
      onDone();
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : t('Failed to save this goal.'),
      );
    } finally {
      setIsSaving(false);
    }
  }

  const canSave =
    selection === 'none' ||
    (selection === 'recurring' && recurringAmount > 0) ||
    (selection === 'dated' && datedAmount > 0 && !!datedDate);

  return (
    <Modal
      name="envelope-goal-edit"
      containerProps={{
        style: {
          width: 480,
          ...styles.glassCard,
          padding: 20,
          gap: 16,
        },
      }}
    >
      {({ state }) => (
        <>
          <ModalHeader
            title={
              <ModalTitle
                title={category?.name ?? t('Envelope goal')}
                shrinkOnOverflow
              />
            }
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />

          {isLoading && !goal && (
            <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
              <Trans>Loading…</Trans>
            </Text>
          )}
          {error && (
            <Text style={{ fontSize: 12, color: '#b42318' }}>{error}</Text>
          )}

          {goal && (
            <View style={{ gap: 16 }}>
              {goal.type === 'recurring' && monthsCovered != null && (
                <View style={{ gap: 6 }}>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      color: theme.pageTextSubdued,
                    }}
                  >
                    <Trans>Current goal</Trans>
                  </Text>
                  <MonthsCoveredIndicator monthsCovered={monthsCovered} />
                </View>
              )}

              {goal.type === 'dated' && suggestedContribution && (
                <View style={{ gap: 6 }}>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      color: theme.pageTextSubdued,
                    }}
                  >
                    <Trans>Current goal</Trans>
                  </Text>
                  <SuggestedContributionDisplay
                    result={suggestedContribution}
                    cadence={goal.contributionCadence}
                  />
                </View>
              )}

              <View style={{ gap: 10 }}>
                <FieldLabel title={t('Goal type')} flush />
                <GoalTypePicker
                  value={selection}
                  onChange={handleSelectionChange}
                />
              </View>

              {selection === 'recurring' && (
                <View style={{ gap: 10 }}>
                  <View>
                    <FieldLabel title={t('Target amount per period')} />
                    <AmountInput
                      value={recurringAmount}
                      sign="+"
                      onUpdate={amount => {
                        setRecurringAmount(amount);
                        setIsRecurringAmountSuggested(false);
                      }}
                    />
                    {isRecurringAmountSuggested &&
                      averageMonthlySpend != null && (
                        <Text
                          style={{
                            fontSize: 11,
                            color: theme.pageTextSubdued,
                            marginTop: 4,
                          }}
                        >
                          <Trans>
                            Based on{' '}
                            <FinancialText as="span">
                              {format(averageMonthlySpend, 'financial')}
                            </FinancialText>
                            /mo average spending — adjust as needed.
                          </Trans>
                        </Text>
                      )}
                  </View>
                  <View>
                    <FieldLabel title={t('Cadence')} />
                    <CadencePicker
                      value={recurringCadence}
                      onChange={setRecurringCadence}
                    />
                  </View>
                </View>
              )}

              {selection === 'dated' && (
                <View style={{ gap: 10 }}>
                  <View>
                    <FieldLabel title={t('Target amount')} />
                    <AmountInput
                      value={datedAmount}
                      sign="+"
                      onUpdate={setDatedAmount}
                    />
                  </View>
                  <View>
                    <FieldLabel title={t('Target date')} />
                    <DateSelect
                      value={datedDate}
                      dateFormat={dateFormat}
                      onSelect={setDatedDate}
                    />
                  </View>
                  <View>
                    <FieldLabel title={t('Contribution cadence')} />
                    <CadencePicker
                      value={datedCadence}
                      onChange={setDatedCadence}
                    />
                  </View>
                </View>
              )}

              {saveError && (
                <Text style={{ fontSize: 12, color: '#b42318' }}>
                  {saveError}
                </Text>
              )}

              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'flex-end',
                  gap: 8,
                }}
              >
                <Button onPress={() => state.close()}>
                  <Trans>Cancel</Trans>
                </Button>
                <Button
                  variant="primary"
                  isDisabled={!canSave || isSaving}
                  onPress={() => void handleSave(() => state.close())}
                >
                  <Trans>Save</Trans>
                </Button>
              </View>
            </View>
          )}
        </>
      )}
    </Modal>
  );
}
