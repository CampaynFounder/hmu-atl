import { sql } from '@/lib/db/client';
import { publishAdminEvent } from '@/lib/ably/server';

interface CreateActionItemOpts {
  category: string;
  itemType: string;
  referenceId: string;
  title: string;
  priority?: 'info' | 'warning' | 'urgent';
}

/**
 * Create an unresolved action item and push a realtime update.
 * Fire-and-forget safe — catches all errors internally.
 */
export async function createActionItem(opts: CreateActionItemOpts): Promise<void> {
  try {
    await sql`
      INSERT INTO admin_action_items (category, item_type, reference_id, title, priority)
      VALUES (${opts.category}, ${opts.itemType}, ${opts.referenceId}, ${opts.title}, ${opts.priority || 'info'})
    `;
    publishAdminEvent('action_item_created', { category: opts.category }).catch(() => {});
  } catch (err) {
    console.error('[ActionItems] Failed to create:', err);
  }
}

/**
 * Resolve all unresolved action items matching category + reference.
 * Fire-and-forget safe — catches all errors internally.
 */
export async function resolveActionItem(category: string, referenceId: string): Promise<void> {
  try {
    const rows = await sql`
      UPDATE admin_action_items
      SET resolved_at = NOW()
      WHERE category = ${category}
        AND reference_id = ${referenceId}
        AND resolved_at IS NULL
      RETURNING id
    `;
    if (rows.length > 0) {
      publishAdminEvent('action_item_resolved', { category }).catch(() => {});
    }
  } catch (err) {
    console.error('[ActionItems] Failed to resolve:', err);
  }
}
