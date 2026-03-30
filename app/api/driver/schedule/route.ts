import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

/**
 * GET — Fetch driver's weekly schedule + bookings for a date range.
 * Query: ?weekOf=2026-03-30 (defaults to current week)
 */
export async function GET(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userRows = await sql`
      SELECT u.id, u.market_id, m.timezone
      FROM users u LEFT JOIN markets m ON m.id = u.market_id
      WHERE u.clerk_id = ${clerkId} LIMIT 1
    `;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const user = userRows[0] as { id: string; market_id: string; timezone: string };

    // Weekly recurring schedule
    const scheduleRows = await sql`
      SELECT id, day_of_week, start_time, end_time, is_active, timezone
      FROM driver_schedules
      WHERE driver_id = ${user.id}
      ORDER BY day_of_week
    `;

    // Bookings for the requested week
    const weekOf = req.nextUrl.searchParams.get('weekOf') || new Date().toISOString().split('T')[0];
    const weekStart = getWeekStart(weekOf);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const bookingRows = await sql`
      SELECT id, rider_id, ride_id, booking_type, start_at, end_at, status, title, notes, recurring_group_id
      FROM driver_bookings
      WHERE driver_id = ${user.id}
        AND status != 'cancelled'
        AND start_at < ${weekEnd.toISOString()}
        AND end_at > ${weekStart.toISOString()}
      ORDER BY start_at
    `;

    // Enrich bookings with rider info
    const bookings = await Promise.all(bookingRows.map(async (b: Record<string, unknown>) => {
      let riderName = null;
      let riderHandle = null;
      if (b.rider_id) {
        const riderRows = await sql`
          SELECT handle, display_name FROM rider_profiles WHERE user_id = ${b.rider_id} LIMIT 1
        `;
        if (riderRows.length) {
          riderName = (riderRows[0] as Record<string, unknown>).display_name || (riderRows[0] as Record<string, unknown>).handle;
          riderHandle = (riderRows[0] as Record<string, unknown>).handle;
        }
      }
      return {
        id: b.id,
        bookingType: b.booking_type,
        startAt: b.start_at,
        endAt: b.end_at,
        status: b.status,
        title: b.title,
        notes: b.notes,
        rideId: b.ride_id,
        riderId: b.rider_id,
        riderName,
        riderHandle,
        recurringGroupId: b.recurring_group_id,
      };
    }));

    return NextResponse.json({
      schedule: scheduleRows.map((s: Record<string, unknown>) => ({
        id: s.id,
        dayOfWeek: s.day_of_week,
        startTime: s.start_time,
        endTime: s.end_time,
        isActive: s.is_active,
      })),
      bookings,
      timezone: user.timezone || 'America/New_York',
      weekOf: weekStart.toISOString().split('T')[0],
    });
  } catch (error) {
    console.error('Schedule GET error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

/**
 * POST — Set/update weekly working hours.
 * Body: { days: [{ dayOfWeek: 0-6, startTime: "09:00", endTime: "17:00", isActive: true }] }
 */
export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { days } = await req.json() as {
      days: { dayOfWeek: number; startTime: string; endTime: string; isActive: boolean }[];
    };

    if (!days?.length) return NextResponse.json({ error: 'days required' }, { status: 400 });

    const userRows = await sql`
      SELECT u.id, u.market_id, m.timezone
      FROM users u LEFT JOIN markets m ON m.id = u.market_id
      WHERE u.clerk_id = ${clerkId} LIMIT 1
    `;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const user = userRows[0] as { id: string; market_id: string; timezone: string };
    const tz = user.timezone || 'America/New_York';

    for (const day of days) {
      if (day.dayOfWeek < 0 || day.dayOfWeek > 6) continue;
      await sql`
        INSERT INTO driver_schedules (driver_id, day_of_week, start_time, end_time, is_active, timezone, market_id)
        VALUES (${user.id}, ${day.dayOfWeek}, ${day.startTime}::time, ${day.endTime}::time, ${day.isActive}, ${tz}, ${user.market_id})
        ON CONFLICT (driver_id, day_of_week)
        DO UPDATE SET start_time = ${day.startTime}::time, end_time = ${day.endTime}::time, is_active = ${day.isActive}, updated_at = NOW()
      `;
    }

    // Track event
    await sql`
      INSERT INTO schedule_events (driver_id, event_type, market_id, details)
      VALUES (${user.id}, 'hours_set', ${user.market_id}, ${JSON.stringify({ days })}::jsonb)
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Schedule POST error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

/**
 * PATCH — Add/remove a time block (booking or blocked time).
 * Body: { action: 'block', startAt, endAt, title? }
 *    or { action: 'unblock', bookingId }
 */
export async function PATCH(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action } = body as { action: string };

    const userRows = await sql`
      SELECT u.id, u.market_id, m.timezone
      FROM users u LEFT JOIN markets m ON m.id = u.market_id
      WHERE u.clerk_id = ${clerkId} LIMIT 1
    `;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const user = userRows[0] as { id: string; market_id: string; timezone: string };

    if (action === 'block') {
      const { startAt, endAt, title } = body as { startAt: string; endAt: string; title?: string };
      if (!startAt || !endAt) return NextResponse.json({ error: 'startAt and endAt required' }, { status: 400 });

      // Check for conflicts
      const conflicts = await sql`
        SELECT id FROM driver_bookings
        WHERE driver_id = ${user.id} AND status = 'confirmed'
          AND start_at < ${endAt} AND end_at > ${startAt}
        LIMIT 1
      `;
      if (conflicts.length) {
        return NextResponse.json({ error: 'Time conflict — you already have a booking in this slot' }, { status: 409 });
      }

      const rows = await sql`
        INSERT INTO driver_bookings (driver_id, booking_type, start_at, end_at, title, timezone, market_id, status)
        VALUES (${user.id}, 'blocked', ${startAt}, ${endAt}, ${title || 'Blocked'}, ${user.timezone || 'America/New_York'}, ${user.market_id}, 'confirmed')
        RETURNING id
      `;

      await sql`
        INSERT INTO schedule_events (driver_id, event_type, market_id, details)
        VALUES (${user.id}, 'time_blocked', ${user.market_id}, ${JSON.stringify({ startAt, endAt, title })}::jsonb)
      `;

      return NextResponse.json({ id: (rows[0] as { id: string }).id, status: 'blocked' });
    }

    if (action === 'unblock') {
      const { bookingId } = body as { bookingId: string };
      await sql`
        UPDATE driver_bookings SET status = 'cancelled', updated_at = NOW()
        WHERE id = ${bookingId} AND driver_id = ${user.id} AND booking_type = 'blocked'
      `;

      await sql`
        INSERT INTO schedule_events (driver_id, event_type, market_id, details)
        VALUES (${user.id}, 'time_unblocked', ${user.market_id}, ${JSON.stringify({ bookingId })}::jsonb)
      `;

      return NextResponse.json({ status: 'unblocked' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Schedule PATCH error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

function getWeekStart(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() - day); // Sunday
  return d;
}
