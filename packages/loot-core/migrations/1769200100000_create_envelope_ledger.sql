BEGIN TRANSACTION;

-- Append-only ledger of every real movement of money into/out of an
-- envelope. There is no tombstone column and rows are never edited in
-- place -- corrections are made with a compensating entry that references
-- the row it reverses via `reverses_id`. `envelope_balances` is a cache
-- that is always rebuildable as SUM(amount) GROUP BY envelope_id from this
-- table.
CREATE TABLE envelope_ledger (
  id TEXT PRIMARY KEY,
  envelope_id TEXT,
  amount INTEGER,
  movement_type TEXT,
  counterparty_kind TEXT,
  counterparty_id TEXT,
  transfer_id TEXT,
  transaction_id TEXT,
  planned_allocation_id TEXT,
  reverses_id TEXT,
  notes TEXT,
  -- Plain ISO 'YYYY-MM-DD' string (unlike transactions.date, this does not
  -- use the AQL 'date' integer-repr type -- kept simple since this table
  -- doesn't need the same date-arithmetic/query optimizations).
  date TEXT,
  created_at TEXT
);

CREATE INDEX idx_envelope_ledger_envelope_id ON envelope_ledger (envelope_id);
CREATE INDEX idx_envelope_ledger_transfer_id ON envelope_ledger (transfer_id);
CREATE INDEX idx_envelope_ledger_transaction_id ON envelope_ledger (transaction_id);
CREATE INDEX idx_envelope_ledger_planned_allocation_id ON envelope_ledger (planned_allocation_id);
CREATE INDEX idx_envelope_ledger_reverses_id ON envelope_ledger (reverses_id);

COMMIT;
