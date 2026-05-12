import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'paycheck-planner-v1';

export type StoredPaycheck = {
  id: string;
  date: string;
  scott: number;
  katie: number;
  other: number;
};

export type AllocationMap = Record<string, Record<string, number>>;

type PlannerStorageData = {
  paychecks: StoredPaycheck[];
  allocations: AllocationMap;
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
      const parsed = JSON.parse(raw) as PlannerStorageData;
      return {
        paychecks: parsed.paychecks ?? defaultPaychecks(),
        allocations: parsed.allocations ?? {},
      };
    }
  } catch {
    // ignore corrupt storage
  }
  return { paychecks: defaultPaychecks(), allocations: {} };
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

  return {
    paychecks: data.paychecks,
    allocations: data.allocations,
    updateAllocation,
    addPaycheck,
    updatePaycheck,
    deletePaycheck,
  };
}
