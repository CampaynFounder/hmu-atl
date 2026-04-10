import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export async function GET(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Verify admin
    const adminRows = await sql`SELECT is_admin FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!adminRows[0]?.is_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = request.nextUrl;
    const leadType = searchParams.get('type'); // 'driver' | 'rider' | null
    const search = searchParams.get('q')?.trim() || '';

    const rows = await sql`
      SELECT id, email, phone, lead_type, source, utm_source, utm_medium, utm_campaign,
             converted, converted_at, created_at
      FROM leads
      WHERE (${leadType}::text IS NULL OR lead_type = ${leadType})
        AND (
          ${search} = ''
          OR email ILIKE ${'%' + search + '%'}
          OR phone ILIKE ${'%' + search + '%'}
          OR source ILIKE ${'%' + search + '%'}
        )
      ORDER BY created_at DESC
      LIMIT 500
    `;

    // Aggregate stats
    const stats = await sql`
      SELECT
        COUNT(*) FILTER (WHERE lead_type = 'driver') as driver_count,
        COUNT(*) FILTER (WHERE lead_type = 'rider') as rider_count,
        COUNT(*) FILTER (WHERE converted = true) as converted_count,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as last_7d,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as last_24h,
        COUNT(*) as total
      FROM leads
    `;

    return NextResponse.json({ leads: rows, stats: stats[0] });
  } catch (error) {
    console.error('Admin leads fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
  }
}
