import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { send } from '@actual-app/core/platform/client/connection';
import * as monthUtils from '@actual-app/core/shared/months';
import { groupById } from '@actual-app/core/shared/util';
import type { IntegerAmount } from '@actual-app/core/shared/util';
import type {
  CategoryEntity,
  CategoryGroupEntity,
  NegativeBalanceWarning,
  TransferMovementRequest,
} from '@actual-app/core/types/models';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { v4 as uuidv4 } from 'uuid';

import type { UseFormatResult } from '#hooks/useFormat';
import { useFormat } from '#hooks/useFormat';
import { useUnallocatedEnvelopeId } from '#hooks/useUnallocatedEnvelope';
import { pushModal } from '#modals/modalsSlice';
import { addNotification } from '#notifications/notificationsSlice';
import { useDispatch } from '#redux';
import type { AppDispatch } from '#redux/store';

import {
  applyEnvelopeMovement,
  previewEnvelopeMovement,
} from './envelopeMovements';
import { categoryQueries } from './queries';

// Note: deliberately importing `categoryQueries` from the sibling
// `./queries` module (not `useCategoriesById` from `#hooks/useCategories`)
// -- that hook imports `categoryQueries` from the `#budget` barrel, which
// re-exports this very file, and would form an import cycle.

/**
 * The reserved "Unallocated" envelope's well-known pseudo-id used
 * throughout the old budget-summary UI (`addToBeBudgetedGroup` in
 * `#components/budget/util`) to represent "the overall pool of unassigned
 * money" as a selectable category-picker option. Under the real-balance
 * engine that pool IS a real envelope (Unallocated, see
 * `#hooks/useUnallocatedEnvelope`), so any occurrence of this sentinel
 * coming back from a picker is translated to the real envelope id before
 * building a movement request.
 */
const TO_BUDGET_PSEUDO_CATEGORY_ID = 'to-budget';

/**
 * Applies a real envelope-to-envelope transfer (CLAUDE.md "How money
 * moves" #3) for one of the budget table's quick-fund/transfer/cover
 * actions, and surfaces a gentle, dismissible nudge -- never a block --
 * for any envelope the transfer would leave negative (CLAUDE.md "Envelope
 * rules"). Previews first so the nudge can be built before the movement
 * lands, then always applies regardless of what the preview found.
 */
async function applyEnvelopeTransfer({
  request,
  dispatch,
  t,
  format,
  categoriesById,
  unallocatedId,
}: {
  request: TransferMovementRequest;
  dispatch: AppDispatch;
  t: TFunction;
  format: UseFormatResult;
  categoriesById: Record<string, CategoryEntity>;
  unallocatedId: CategoryEntity['id'] | null;
}): Promise<void> {
  const envelopeName = (id: CategoryEntity['id']): string =>
    id === unallocatedId ? t('Unallocated') : (categoriesById[id]?.name ?? id);

  const { warnings } = await previewEnvelopeMovement(request);
  // Never block on a negative-balance warning -- only ever a dismissible
  // nudge (CLAUDE.md "Envelope rules"). Apply unconditionally.
  await applyEnvelopeMovement(request);

  for (const warning of warnings) {
    dispatch(
      addNotification({
        notification: {
          type: 'warning',
          message: buildNegativeBalanceNudgeMessage({
            warning,
            t,
            format,
            envelopeName,
          }),
        },
      }),
    );
  }
}

function buildNegativeBalanceNudgeMessage({
  warning,
  t,
  format,
  envelopeName,
}: {
  warning: NegativeBalanceWarning;
  t: TFunction;
  format: UseFormatResult;
  envelopeName: (id: CategoryEntity['id']) => string;
}): string {
  const suggestion = warning.suggestedCover;
  const negativeAmount = format(
    Math.abs(warning.resultingBalance),
    'financial',
  );

  if (suggestion && 'envelope' in suggestion.source) {
    return t(
      '{{envelope}} is now {{amount}} negative. Consider covering it from {{source}} ({{coverAmount}}).',
      {
        envelope: envelopeName(warning.envelope),
        amount: negativeAmount,
        source: envelopeName(suggestion.source.envelope),
        coverAmount: format(suggestion.amount, 'financial'),
      },
    );
  }

  return t('{{envelope}} is now {{amount}} negative.', {
    envelope: envelopeName(warning.envelope),
    amount: negativeAmount,
  });
}

function invalidateQueries(queryClient: QueryClient, queryKey?: QueryKey) {
  void queryClient.invalidateQueries({
    queryKey: queryKey ?? categoryQueries.lists(),
  });
}

function dispatchErrorNotification(
  dispatch: AppDispatch,
  message: string,
  error?: Error,
) {
  dispatch(
    addNotification({
      notification: {
        id: uuidv4(),
        type: 'error',
        message,
        pre: error ? error.message : undefined,
      },
    }),
  );
}

function dispatchCategoryNameAlreadyExistsNotification(
  dispatch: AppDispatch,
  t: TFunction,
  name: CategoryEntity['name'],
) {
  dispatch(
    addNotification({
      notification: {
        type: 'error',
        message: t(
          'Category "{{name}}" already exists in group (it may be hidden)',
          { name },
        ),
      },
    }),
  );
}

type CreateCategoryPayload = {
  name: CategoryEntity['name'];
  groupId: CategoryGroupEntity['id'];
  isIncome: boolean;
  isHidden: boolean;
};

export function useCreateCategoryMutation() {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({
      name,
      groupId,
      isIncome,
      isHidden,
    }: CreateCategoryPayload) => {
      const id = await send('category-create', {
        name,
        groupId,
        isIncome,
        hidden: isHidden,
      });
      return id;
    },
    onSuccess: () => invalidateQueries(queryClient),
    onError: error => {
      console.error('Error creating category:', error);
      dispatchErrorNotification(
        dispatch,
        t('There was an error creating the category. Please try again.'),
        error,
      );
    },
  });
}

type UpdateCategoryPayload = {
  category: CategoryEntity;
};

export function useUpdateCategoryMutation() {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({ category }: UpdateCategoryPayload) => {
      await send('category-update', category);
    },
    onSuccess: () => invalidateQueries(queryClient),
    onError: error => {
      console.error('Error updating category:', error);
      dispatchErrorNotification(
        dispatch,
        t('There was an error updating the category. Please try again.'),
        error,
      );
    },
  });
}

type SaveCategoryPayload = {
  category: CategoryEntity;
};

export function useSaveCategoryMutation() {
  const createCategory = useCreateCategoryMutation();
  const updateCategory = useUpdateCategoryMutation();
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ category }: SaveCategoryPayload) => {
      const { grouped: categoryGroups = [] } =
        await queryClient.ensureQueryData(categoryQueries.list());

      const group = categoryGroups.find(g => g.id === category.group);
      const categoriesInGroup = group?.categories ?? [];
      const exists = categoriesInGroup.some(
        c =>
          c.id !== category.id &&
          c.name.toUpperCase() === category.name.toUpperCase(),
      );

      if (exists) {
        dispatchCategoryNameAlreadyExistsNotification(
          dispatch,
          t,
          category.name,
        );
        return;
      }

      if (category.id === 'new') {
        await createCategory.mutateAsync({
          name: category.name,
          groupId: category.group,
          isIncome: !!category.is_income,
          isHidden: !!category.hidden,
        });
      } else {
        await updateCategory.mutateAsync({ category });
      }
    },
  });
}

type DeleteCategoryPayload = {
  id: CategoryEntity['id'];
};

export function useDeleteCategoryMutation() {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const { t } = useTranslation();

  const deleteCategory = async ({
    id,
    transferId,
  }: {
    id: CategoryEntity['id'];
    transferId?: CategoryEntity['id'];
  }) => {
    await send('category-delete', { id, transferId });
  };

  return useMutation({
    mutationFn: async ({ id }: DeleteCategoryPayload) => {
      const mustTransfer = await send('must-category-transfer', { id });

      if (mustTransfer) {
        dispatch(
          pushModal({
            modal: {
              name: 'confirm-category-delete',
              options: {
                category: id,
                onDelete: async transferCategory => {
                  if (id !== transferCategory) {
                    await deleteCategory({ id, transferId: transferCategory });
                  }
                },
              },
            },
          }),
        );
      } else {
        await deleteCategory({ id });
      }
    },
    onSuccess: () => invalidateQueries(queryClient),
    onError: error => {
      console.error('Error deleting category:', error);
      dispatchErrorNotification(
        dispatch,
        t('There was an error deleting the category. Please try again.'),
        error,
      );
    },
  });
}

type MoveCategoryPayload = {
  id: CategoryEntity['id'];
  groupId: CategoryGroupEntity['id'];
  targetId: CategoryEntity['id'] | null;
};

export function useMoveCategoryMutation() {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({ id, groupId, targetId }: MoveCategoryPayload) => {
      await send('category-move', { id, groupId, targetId });
    },
    onSuccess: () => invalidateQueries(queryClient),
    onError: error => {
      console.error('Error moving category:', error);
      dispatchErrorNotification(
        dispatch,
        t('There was an error moving the category. Please try again.'),
        error,
      );
    },
  });
}

type ReoderCategoryPayload = {
  id: CategoryEntity['id'];
  groupId: CategoryGroupEntity['id'];
  targetId: CategoryEntity['id'] | null;
};

export function useReorderCategoryMutation() {
  const moveCategory = useMoveCategoryMutation();
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({ id, groupId, targetId }: ReoderCategoryPayload) => {
      const { grouped: categoryGroups = [], list: categories = [] } =
        await queryClient.ensureQueryData(categoryQueries.list());

      const moveCandidate = categories.filter(c => c.id === id)[0];
      const group = categoryGroups.find(g => g.id === groupId);
      const categoriesInGroup = group?.categories ?? [];
      const exists = categoriesInGroup.some(
        c =>
          c.id !== moveCandidate.id &&
          c.name.toUpperCase() === moveCandidate.name.toUpperCase(),
      );

      if (exists) {
        dispatchCategoryNameAlreadyExistsNotification(
          dispatch,
          t,
          moveCandidate.name,
        );
        return;
      }

      await moveCategory.mutateAsync({ id, groupId, targetId });
    },
  });
}

type CreateCategoryGroupPayload = {
  name: CategoryGroupEntity['name'];
};

export function useCreateCategoryGroupMutation() {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({ name }: CreateCategoryGroupPayload) => {
      const id = await send('category-group-create', { name });
      return id;
    },
    onSuccess: () => invalidateQueries(queryClient),
    onError: error => {
      console.error('Error creating category group:', error);
      dispatchErrorNotification(
        dispatch,
        t('There was an error creating the category group. Please try again.'),
        error,
      );
    },
  });
}

type UpdateCategoryGroupPayload = {
  group: CategoryGroupEntity;
};

export function useUpdateCategoryGroupMutation() {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async ({ group }: UpdateCategoryGroupPayload) => {
      const { grouped: categoryGroups } = await queryClient.ensureQueryData(
        categoryQueries.list(),
      );

      const exists = categoryGroups.some(
        g =>
          g.id !== group.id &&
          g.name.toUpperCase() === group.name.toUpperCase(),
      );

      if (exists) {
        dispatchErrorNotification(
          dispatch,
          t('A category group with name "{{name}}" already exists.', {
            name: group.name,
          }),
        );
        return;
      }

      // Strip off the categories field if it exist. It's not a real db
      // field but groups have this extra field in the client most of the time
      const { categories: _, ...groupNoCategories } = group;
      await send('category-group-update', groupNoCategories);
    },
    onSuccess: () => invalidateQueries(queryClient),
    onError: error => {
      console.error('Error updating category group:', error);
      dispatchErrorNotification(
        dispatch,
        t('There was an error updating the category group. Please try again.'),
        error,
      );
    },
  });
}

type SaveCategoryGroupPayload = {
  group: CategoryGroupEntity;
};

export function useSaveCategoryGroupMutation() {
  const createCategoryGroup = useCreateCategoryGroupMutation();
  const updateCategoryGroup = useUpdateCategoryGroupMutation();

  return useMutation({
    mutationFn: async ({ group }: SaveCategoryGroupPayload) => {
      if (group.id === 'new') {
        await createCategoryGroup.mutateAsync({ name: group.name });
      } else {
        await updateCategoryGroup.mutateAsync({ group });
      }
    },
  });
}

type DeleteCategoryGroupPayload = {
  id: CategoryGroupEntity['id'];
};

export function useDeleteCategoryGroupMutation() {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({ id }: DeleteCategoryGroupPayload) => {
      const { grouped: categoryGroups } = await queryClient.ensureQueryData(
        categoryQueries.list(),
      );
      const group = categoryGroups.find(g => g.id === id);

      if (!group) {
        return;
      }

      const categories = group.categories ?? [];

      let mustTransfer = false;
      for (const category of categories) {
        if (await send('must-category-transfer', { id: category.id })) {
          mustTransfer = true;
          break;
        }
      }

      if (mustTransfer) {
        dispatch(
          pushModal({
            modal: {
              name: 'confirm-category-delete',
              options: {
                group: id,
                onDelete: async transferCategory => {
                  await send('category-group-delete', {
                    id,
                    transferId: transferCategory,
                  });
                },
              },
            },
          }),
        );
      } else {
        await send('category-group-delete', { id });
      }
    },
    onSuccess: () => invalidateQueries(queryClient),
    onError: error => {
      console.error('Error deleting category group:', error);
      dispatchErrorNotification(
        dispatch,
        t('There was an error deleting the category group. Please try again.'),
        error,
      );
    },
  });
}

type MoveCategoryGroupPayload = {
  id: CategoryGroupEntity['id'];
  targetId: CategoryGroupEntity['id'] | null;
};

export function useMoveCategoryGroupMutation() {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({ id, targetId }: MoveCategoryGroupPayload) => {
      await send('category-group-move', { id, targetId });
    },
    onSuccess: () => invalidateQueries(queryClient),
    onError: error => {
      console.error('Error moving category group:', error);
      dispatchErrorNotification(
        dispatch,
        t('There was an error moving the category group. Please try again.'),
        error,
      );
    },
  });
}

type ReorderCategoryGroupPayload = {
  id: CategoryGroupEntity['id'];
  targetId: CategoryGroupEntity['id'] | null;
};

export function useReorderCategoryGroupMutation() {
  const moveCategoryGroup = useMoveCategoryGroupMutation();

  return useMutation({
    mutationFn: async (sortInfo: ReorderCategoryGroupPayload) => {
      await moveCategoryGroup.mutateAsync({
        id: sortInfo.id,
        targetId: sortInfo.targetId,
      });
    },
  });
}

type ApplyBudgetActionPayload =
  | {
      type: 'budget-amount';
      month: string;
      args: {
        category: CategoryEntity['id'];
        amount: number;
      };
    }
  | {
      type: 'copy-last';
      month: string;
      args?: never;
    }
  | {
      type: 'set-zero';
      month: string;
      args?: never;
    }
  | {
      type: 'set-3-avg';
      month: string;
      args?: never;
    }
  | {
      type: 'set-6-avg';
      month: string;
      args?: never;
    }
  | {
      type: 'set-12-avg';
      month: string;
      args?: never;
    }
  | {
      type: 'check-templates';
      month?: never;
      args?: never;
    }
  | {
      type: 'apply-goal-template';
      month: string;
      args?: never;
    }
  | {
      type: 'overwrite-goal-template';
      month: string;
      args?: never;
    }
  | {
      type: 'cleanup-goal-template';
      month: string;
      args?: never;
    }
  | {
      type: 'hold';
      month: string;
      args: {
        amount: number;
      };
    }
  | {
      type: 'reset-hold';
      month: string;
      args?: never;
    }
  | {
      type: 'cover-overspending';
      month: string;
      args: {
        to: CategoryEntity['id'];
        from: CategoryEntity['id'];
        amount?: IntegerAmount;
        currencyCode: string;
      };
    }
  | {
      type: 'transfer-available';
      month: string;
      args: {
        amount: number;
        category: CategoryEntity['id'];
      };
    }
  | {
      type: 'cover-overbudgeted';
      month: string;
      args: {
        category: CategoryEntity['id'];
        amount?: IntegerAmount;
        currencyCode: string;
      };
    }
  | {
      type: 'transfer-category';
      month: string;
      args: {
        amount: number;
        from: CategoryEntity['id'];
        to: CategoryEntity['id'];
        currencyCode: string;
      };
    }
  | {
      type: 'carryover';
      month: string;
      args: {
        category: CategoryEntity['id'];
        flag: boolean;
      };
    }
  | {
      type: 'reset-income-carryover';
      month: string;
      args?: never;
    }
  | {
      type: 'apply-single-category-template';
      month: string;
      args: {
        category: CategoryEntity['id'];
      };
    }
  | {
      type: 'apply-multiple-templates';
      month: string;
      args: {
        categories: Array<CategoryEntity['id']>;
      };
    }
  | {
      type: 'set-single-3-avg';
      month: string;
      args: {
        category: CategoryEntity['id'];
      };
    }
  | {
      type: 'set-single-6-avg';
      month: string;
      args: {
        category: CategoryEntity['id'];
      };
    }
  | {
      type: 'set-single-12-avg';
      month: string;
      args: {
        category: CategoryEntity['id'];
      };
    }
  | {
      type: 'copy-single-last';
      month: string;
      args: {
        category: CategoryEntity['id'];
      };
    }
  | {
      type: 'copy-until-year-end';
      month: string;
      args: {
        category: CategoryEntity['id'];
      };
    };

export function useBudgetActions() {
  const dispatch = useDispatch();
  const { t } = useTranslation();
  const format = useFormat();
  const { id: unallocatedId } = useUnallocatedEnvelopeId();
  const { data: { list: categories } = { list: [] as CategoryEntity[] } } =
    useQuery(categoryQueries.list());
  const categoriesById = useMemo(() => groupById(categories), [categories]);

  const requireUnallocatedId = (): CategoryEntity['id'] | null => {
    if (!unallocatedId) {
      dispatchErrorNotification(
        dispatch,
        t('Could not find the Unallocated envelope. Please try again.'),
      );
    }
    return unallocatedId;
  };

  return useMutation({
    mutationFn: async ({ month, type, args }: ApplyBudgetActionPayload) => {
      switch (type) {
        case 'budget-amount': {
          // The quick-fund cell (CLAUDE.md "The budget table's allocation
          // cell") is a one-shot transfer from Unallocated into this
          // envelope, not a persistent monthly target -- unlike the old
          // `budget/budget-amount` handler, there's no stored target left
          // to reset for a zero/blank amount, so there's simply nothing
          // to move.
          if (args.amount <= 0) {
            return null;
          }
          const from = requireUnallocatedId();
          if (!from) {
            return null;
          }
          await applyEnvelopeTransfer({
            request: {
              type: 'transfer',
              from,
              to: args.category,
              amount: args.amount,
              date: monthUtils.currentDay(),
            },
            dispatch,
            t,
            format,
            categoriesById,
            unallocatedId,
          });
          return null;
        }
        case 'copy-last':
          await send('budget/copy-previous-month', { month });
          return null;
        case 'set-zero':
          await send('budget/set-zero', { month });
          return null;
        case 'set-3-avg':
          await send('budget/set-3month-avg', { month });
          return null;
        case 'set-6-avg':
          await send('budget/set-6month-avg', { month });
          return null;
        case 'set-12-avg':
          await send('budget/set-12month-avg', { month });
          return null;
        case 'check-templates':
          return await send('budget/check-templates');
        case 'apply-goal-template':
          return await send('budget/apply-goal-template', { month });
        case 'overwrite-goal-template':
          return await send('budget/overwrite-goal-template', { month });
        case 'apply-single-category-template':
          return await send('budget/apply-single-template', {
            month,
            category: args.category,
          });
        case 'cleanup-goal-template':
          return await send('budget/cleanup-goal-template', { month });
        case 'hold':
          await send('budget/hold-for-next-month', {
            month,
            amount: args.amount,
          });
          return null;
        case 'reset-hold':
          await send('budget/reset-hold', { month });
          return null;
        case 'cover-overspending': {
          // Fixes a negative envelope by transferring in from another
          // envelope (CLAUDE.md "Envelope rules" cover-suggestion policy).
          // `from` may still be the old UI's "To Budget" pseudo-category
          // (see `addToBeBudgetedGroup` in `#components/budget/util`) --
          // translate it to the real Unallocated envelope it now stands
          // for.
          if (!args.amount || args.amount <= 0) {
            return null;
          }
          const unallocated = requireUnallocatedId();
          if (!unallocated) {
            return null;
          }
          const from =
            args.from === TO_BUDGET_PSEUDO_CATEGORY_ID
              ? unallocated
              : args.from;
          await applyEnvelopeTransfer({
            request: {
              type: 'transfer',
              from,
              to: args.to,
              amount: args.amount,
              date: monthUtils.currentDay(),
            },
            dispatch,
            t,
            format,
            categoriesById,
            unallocatedId,
          });
          return null;
        }
        case 'transfer-available': {
          // "Transfer available funds" in the old to-be-budgeted model is
          // now just a transfer out of the real Unallocated envelope
          // (CLAUDE.md "How money moves" #3).
          if (args.amount <= 0) {
            return null;
          }
          const from = requireUnallocatedId();
          if (!from) {
            return null;
          }
          await applyEnvelopeTransfer({
            request: {
              type: 'transfer',
              from,
              to: args.category,
              amount: args.amount,
              date: monthUtils.currentDay(),
            },
            dispatch,
            t,
            format,
            categoriesById,
            unallocatedId,
          });
          return null;
        }
        case 'cover-overbudgeted': {
          // Fixes a negative Unallocated balance (the new model's
          // equivalent of the old "overbudgeted to-budget pool") by
          // transferring in from the chosen category.
          if (!args.amount || args.amount <= 0) {
            return null;
          }
          const to = requireUnallocatedId();
          if (!to) {
            return null;
          }
          await applyEnvelopeTransfer({
            request: {
              type: 'transfer',
              from: args.category,
              to,
              amount: args.amount,
              date: monthUtils.currentDay(),
            },
            dispatch,
            t,
            format,
            categoriesById,
            unallocatedId,
          });
          return null;
        }
        case 'transfer-category':
          // NOT migrated to the envelope engine -- out of scope for this
          // change (a plain envelope-to-envelope transfer between two
          // user-chosen categories, not involving Unallocated). Still
          // writes through the old formula engine's `zero_budgets` table
          // via `actions.transferCategory`. Flagged for a follow-up, not
          // fixed here.
          await send('budget/transfer-category', {
            month,
            amount: args.amount,
            from: args.from,
            to: args.to,
            currencyCode: args.currencyCode,
          });
          return null;
        case 'carryover': {
          await send('budget/set-carryover', {
            startMonth: month,
            category: args.category,
            flag: args.flag,
          });
          return null;
        }
        case 'reset-income-carryover':
          await send('budget/reset-income-carryover', { month });
          return null;
        case 'apply-multiple-templates':
          return await send('budget/apply-multiple-templates', {
            month,
            categoryIds: args.categories,
          });
        case 'set-single-3-avg':
          await send('budget/set-n-month-avg', {
            month,
            N: 3,
            category: args.category,
          });
          return null;
        case 'set-single-6-avg':
          await send('budget/set-n-month-avg', {
            month,
            N: 6,
            category: args.category,
          });
          return null;
        case 'set-single-12-avg':
          await send('budget/set-n-month-avg', {
            month,
            N: 12,
            category: args.category,
          });
          return null;
        case 'copy-single-last':
          await send('budget/copy-single-month', {
            month,
            category: args.category,
          });
          return null;
        case 'copy-until-year-end':
          await send('budget/copy-until-year-end', {
            month,
            category: args.category,
          });
          return null;
        default:
          throw new Error(`Unknown budget action type: ${String(type)}`);
      }
    },
    onSuccess: notification => {
      if (notification) {
        dispatch(
          addNotification({
            notification,
          }),
        );
      }
    },
    onError: error => {
      console.error('Error applying budget action:', error);
      dispatchErrorNotification(
        dispatch,
        t('There was an error applying the budget action. Please try again.'),
        error,
      );
    },
  });
}
