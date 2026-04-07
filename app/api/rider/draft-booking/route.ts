import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

/**
 * POST — Save a draft booking inquiry (chat data) server-side.
 * Called after rider signs up so booking data survives device/browser changes.
 */
export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { driverHandle, bookingData } = body;
  if (!driverHandle || !bookingData) {
    return NextResponse.json({ error: 'driverHandle and bookingData required' }, { status: 400 });
  }

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const userId = (userRows[0] as { id: string }).id;

  // Upsert — one draft per rider per driver
  await sql`
    INSERT INTO draft_bookings (rider_id, driver_handle, booking_data, expires_at)
    VALUES (${userId}, ${driverHandle}, ${JSON.stringify(bookingData)}::jsonb, NOW() + INTERVAL '48 hours')
    ON CONFLICT (rider_id, driver_handle) DO UPDATE SET
      booking_data = ${JSON.stringify(bookingData)}::jsonb,
      expires_at = NOW() + INTERVAL '48 hours',
      updated_at = NOW()
  `;

  return NextResponse.json({ saved: true });
}

/**
 * GET — Retrieve a saved draft booking inquiry for a specific driver.
 * Called when rider lands on driver page to check for resumable bookings.
 */
export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const driverHandle = searchParams.get('driverHandle');
  if (!driverHandle) return NextResponse.json({ error: 'driverHandle required' }, { status: 400 });

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ draft: null });
  const userId = (userRows[0] as { id: string }).id;

  const rows = await sql`
    SELECT booking_data FROM draft_bookings
    WHERE rider_id = ${userId} AND driver_handle = ${driverHandle}
      AND expires_at > NOW()
    LIMIT 1
  `;

  if (!rows.length) return NextResponse.json({ draft: null });

  return NextResponse.json({ draft: (rows[0] as { booking_data: unknown }).booking_data });
}

/**
 * DELETE — Clear draft after booking is successfully submitted.
 */
export async function DELETE(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const driverHandle = searchParams.get('driverHandle');
  if (!driverHandle) return NextResponse.json({ error: 'driverHandle required' }, { status: 400 });

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ ok: true });
  const userId = (userRows[0] as { id: string }).id;

  await sql`DELETE FROM draft_bookings WHERE rider_id = ${userId} AND driver_handle = ${driverHandle}`;

  return NextResponse.json({ ok: true });
}
