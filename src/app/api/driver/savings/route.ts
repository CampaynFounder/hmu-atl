import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { neon } from '@neondatabase/serverless';
import { getHMUFirstSavings } from '../../../../lib/payouts/calculator';
import type { User } from '../../../../lib/db/types';

const ratelimit = new Ratelimit({
  redis: new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  }),
  limiter: Ratelimit.slidingWindow(60, '60 s'),
  prefix: 'rl:driver:savings',
});

/**
 * GET /api/driver/savings
 *
 * Returns HMU First savings calculation for the current driver.
 * Powers the upgrade prompt: "Switch and keep $X more".
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { success } = await ratelimit.limit(userId);
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

  const sql = neon(process.env.DATABASE_URL!);

  const userRows = await sql`SELECT id, tier FROM users WHERE clerk_id = ${userId} LIMIT 1`;
  const user = userRows[0] as Pick<User, 'id' | 'tier'> | undefined;
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  try {
    const earningsRows = await sql`SELECT COALESCE(SUM(amount), 0) AS total_gross FROM payouts WHERE driver_id = ${user.id}`;
    const totalGross = Number(earningsRows[0].total_gross ?? 0);
    const savings = getHMUFirstSavings(totalGross);

    return NextResponse.json({
      driver_id: user.id,
      current_tier: user.tier,
      total_gross: Math.round(totalGross * 100) / 100,
      savings_if_hmu_first: savings,
      copy: user.tier === 'hmu_first'
        ? "You're on HMU First — you're already keeping the maximum."
        : `Switch to HMU First and keep $${savings.toFixed(2)} more on your earnings so far.`,
    }, { status: 200 });
  } catch (err) {
    console.error('[driver/savings] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
