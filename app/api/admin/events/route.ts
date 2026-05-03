import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export async function GET(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adminRows = await sql`SELECT is_admin FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!adminRows[0]?.is_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status');
    const market = searchParams.get('market');
    const search = searchParams.get('q')?.trim() || '';

    const rows = await sql`
      SELECT id, market_slug, name, role, email, phone, social_handle,
             event_name, event_date, expected_attendance, notes,
             status, contacted_at, closed_at, created_at, updated_at
      FROM event_inquiries
      WHERE (${status}::text IS NULL OR status = ${status})
        AND (${market}::text IS NULL OR market_slug = ${market})
        AND (
          ${search} = ''
          OR name ILIKE ${'%' + search + '%'}
          OR email ILIKE ${'%' + search + '%'}
          OR event_name ILIKE ${'%' + search + '%'}
        )
      ORDER BY created_at DESC
      LIMIT 500
    `;

    const stats = await sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'new') AS new_count,
        COUNT(*) FILTER (WHERE status = 'contacted') AS contacted_count,
        COUNT(*) FILTER (WHERE status = 'won') AS won_count,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS last_7d,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS last_24h,
        COUNT(*) AS total
      FROM event_inquiries
    `;

    return NextResponse.json({ inquiries: rows, stats: stats[0] });
  } catch (error) {
    console.error('Admin event inquiries fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch inquiries' }, { status: 500 });
  }
}
