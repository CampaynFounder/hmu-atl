import { NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import { getNormalizedDidsForLine } from '@/lib/sms/lines';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  try {
    // Unread SMS is split by line (DID): the 'messages' badge (main Messages
    // inbox) excludes the rider_growth number, which gets its own 'ridergrowth'
    // badge. Sentinel keeps ANY/ALL well-typed when no rider_growth DID is set.
    const rgDidsRaw = getNormalizedDidsForLine('rider_growth');
    const rgDids = rgDidsRaw.length ? rgDidsRaw : ['__none__'];

    const [actionRows, messageRows, riderGrowthRows] = await Promise.all([
      sql`
        SELECT category, COUNT(*)::int as count
        FROM admin_action_items
        WHERE resolved_at IS NULL
        GROUP BY category
      `,
      sql`
        SELECT COUNT(*)::int as count FROM sms_inbound
        WHERE read = false
        AND COALESCE(RIGHT(REGEXP_REPLACE(to_did, '[^0-9]', '', 'g'), 10), '') <> ALL(${rgDids})
      `,
      sql`
        SELECT COUNT(*)::int as count FROM sms_inbound
        WHERE read = false
        AND COALESCE(RIGHT(REGEXP_REPLACE(to_did, '[^0-9]', '', 'g'), 10), '') = ANY(${rgDids})
      `,
    ]);

    const counts: Record<string, number> = {};
    for (const row of actionRows) {
      counts[row.category as string] = row.count as number;
    }
    counts.messages = (messageRows[0]?.count as number) || 0;
    counts.ridergrowth = (riderGrowthRows[0]?.count as number) || 0;

    return NextResponse.json(counts);
  } catch (err) {
    console.error('[action-items/counts] error:', err);
    return NextResponse.json({ error: 'Failed to fetch counts' }, { status: 500 });
  }
}
