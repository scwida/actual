BEGIN TRANSACTION;

-- Additive columns supporting the real-balance envelope engine.
-- `is_reserved` marks system-owned rows the user cannot delete (e.g. the
-- reserved "Unallocated" envelope and the system group that holds it).
-- `reserved_kind` identifies which reserved envelope a category is
-- (currently only 'unallocated').
ALTER TABLE categories ADD COLUMN is_reserved BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE categories ADD COLUMN reserved_kind TEXT;
ALTER TABLE category_groups ADD COLUMN is_reserved BOOLEAN NOT NULL DEFAULT 0;

-- Seed the reserved system group and the reserved "Unallocated" envelope.
-- Fixed, well-known ids so every device/budget-file that runs this
-- migration ends up with the exact same row (no sync round-trip needed).
INSERT OR IGNORE INTO category_groups
  (id, name, is_income, sort_order, tombstone, hidden, budget_exempt, is_reserved)
VALUES
  ('reserved-system-group', 'System', 0, -1000000, 0, 1, 1, 1);

INSERT OR IGNORE INTO categories
  (id, name, is_income, cat_group, sort_order, tombstone, hidden, is_reserved, reserved_kind)
VALUES
  ('reserved-unallocated', 'Unallocated', 0, 'reserved-system-group', -1000000, 0, 0, 1, 'unallocated');

-- Categories need a self-referencing mapping row so transactions and
-- transfers that reference this category resolve correctly (mirrors what
-- `insertCategory` does for normally-created categories).
INSERT OR IGNORE INTO category_mapping (id, transferId)
VALUES ('reserved-unallocated', 'reserved-unallocated');

COMMIT;
