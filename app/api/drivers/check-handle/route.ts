import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  const handle = req.nextUrl.searchParams.get('handle');
  if (!handle) return NextResponse.json({ available: false });

  const normalized = handle.toLowerCase().replace(/\s+/g, '');
  if (normalized.length < 2) return NextResponse.json({ available: false, reason: 'Too short' });

  const rows = await sql`
    SELECT id FROM driver_profiles WHERE LOWER(REPLACE(handle, ' ', '')) = ${normalized} LIMIT 1
  `;

  return NextResponse.json({ available: rows.length === 0, handle: normalized });
}
