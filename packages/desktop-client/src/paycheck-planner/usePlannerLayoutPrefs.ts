import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'paycheck-planner-v1';

export type CategoryAssignmentMap = Record<string, string>; // categoryId → sectionKey override
export type SectionTitleMap = Record<string, string>; // sectionKey → custom title
export type CategoryOrderMap = Record<string, string[]>; // sectionKey → ordered categoryId array

type PlannerLayoutPrefs = {
  categoryAssignments: CategoryAssignmentMap;
  categoryOrder: CategoryOrderMap;
  sectionTitles: SectionTitleMap;
  sectionOrder: string[]; // ordered list of section keys (excludes 'income' and 'other')
  collapsedSections: string[]; // section keys that are collapsed
};

function loadFromStorage(): PlannerLayoutPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PlannerLayoutPrefs>;
      return {
        categoryAssignments: parsed.categoryAssignments ?? {},
        categoryOrder: parsed.categoryOrder ?? {},
        sectionTitles: parsed.sectionTitles ?? {},
        sectionOrder: parsed.sectionOrder ?? [],
        collapsedSections: parsed.collapsedSections ?? [],
      };
    }
  } catch {
    // ignore corrupt storage
  }
  return {
    categoryAssignments: {},
    categoryOrder: {},
    sectionTitles: {},
    sectionOrder: [],
    collapsedSections: [],
  };
}

function saveToStorage(data: PlannerLayoutPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore quota errors
  }
}

/**
 * Cosmetic, per-device UI layout preferences for the Paycheck Planner --
 * which section a category is displayed under in this UI, category/section
 * display order, custom section titles, and collapsed state.
 *
 * This is intentionally NOT financial data and intentionally stays in
 * localStorage rather than the real envelope-engine backend
 * (`packages/loot-core/src/server/envelopes/`) -- see the scoping decision
 * in the feature-builder task that introduced this split. Planned
 * paychecks and their draft allocations (the actual financial facts) live
 * in `usePlannedPaychecks.ts` instead, backed by the real engine.
 */
export function usePlannerLayoutPrefs() {
  const [data, setData] = useState<PlannerLayoutPrefs>(loadFromStorage);

  useEffect(() => {
    saveToStorage(data);
  }, [data]);

  const updateCategoryOrder = useCallback(
    (sectionKey: string, orderedIds: string[]) => {
      setData(prev => ({
        ...prev,
        categoryOrder: { ...prev.categoryOrder, [sectionKey]: orderedIds },
      }));
    },
    [],
  );

  const updateCategorySection = useCallback(
    (categoryId: string, sectionKey: string) => {
      setData(prev => ({
        ...prev,
        categoryAssignments: {
          ...prev.categoryAssignments,
          [categoryId]: sectionKey,
        },
      }));
    },
    [],
  );

  const updateSectionTitle = useCallback(
    (sectionKey: string, title: string) => {
      setData(prev => ({
        ...prev,
        sectionTitles: {
          ...prev.sectionTitles,
          [sectionKey]: title,
        },
      }));
    },
    [],
  );

  const updateSectionOrder = useCallback((order: string[]) => {
    setData(prev => ({ ...prev, sectionOrder: order }));
  }, []);

  const toggleSectionCollapsed = useCallback((sectionKey: string) => {
    setData(prev => {
      const collapsed = prev.collapsedSections.includes(sectionKey)
        ? prev.collapsedSections.filter(k => k !== sectionKey)
        : [...prev.collapsedSections, sectionKey];
      return { ...prev, collapsedSections: collapsed };
    });
  }, []);

  return {
    categoryAssignments: data.categoryAssignments,
    categoryOrder: data.categoryOrder,
    sectionTitles: data.sectionTitles,
    sectionOrder: data.sectionOrder,
    collapsedSections: data.collapsedSections,
    updateCategoryOrder,
    updateCategorySection,
    updateSectionTitle,
    updateSectionOrder,
    toggleSectionCollapsed,
  };
}
