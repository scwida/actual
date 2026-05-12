import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import { useGoals } from './useGoals';
import type { CategoryGoal } from './useGoals';

type GoalsContextValue = {
  goals: Record<string, CategoryGoal>;
  setGoal: (goal: CategoryGoal) => void;
  removeGoal: (categoryId: string) => void;
};

const GoalsContext = createContext<GoalsContextValue>({
  goals: {},
  setGoal: _goal => void _goal,
  removeGoal: _id => void _id,
});

export function GoalsProvider({ children }: { children: ReactNode }) {
  const { goals, setGoal, removeGoal } = useGoals();
  return (
    <GoalsContext.Provider value={{ goals, setGoal, removeGoal }}>
      {children}
    </GoalsContext.Provider>
  );
}

export function useGoalsContext(): GoalsContextValue {
  return useContext(GoalsContext);
}
