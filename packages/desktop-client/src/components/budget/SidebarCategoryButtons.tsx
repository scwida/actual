import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { CategoryEntity } from '@actual-app/core/types/models/category';

import { NotesButton } from '#components/NotesButton';
import { useFeatureFlag } from '#hooks/useFeatureFlag';
import { useGlobalPref } from '#hooks/useGlobalPref';
import { useNotes } from '#hooks/useNotes';
import { CategoryGoalChip } from '#paycheck-planner/CategoryGoalChip';

import { CategoryAutomationButton } from './goals/CategoryAutomationButton';

type SidebarCategoryButtonsProps = {
  category: CategoryEntity;
  dragging: boolean;
  goalsShown: boolean;
  isIncome?: boolean;
};

export const SidebarCategoryButtons = ({
  category,
  dragging,
  goalsShown,
  isIncome = false,
}: SidebarCategoryButtonsProps) => {
  const isGoalTemplatesUIEnabled = useFeatureFlag('goalTemplatesUIEnabled');
  const notes = useNotes(category.id) || '';
  const [goalChipVisibility] = useGlobalPref('budgetGoalChipVisibility');
  const effectiveVisibility = goalChipVisibility ?? 'expenses';

  const showGoalChip =
    effectiveVisibility === 'all' ||
    (effectiveVisibility === 'expenses' && !isIncome);

  return (
    <>
      {showGoalChip && (
        <CategoryGoalChip
          categoryId={category.id}
          categoryName={category.name}
          compact
        />
      )}
      <View style={{ flex: 1 }} />
      {!goalsShown && isGoalTemplatesUIEnabled && (
        <View style={{ flexShrink: 0 }}>
          <CategoryAutomationButton
            category={category}
            style={dragging ? { color: 'currentColor' } : undefined}
            defaultColor={theme.pageTextLight}
            showPlaceholder={!!notes}
          />
        </View>
      )}
      <View style={{ flexShrink: 0 }}>
        <NotesButton
          id={category.id}
          style={dragging ? { color: 'currentColor' } : undefined}
          defaultColor={theme.pageTextLight}
          showPlaceholder={
            !goalsShown &&
            isGoalTemplatesUIEnabled &&
            !!category.goal_def?.length
          }
        />
      </View>
    </>
  );
};
