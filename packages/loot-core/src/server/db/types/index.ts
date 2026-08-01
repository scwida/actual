// These are the types that exactly match the database schema.
// The `Entity` types e.g. `TransactionEntity`, `AccountEntity`, etc
// are specific to the AQL query framework and does not necessarily
// match the actual database schema.

type JsonString = string;

export type DbAccount = {
  id: string;
  name: string;
  offbudget: 1 | 0;
  closed: 1 | 0;
  tombstone: 1 | 0;
  sort_order: number;
  account_id?: string | null;
  balance_current?: number | null;
  balance_available?: number | null;
  balance_limit?: number | null;
  mask?: string | null;
  official_name?: string | null;
  type?: string | null;
  subtype?: string | null;
  bank?: string | null;
  account_sync_source?: 'simpleFin' | 'goCardless' | null;
  last_reconciled?: string | null;
  last_sync?: string | null;
};

export type DbBank = {
  id: string;
  bank_id: string;
  name: string;
  tombstone: 1 | 0;
};

export type DbCategory = {
  id: string;
  name: string;
  is_income: 1 | 0;
  cat_group: DbCategoryGroup['id'];
  sort_order: number;
  hidden: 1 | 0;
  goal_def?: JsonString | null;
  template_settings?: { source: 'notes' | 'ui' };
  tombstone: 1 | 0;
  // Envelope engine: marks system-owned, non-deletable rows (e.g. the
  // reserved "Unallocated" envelope) and identifies which reserved
  // envelope this is. Optional (defaults to 0/null at the DB level) so
  // this stays additive for all existing call sites.
  is_reserved?: 1 | 0;
  reserved_kind?: 'unallocated' | null;
};

export type DbCategoryGroup = {
  id: string;
  name: string;
  is_income: 1 | 0;
  sort_order: number;
  hidden: 1 | 0;
  budget_exempt: 1 | 0;
  tombstone: 1 | 0;
  // Envelope engine: marks the system group that holds reserved
  // envelopes. Optional (defaults to 0 at the DB level) so this stays
  // additive for all existing call sites.
  is_reserved?: 1 | 0;
};

export type DbCategoryMapping = {
  id: DbCategory['id'];
  transferId: DbCategory['id'];
};

export type DbKvCache = {
  key: string;
  value: string;
};

export type DbKvCacheKey = {
  id: number;
  key: number;
};

export type DbClockMessage = {
  id: string;
  clock: string;
};

export type DbCrdtMessage = {
  id: string;
  timestamp: string;
  dataset: string;
  row: string;
  column: string;
  value: Uint8Array;
};

export type DbNote = {
  id: string;
  note: string;
};

export type DbPayeeMapping = {
  id: DbPayee['id'];
  targetId: DbPayee['id'];
};

export type DbPayee = {
  id: string;
  name: string;
  transfer_acct?: DbAccount['id'] | null;
  favorite: 1 | 0;
  learn_categories: 1 | 0;
  tombstone: 1 | 0;
  // Unused in the codebase
  category?: string | null;
};

export type DbRule = {
  id: string;
  stage: string;
  conditions: JsonString;
  actions: JsonString;
  tombstone: 1 | 0;
  conditions_op: string;
};

export type DbSchedule = {
  id: string;
  name: string;
  rule: DbRule['id'];
  active: 1 | 0;
  completed: 1 | 0;
  posts_transaction: 1 | 0;
  custom_upcoming_length: string | null;
  tombstone: 1 | 0;
};

// type DbScheduleJsonPath = {
//   schedule_id: DbSchedule['id'];
//   payee: string;
//   account: string;
//   amount: string;
//   date: string;
// };

export type DbScheduleNextDate = {
  id: string;
  schedule_id: DbSchedule['id'];
  local_next_date: number;
  local_next_date_ts: number;
  base_next_date: number;
  base_next_date_ts: number;
};

// This is unused in the codebase.
// type DbPendingTransaction = {
//   id: string;
//   acct: number;
//   amount: number;
//   description: string;
//   date: string;
// };

export type DbTransaction = {
  id: string;
  isParent: 1 | 0;
  isChild: 1 | 0;
  date: number;
  acct: DbAccount['id'];
  amount: number;
  sort_order: number;
  parent_id?: DbTransaction['id'] | null;
  category?: DbCategory['id'] | null;
  description?: string | null;
  notes?: string | null;
  financial_id?: string | null;
  error?: string | null;
  imported_description?: string | null;
  transferred_id?: DbTransaction['id'] | null;
  schedule?: DbSchedule['id'] | null;
  starting_balance_flag: 1 | 0;
  tombstone: 1 | 0;
  cleared: 1 | 0;
  reconciled: 1 | 0;
  // Unused in the codebase
  pending?: 1 | 0 | null;
  location?: string | null;
  type?: string | null;
};

export type DbReflectBudget = {
  id: string;
  month: number;
  category: string;
  amount: number;
  carryover: number;
  goal: number;
  long_goal: number;
};

export type DbZeroBudgetMonth = {
  id: string;
  buffered: number;
};

export type DbZeroBudget = {
  id: string;
  month: number;
  category: string;
  amount: number;
  carryover: number;
  goal: number;
  long_goal: number;
};

export type DbTransactionFilter = {
  id: string;
  name: string;
  conditions: JsonString;
  conditions_op: string;
  tombstone: 1 | 0;
};

export type DbPreference = {
  id: string;
  value: string;
};

export type DbCustomReport = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  date_static: number;
  date_range: string;
  mode: string;
  group_by: string;
  balance_type: string;
  show_empty: 1 | 0;
  show_offbudget: 1 | 0;
  show_hidden: 1 | 0;
  show_uncategorized: 1 | 0;
  selected_categories: string;
  graph_type: string;
  conditions: JsonString;
  conditions_op: string;
  metadata: JsonString;
  interval: string;
  color_scheme: string;
  include_current: 1 | 0;
  sort_by: string;
  tombstone: 1 | 0;
};

export type DbDashboardPage = {
  id: string;
  name: string;
  tombstone: 1 | 0;
};

export type DbDashboard = {
  id: string;
  dashboard_page_id: string;
  type: string;
  width: number;
  height: number;
  x: number;
  y: number;
  meta: JsonString;
  tombstone: 1 | 0;
};

export type DbViewTransactionInternal = {
  id: DbTransaction['id'];
  is_parent: DbTransaction['isParent'];
  is_child: DbTransaction['isChild'];
  date: DbTransaction['date'];
  account: DbAccount['id'];
  amount: DbTransaction['amount'];
  parent_id: DbTransaction['parent_id'] | null;
  category: DbCategory['id'] | null;
  payee: DbPayee['id'] | null;
  notes: DbTransaction['notes'] | null;
  imported_id: DbTransaction['financial_id'] | null;
  error: DbTransaction['error'] | null;
  imported_payee: DbTransaction['imported_description'] | null;
  starting_balance_flag: DbTransaction['starting_balance_flag'] | null;
  transfer_id: DbTransaction['transferred_id'] | null;
  schedule: DbSchedule['id'] | null;
  sort_order: DbTransaction['sort_order'];
  cleared: DbTransaction['cleared'];
  tombstone: DbTransaction['tombstone'];
  reconciled: DbTransaction['reconciled'];
};

export type DbViewTransactionInternalAlive = DbViewTransactionInternal;
export type DbViewTransaction = DbViewTransactionInternalAlive;

export type DbViewCategory = {
  id: DbCategory['id'];
  name: DbCategory['name'];
  is_income: DbCategory['is_income'];
  hidden: DbCategory['hidden'];
  group: DbCategoryGroup['id'];
  sort_order: DbCategory['sort_order'];
  tombstone: DbCategory['tombstone'];
};

export type DbViewCategoryWithGroupHidden = {
  id: DbCategory['id'];
  name: DbCategory['name'];
  is_income: DbCategory['is_income'];
  hidden: DbCategory['hidden'];
  group: DbCategoryGroup['id'];
  group_hidden: DbCategoryGroup['hidden'];
  group_budget_exempt: DbCategoryGroup['budget_exempt'];
  sort_order: DbCategory['sort_order'];
  tombstone: DbCategory['tombstone'];
};

export type DbViewPayee = {
  id: DbPayee['id'];
  name: DbAccount['name'] | DbPayee['name'];
  transfer_acct: DbPayee['transfer_acct'];
  tombstone: DbPayee['tombstone'];
};

export type DbViewSchedule = {
  id: DbSchedule['id'];
  name: DbSchedule['name'];
  rule: DbSchedule['rule'];
  next_date:
    | DbScheduleNextDate['local_next_date_ts']
    | DbScheduleNextDate['local_next_date']
    | DbScheduleNextDate['base_next_date'];
  active: DbSchedule['active'];
  completed: DbSchedule['completed'];
  posts_transaction: DbSchedule['posts_transaction'];
  custom_upcoming_length: DbSchedule['custom_upcoming_length'];
  tombstone: DbSchedule['tombstone'];
  _payee: DbPayeeMapping['targetId'];
  _account: DbAccount['id'];
  _amount: number;
  _amountOp: string;
  _date: JsonString;
  _conditions: JsonString;
  _actions: JsonString;
};

export type DbTag = {
  id: string;
  tag: string;
  color?: string | null;
  description?: string | null;
  tombstone: 1 | 0;
};

// Envelope engine (real-balance envelopes) --------------------------------

export type DbEnvelopeMovementType = 'fund' | 'spend' | 'transfer';
export type DbEnvelopeCounterpartyKind = 'account' | 'envelope';

export type DbEnvelopeLedger = {
  id: string;
  envelope_id: DbCategory['id'];
  amount: number;
  movement_type: DbEnvelopeMovementType;
  counterparty_kind?: DbEnvelopeCounterpartyKind | null;
  counterparty_id?: string | null;
  transfer_id?: string | null;
  transaction_id?: string | null;
  planned_allocation_id?: string | null;
  reverses_id?: string | null;
  notes?: string | null;
  date: string;
  created_at: string;
};

export type DbEnvelopeBalance = {
  // This is the envelope (category) id.
  id: DbCategory['id'];
  balance: number;
  updated_at: string;
};

export type DbPlannedPaycheckStatus = 'draft' | 'committed' | 'canceled';

export type DbPlannedPaycheck = {
  id: string;
  status: DbPlannedPaycheckStatus;
  expected_date: string;
  expected_amount: number;
  created_at: string;
  actual_transaction_id?: string | null;
  actual_amount?: number | null;
  commit_shortfall_amount?: number | null;
  // JSON-serialized Record<CategoryEntity['id'], IntegerAmount>
  commit_suggested_allocations?: JsonString | null;
  committed_at?: string | null;
};

export type DbPlannedAllocation = {
  id: string;
  planned_paycheck_id: DbPlannedPaycheck['id'];
  envelope_id: DbCategory['id'];
  amount: number;
  envelope_balance_at_draft: number;
  drafted_at: string;
  suggested_amount?: number | null;
  approved_amount?: number | null;
  tombstone: 1 | 0;
};

export type DbEnvelopeGoalType = 'recurring' | 'dated';
export type DbEnvelopeCadenceType =
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'annual'
  | 'custom';

// One row per envelope (id = the envelope/category id) -- see
// migrations/1769200500000_create_envelope_goal.sql for why "no goal" has
// no row here (or a tombstoned one) rather than a literal 'none'
// `goal_type` value.
export type DbEnvelopeGoal = {
  id: DbCategory['id'];
  goal_type: DbEnvelopeGoalType;
  target_amount: number;
  cadence_type: DbEnvelopeCadenceType;
  // Only set when cadence_type === 'custom'.
  cadence_custom_days?: number | null;
  // Only set for a 'dated' goal. Plain ISO 'YYYY-MM-DD' string.
  target_date?: string | null;
  created_at: string;
  updated_at: string;
  tombstone: 1 | 0;
};
