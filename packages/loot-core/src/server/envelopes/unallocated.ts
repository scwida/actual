import * as db from '#server/db';
import { batchMessages } from '#server/sync';
import type { CategoryEntity, CategoryGroupEntity } from '#types/models';

/**
 * The reserved system group that holds reserved envelopes (currently only
 * Unallocated). Fixed, well-known id -- see
 * migrations/1769200000000_add_envelope_reserved_columns.sql.
 */
export const RESERVED_SYSTEM_GROUP_ID: CategoryGroupEntity['id'] =
  'reserved-system-group';

/**
 * The reserved "Unallocated" envelope. A regular, non-deletable envelope
 * (categories row) that catches real deposits with no chosen destination
 * yet. See CLAUDE.md "How money moves" #4.
 */
export const UNALLOCATED_ENVELOPE_ID: CategoryEntity['id'] =
  'reserved-unallocated';

export function getUnallocatedEnvelopeId(): CategoryEntity['id'] {
  return UNALLOCATED_ENVELOPE_ID;
}

export function isUnallocatedEnvelope(
  envelopeId: CategoryEntity['id'],
): boolean {
  return envelopeId === UNALLOCATED_ENVELOPE_ID;
}

/**
 * Idempotently ensures the reserved system group, the reserved
 * "Unallocated" envelope, and its category_mapping row all exist.
 *
 * Migration 1769200000000 already seeds these for every budget file that
 * goes through normal migration, so under normal operation this is a
 * no-op. It exists as an explicit, safe-to-call-more-than-once repair
 * step (also used by the one-time cutover action) for any context that
 * builds/inspects a database without having gone through that migration
 * path.
 */
export async function ensureUnallocatedEnvelope(): Promise<
  CategoryEntity['id']
> {
  const existingGroup = db.firstSync<Pick<db.DbCategoryGroup, 'id'>>(
    'SELECT id FROM category_groups WHERE id = ?',
    [RESERVED_SYSTEM_GROUP_ID],
  );
  const existingCategory = db.firstSync<Pick<db.DbCategory, 'id'>>(
    'SELECT id FROM categories WHERE id = ?',
    [UNALLOCATED_ENVELOPE_ID],
  );
  const existingMapping = db.firstSync<Pick<db.DbCategoryMapping, 'id'>>(
    'SELECT id FROM category_mapping WHERE id = ?',
    [UNALLOCATED_ENVELOPE_ID],
  );

  if (existingGroup && existingCategory && existingMapping) {
    return UNALLOCATED_ENVELOPE_ID;
  }

  await batchMessages(async () => {
    if (!existingGroup) {
      await db.insertWithUUID('category_groups', {
        id: RESERVED_SYSTEM_GROUP_ID,
        name: 'System',
        is_income: 0,
        hidden: 1,
        budget_exempt: 1,
        is_reserved: 1,
        sort_order: -1000000,
      });
    }

    if (!existingCategory) {
      await db.insertWithUUID('categories', {
        id: UNALLOCATED_ENVELOPE_ID,
        name: 'Unallocated',
        is_income: 0,
        cat_group: RESERVED_SYSTEM_GROUP_ID,
        hidden: 0,
        is_reserved: 1,
        reserved_kind: 'unallocated',
        sort_order: -1000000,
      });
    }

    if (!existingMapping) {
      await db.insertWithUUID('category_mapping', {
        id: UNALLOCATED_ENVELOPE_ID,
        transferId: UNALLOCATED_ENVELOPE_ID,
      });
    }
  });

  return UNALLOCATED_ENVELOPE_ID;
}
