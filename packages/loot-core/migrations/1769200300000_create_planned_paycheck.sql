BEGIN TRANSACTION;

-- A planned/forecast paycheck (or other planned income). Draft editing of
-- a planned paycheck and its allocations never touches real envelope
-- balances -- only `commitPaycheck` does, and only once.
CREATE TABLE planned_paycheck (
  id TEXT PRIMARY KEY,
  status TEXT,
  -- Plain ISO 'YYYY-MM-DD' string (see envelope_ledger.date for why this
  -- doesn't use the AQL 'date' integer-repr type).
  expected_date TEXT,
  expected_amount INTEGER,
  created_at TEXT,
  actual_transaction_id TEXT,
  actual_amount INTEGER,
  commit_shortfall_amount INTEGER,
  commit_suggested_allocations TEXT,
  committed_at TEXT
);

CREATE INDEX idx_planned_paycheck_status ON planned_paycheck (status);
CREATE INDEX idx_planned_paycheck_expected_date ON planned_paycheck (expected_date);

COMMIT;
