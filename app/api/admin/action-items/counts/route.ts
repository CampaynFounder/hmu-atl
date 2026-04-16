import { NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  try {
    const [actionRows, messageRows] = await Promise.all([
      sql`
        SELECT category, COUNT(*)::int as count
        FROM admin_action_items
        WHERE resolved_at IS NULL
        GROUP BY category
      `,
      sql`SELECT COUNT(*)::int as count FROM sms_inbound WHERE read = false`,
    ]);

    const counts: Record<string, number> = {};
    for (const row of actionRows) {
      counts[row.category as string] = row.count as number;
    }
    counts.messages = (messageRows[0]?.count as number) || 0;

    return NextResponse.json(counts);
  } catch (err) {
    console.error('[action-items/counts] error:', err);
    return NextResponse.json({ error: 'Failed to fetch counts' }, { status: 500 });
  }
}
