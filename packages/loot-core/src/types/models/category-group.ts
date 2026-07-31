import type { CategoryEntity } from './category';

export type CategoryGroupEntity = {
  id: string;
  name: string;
  is_income?: boolean;
  sort_order?: number;
  tombstone?: boolean;
  hidden?: boolean;
  budget_exempt?: boolean;
  categories?: CategoryEntity[];
  // Envelope engine: true for the system group that holds reserved
  // envelopes (e.g. Unallocated).
  is_reserved?: boolean;
};
