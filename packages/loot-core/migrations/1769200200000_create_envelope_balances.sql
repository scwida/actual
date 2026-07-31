BEGIN TRANSACTION;

-- Cache of each envelope's current real balance. NOT authoritative -- it
-- must always be rebuildable from `envelope_ledger` via
-- SUM(amount) GROUP BY envelope_id. `id` here IS the envelope id (the
-- category id), matching this codebase's convention for single-row-per-
-- entity cache tables (see e.g. zero_budget_months.id = month).
CREATE TABLE envelope_balances (
  id TEXT PRIMARY KEY,
  balance INTEGER DEFAULT 0,
  updated_at TEXT
);

COMMIT;
