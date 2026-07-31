BEGIN TRANSACTION;

-- A single envelope's draft allocation within a planned paycheck. Rows
-- are editable/removable while the parent paycheck is a draft (hence a
-- tombstone column, unlike the append-only envelope_ledger). Once the
-- parent paycheck commits, `suggested_amount`/`approved_amount` capture
-- what was actually reviewed and applied, for audit purposes.
CREATE TABLE planned_allocation (
  id TEXT PRIMARY KEY,
  planned_paycheck_id TEXT,
  envelope_id TEXT,
  amount INTEGER,
  envelope_balance_at_draft INTEGER,
  drafted_at TEXT,
  suggested_amount INTEGER,
  approved_amount INTEGER,
  tombstone BOOLEAN DEFAULT 0
);

CREATE INDEX idx_planned_allocation_paycheck_id ON planned_allocation (planned_paycheck_id);
CREATE INDEX idx_planned_allocation_envelope_id ON planned_allocation (envelope_id);

COMMIT;
