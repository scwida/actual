import type { CategoryGroupEntity } from './category-group';

export type CategoryEntity = {
  id: string;
  name: string;
  is_income?: boolean;
  group: CategoryGroupEntity['id'];
  goal_def?: string;
  template_settings?: { source: 'notes' | 'ui' };
  sort_order?: number;
  tombstone?: boolean;
  hidden?: boolean;
  // Envelope engine: true for system-owned, non-deletable envelopes (e.g.
  // the reserved "Unallocated" envelope).
  is_reserved?: boolean;
  reserved_kind?: 'unallocated';
  // Envelope engine: this envelope's current real, stored balance. This is
  // a virtual/computed field (LEFT JOIN onto envelope_balances) -- it is
  // never written directly. Only present when queried through AQL.
  balance?: number;
};
