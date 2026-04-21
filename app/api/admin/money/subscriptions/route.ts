import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

const HMU_FIRST_PRICE = 9.99;

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const marketId = req.nextUrl.searchParams.get('marketId');

  try {
    const [activeRows, newThisWeekRows, newThisMonthRows, churnedRows] = await Promise.all([
      sql`SELECT COUNT(*)::int as count FROM users
          WHERE tier = 'hmu_first'
            AND (${marketId}::uuid IS NULL OR market_id = ${marketId})`,
      sql`SELECT COUNT(*)::int as count FROM users
          WHERE tier = 'hmu_first' AND updated_at > NOW() - INTERVAL '7 days'
            AND (${marketId}::uuid IS NULL OR market_id = ${marketId})`,
      sql`SELECT COUNT(*)::int as count FROM users
          WHERE tier = 'hmu_first' AND updated_at > NOW() - INTERVAL '30 days'
            AND (${marketId}::uuid IS NULL OR market_id = ${marketId})`,
      // subscription_events has no market_id column; scope via the user join.
      sql`SELECT COUNT(*)::int as count FROM subscription_events se
          LEFT JOIN users u ON u.id = se.user_id
          WHERE se.event_type = 'cancelled'
            AND se.created_at > NOW() - INTERVAL '30 days'
            AND (${marketId}::uuid IS NULL OR u.market_id = ${marketId})`,
    ]);

    const active = (activeRows[0]?.count as number) || 0;
    const newThisWeek = (newThisWeekRows[0]?.count as number) || 0;
    const newThisMonth = (newThisMonthRows[0]?.count as number) || 0;
    const churnedThisMonth = (churnedRows[0]?.count as number) || 0;

    return NextResponse.json({
      active,
      mrr: Math.round(active * HMU_FIRST_PRICE * 100) / 100,
      newThisWeek,
      newThisMonth,
      churnedThisMonth,
      pricePerMonth: HMU_FIRST_PRICE,
    });
  } catch (err) {
    console.error('[money/subscriptions] error:', err);
    return NextResponse.json({ error: 'Failed to fetch subscription metrics' }, { status: 500 });
  }
}
