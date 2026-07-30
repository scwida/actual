import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'paycheck-planner-v1';

export type StoredPaycheck = {
  id: string;
  date: string;
  scott: number;
  katie: number;
  other: number;
  holdForFuture?: number; // dollars held back from this paycheck, carried into the next
};

export type AllocationMap = Record<string, Record<string, number>>;
export type CategoryAssignmentMap = Record<string, string>; // categoryId → sectionKey override
export type SectionTitleMap = Record<string, string>; // sectionKey → custom title

export type CategoryOrderMap = Record<string, string[]>; // sectionKey → ordered categoryId array

type PlannerStorageData = {
  paychecks: StoredPaycheck[];
  allocations: AllocationMap;
  categoryAssignments: CategoryAssignmentMap;
  categoryOrder: CategoryOrderMap;
  sectionTitles: SectionTitleMap;
  sectionOrder: string[]; // ordered list of section keys (excludes 'income' and 'other')
  collapsedSections: string[]; // section keys that are collapsed
};

function currentMonthPrefix() {
  return new Date().toISOString().slice(0, 7);
}

function defaultPaychecks(): StoredPaycheck[] {
  const month = currentMonthPrefix();
  return [
    { id: `${month}-p1`, date: `${month}-01`, scott: 0, katie: 0, other: 0 },
  ];
}

function loadFromStorage(): PlannerStorageData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PlannerStorageData>;
      return {
        paychecks: parsed.paychecks ?? defaultPaychecks(),
        allocations: parsed.allocations ?? {},
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
    paychecks: defaultPaychecks(),
    allocations: {},
    categoryAssignments: {},
    categoryOrder: {},
    sectionTitles: {},
    sectionOrder: [],
    collapsedSections: [],
  };
}

function saveToStorage(data: PlannerStorageData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore quota errors
  }
}

export function usePlannerStorage() {
  const [data, setData] = useState<PlannerStorageData>(loadFromStorage);

  useEffect(() => {
    saveToStorage(data);
  }, [data]);

  const updateAllocation = useCallback(
    (paycheckId: string, categoryId: string, dollars: number) => {
      setData(prev => ({
        ...prev,
        allocations: {
          ...prev.allocations,
          [paycheckId]: {
            ...(prev.allocations[paycheckId] ?? {}),
            [categoryId]: dollars,
          },
        },
      }));
    },
    [],
  );

  const addPaycheck = useCallback((paycheck: StoredPaycheck) => {
    setData(prev => ({
      ...prev,
      paychecks: [...prev.paychecks, paycheck],
    }));
  }, []);

  const updatePaycheck = useCallback((updated: StoredPaycheck) => {
    setData(prev => ({
      ...prev,
      paychecks: prev.paychecks.map(p => (p.id === updated.id ? updated : p)),
    }));
  }, []);

  const updateHoldForFuture = useCallback(
    (paycheckId: string, amount: number) => {
      setData(prev => ({
        ...prev,
        paychecks: prev.paychecks.map(p =>
          p.id === paycheckId ? { ...p, holdForFuture: amount } : p,
        ),
      }));
    },
    [],
  );

  const deletePaycheck = useCallback((id: string) => {
    setData(prev => {
      const { [id]: _removed, ...remainingAllocations } = prev.allocations;
      return {
        ...prev,
        paychecks: prev.paychecks.filter(p => p.id !== id),
        allocations: remainingAllocations,
      };
    });
  }, []);

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
    paychecks: data.paychecks,
    allocations: data.allocations,
    categoryAssignments: data.categoryAssignments,
    categoryOrder: data.categoryOrder,
    sectionTitles: data.sectionTitles,
    sectionOrder: data.sectionOrder,
    collapsedSections: data.collapsedSections,
    updateAllocation,
    addPaycheck,
    updatePaycheck,
    deletePaycheck,
    updateHoldForFuture,
    updateCategoryOrder,
    updateCategorySection,
    updateSectionTitle,
    updateSectionOrder,
    toggleSectionCollapsed,
  };
}
