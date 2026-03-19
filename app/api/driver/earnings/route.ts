import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userRows = await sql`SELECT id, tier FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const user = userRows[0] as { id: string; tier: string };

  // Get today's earnings (ET timezone)
  const todayRows = await sql`
    SELECT gross_earnings, platform_fee_paid, rides_completed, daily_cap_hit
    FROM daily_earnings
    WHERE driver_id = ${user.id}
      AND earnings_date = (NOW() AT TIME ZONE 'America/New_York')::date
    LIMIT 1
  `;

  // Get this week's earnings
  const weekRows = await sql`
    SELECT
      COALESCE(SUM(gross_earnings), 0) as weekly_gross,
      COALESCE(SUM(platform_fee_paid), 0) as weekly_fees,
      COALESCE(SUM(rides_completed), 0) as weekly_rides,
      BOOL_OR(weekly_cap_hit) as weekly_cap_hit
    FROM daily_earnings
    WHERE driver_id = ${user.id}
      AND earnings_date >= date_trunc('week', (NOW() AT TIME ZONE 'America/New_York')::date)
  `;

  const today = todayRows[0] as Record<string, unknown> | undefined;
  const week = weekRows[0] as Record<string, unknown> | undefined;

  const dailyCap = user.tier === 'hmu_first' ? 25 : 40;
  const weeklyCap = user.tier === 'hmu_first' ? 100 : 150;

  return NextResponse.json({
    today: {
      gross: Number(today?.gross_earnings ?? 0),
      fees: Number(today?.platform_fee_paid ?? 0),
      kept: Number(today?.gross_earnings ?? 0) - Number(today?.platform_fee_paid ?? 0),
      rides: Number(today?.rides_completed ?? 0),
      capHit: today?.daily_cap_hit ?? false,
      capUsed: Number(today?.platform_fee_paid ?? 0),
      capMax: dailyCap,
    },
    week: {
      gross: Number(week?.weekly_gross ?? 0),
      fees: Number(week?.weekly_fees ?? 0),
      kept: Number(week?.weekly_gross ?? 0) - Number(week?.weekly_fees ?? 0),
      rides: Number(week?.weekly_rides ?? 0),
      capHit: week?.weekly_cap_hit ?? false,
      capUsed: Number(week?.weekly_fees ?? 0),
      capMax: weeklyCap,
    },
    tier: user.tier,
  });
}
