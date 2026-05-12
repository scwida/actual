import { useCallback, useEffect, useState } from 'react';

const GOALS_KEY = 'budget-goals-v1';

export type GoalType =
  | 'monthly-contribution'
  | 'needed-for-spending'
  | 'savings-balance'
  | 'debt-payoff';

export type CategoryGoal = {
  categoryId: string;
  type: GoalType;
  amount: number;
  /** Day of month (1–31) the expense is due — for needed-for-spending and debt-payoff */
  dayOfMonth?: number;
  /** Target date (YYYY-MM-DD) to reach the savings balance */
  targetDate?: string;
};

function load(): Record<string, CategoryGoal> {
  try {
    const raw = localStorage.getItem(GOALS_KEY);
    if (raw) return JSON.parse(raw) as Record<string, CategoryGoal>;
  } catch {
    // ignore corrupt storage
  }
  return {};
}

function save(goals: Record<string, CategoryGoal>) {
  try {
    localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
  } catch {
    // ignore quota errors
  }
}

export function useGoals() {
  const [goals, setGoals] = useState<Record<string, CategoryGoal>>(load);

  useEffect(() => {
    save(goals);
  }, [goals]);

  const setGoal = useCallback((goal: CategoryGoal) => {
    setGoals(prev => ({ ...prev, [goal.categoryId]: goal }));
  }, []);

  const removeGoal = useCallback((categoryId: string) => {
    setGoals(prev => {
      const { [categoryId]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  return { goals, setGoal, removeGoal };
}
