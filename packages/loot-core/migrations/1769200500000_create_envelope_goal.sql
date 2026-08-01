BEGIN TRANSACTION;

-- Per-envelope goal configuration (CLAUDE.md "Envelope goal types"). One
-- row per envelope (id = the envelope/category id, one goal per
-- envelope), mirroring the one-row-per-envelope convention already used
-- by `envelope_balances`. Unlike that table, this is genuine synced
-- configuration data, not a derived/rebuildable cache -- so it carries a
-- normal `tombstone` column and goes through the standard CRDT-tracked
-- insert/update/delete path (`db.insertWithSchema`/`updateWithSchema`/
-- `delete_`), NOT `envelope_balances`'s deliberate bypass-CRDT cache
-- writes (`incrementEnvelopeBalance`).
--
-- "No goal" (the default/most common state) has no row here at all, or a
-- tombstoned one -- there is no literal 'none' `goal_type` value. See
-- `server/envelopes/goals.ts`'s `fromDbGoal` for the mapping into the
-- TS-facing discriminated union (`{type:'none'} | {type:'recurring'...} |
-- {type:'dated'...}`), which is what makes "both goal types set at once"
-- structurally unrepresentable at the type level even though this table's
-- own columns are necessarily nullable (SQL has no real sum types).
--
-- `goal_type` distinguishes the two mutually-exclusive types this table
-- can hold ('recurring' | 'dated'). `target_date` is only ever set for a
-- 'dated' goal. `cadence_type`/`cadence_custom_days` are the single
-- shared cadence primitive reused by both goal types (a recurring goal's
-- ongoing cadence, and a dated goal's suggested-contribution cadence are
-- the same concept) -- `cadence_custom_days` is only ever set when
-- `cadence_type = 'custom'`.
CREATE TABLE envelope_goal (
  id TEXT PRIMARY KEY,
  goal_type TEXT,
  target_amount INTEGER,
  cadence_type TEXT,
  cadence_custom_days INTEGER,
  -- Plain ISO 'YYYY-MM-DD' string, only set for a 'dated' goal -- see
  -- envelope_ledger.date in an earlier migration for why this doesn't use
  -- the AQL 'date' integer-repr type.
  target_date TEXT,
  created_at TEXT,
  updated_at TEXT,
  tombstone BOOLEAN DEFAULT 0
);

COMMIT;
