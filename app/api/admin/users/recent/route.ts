// GET /api/admin/users/recent — Recent signups with name and phone for outreach
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { searchParams } = req.nextUrl;
  const days = parseInt(searchParams.get('days') ?? '7');
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50'));

  try {
    const rows = await sql`
      SELECT
        u.id, u.profile_type, u.account_status, u.created_at,
        COALESCE(dp.display_name, dp.first_name, rp.display_name, rp.first_name) as name,
        dp.phone as driver_phone,
        dp.handle
      FROM users u
      LEFT JOIN driver_profiles dp ON dp.user_id = u.id
      LEFT JOIN rider_profiles rp ON rp.user_id = u.id
      WHERE u.created_at > NOW() - make_interval(days => ${days})
      ORDER BY u.created_at DESC
      LIMIT ${limit}
    `;

    return NextResponse.json({
      signups: rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        name: r.name || 'No name',
        phone: r.driver_phone || null,
        profileType: r.profile_type,
        accountStatus: r.account_status,
        handle: r.handle,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    console.error('Recent signups error:', error);
    return NextResponse.json({ error: 'Failed to fetch signups' }, { status: 500 });
  }
}
