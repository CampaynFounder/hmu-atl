import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { handle } = await params;

    const rows = await sql`
      SELECT
        rp.display_name,
        rp.handle,
        rp.avatar_url,
        rp.video_url,
        rp.lgbtq_friendly,
        rp.created_at,
        u.id as user_id,
        u.chill_score,
        u.completed_rides,
        u.og_status,
        u.account_status
      FROM rider_profiles rp
      JOIN users u ON u.id = rp.user_id
      WHERE rp.handle = ${handle}
        AND u.account_status = 'active'
      LIMIT 1
    `;

    if (!rows.length) {
      return NextResponse.json({ error: 'Rider not found' }, { status: 404 });
    }

    const r = rows[0] as Record<string, unknown>;

    // Fetch ratings breakdown + dispute count
    const [ratingRows, disputeRows] = await Promise.all([
      sql`
        SELECT rating_type, COUNT(*)::int as count
        FROM ratings
        WHERE rated_id = ${r.user_id}
        GROUP BY rating_type
      `,
      sql`
        SELECT COUNT(*)::int as count FROM disputes
        WHERE filed_by != ${r.user_id}
          AND ride_id IN (SELECT id FROM rides WHERE rider_id = ${r.user_id})
      `,
    ]);

    const ratings: Record<string, number> = {};
    let totalRatings = 0;
    for (const row of ratingRows as Array<{ rating_type: string; count: number }>) {
      ratings[row.rating_type] = row.count;
      totalRatings += row.count;
    }

    return NextResponse.json({
      displayName: r.display_name || 'Rider',
      handle: r.handle,
      avatarUrl: r.avatar_url || null,
      videoUrl: r.video_url || null,
      lgbtqFriendly: r.lgbtq_friendly || false,
      chillScore: Number(r.chill_score ?? 0),
      completedRides: Number(r.completed_rides ?? 0),
      ogStatus: r.og_status || false,
      disputeCount: Number((disputeRows[0] as Record<string, unknown>)?.count ?? 0),
      memberSince: r.created_at,
      ratings,
      totalRatings,
    });
  } catch (error) {
    console.error('Rider profile error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
