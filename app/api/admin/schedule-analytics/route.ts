import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

/**
 * GET /api/admin/schedule-analytics?marketId=xxx&period=7d
 *
 * Returns:
 * - Driver utilization (% of working hours booked)
 * - Peak hours heatmap (hour × day bookings)
 * - Advance booking rate (% booked >1hr ahead)
 * - Schedule adherence (drivers live during set hours)
 * - Availability gaps (demand with no supply)
 * - Booking conflicts blocked (unmet demand signal)
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const marketId = req.nextUrl.searchParams.get('marketId');
  const period = req.nextUrl.searchParams.get('period') || '7d';
  const days = period === '30d' ? 30 : period === '14d' ? 14 : 7;
  const since = new Date(Date.now() - days * 86400000).toISOString();

  try {
    // 1. Driver utilization — working hours vs booked hours
    const utilizationRows = marketId ? await sql`
      SELECT
        COUNT(DISTINCT ds.driver_id) as drivers_with_schedule,
        (SELECT COUNT(DISTINCT driver_id) FROM driver_bookings
         WHERE status = 'confirmed' AND booking_type = 'ride'
         AND start_at > ${since} ${marketId ? sql`AND market_id = ${marketId}` : sql``}
        ) as drivers_with_bookings
      FROM driver_schedules ds
      JOIN users u ON u.id = ds.driver_id
      WHERE ds.is_active = true AND u.market_id = ${marketId}
    ` : await sql`
      SELECT
        COUNT(DISTINCT ds.driver_id) as drivers_with_schedule,
        (SELECT COUNT(DISTINCT driver_id) FROM driver_bookings
         WHERE status = 'confirmed' AND booking_type = 'ride' AND start_at > ${since}
        ) as drivers_with_bookings
      FROM driver_schedules ds
      WHERE ds.is_active = true
    `;

    // Total scheduled hours vs booked hours this period
    const hoursRows = await sql`
      SELECT
        COALESCE(SUM(EXTRACT(EPOCH FROM (end_at - start_at)) / 3600), 0) as booked_hours
      FROM driver_bookings
      WHERE status = 'confirmed' AND booking_type = 'ride'
        AND start_at > ${since}
        ${marketId ? sql`AND market_id = ${marketId}` : sql``}
    `;

    const scheduledHoursRows = await sql`
      SELECT
        COUNT(*) as active_day_slots,
        SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600) as daily_hours
      FROM driver_schedules ds
      ${marketId ? sql`JOIN users u ON u.id = ds.driver_id WHERE ds.is_active = true AND u.market_id = ${marketId}` : sql`WHERE ds.is_active = true`}
    `;

    const scheduledWeeklyHours = Number((scheduledHoursRows[0] as Record<string, unknown>).daily_hours || 0);
    const scheduledPeriodHours = (scheduledWeeklyHours / 7) * days;
    const bookedHours = Number((hoursRows[0] as Record<string, unknown>).booked_hours || 0);
    const utilization = scheduledPeriodHours > 0 ? Math.round((bookedHours / scheduledPeriodHours) * 100) : 0;

    // 2. Peak hours heatmap — count bookings by hour × day
    const heatmapRows = await sql`
      SELECT
        EXTRACT(DOW FROM start_at) as day_of_week,
        EXTRACT(HOUR FROM start_at) as hour,
        COUNT(*) as count
      FROM driver_bookings
      WHERE status = 'confirmed' AND booking_type = 'ride'
        AND start_at > ${since}
        ${marketId ? sql`AND market_id = ${marketId}` : sql``}
      GROUP BY EXTRACT(DOW FROM start_at), EXTRACT(HOUR FROM start_at)
      ORDER BY day_of_week, hour
    `;

    // Build 7×24 grid
    const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const row of heatmapRows) {
      const r = row as Record<string, unknown>;
      const d = Number(r.day_of_week);
      const h = Number(r.hour);
      heatmap[d][h] = Number(r.count);
    }

    // 3. Advance booking rate
    const advanceRows = await sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE start_at > created_at + INTERVAL '1 hour') as advance,
        COUNT(*) FILTER (WHERE start_at <= created_at + INTERVAL '1 hour') as on_demand
      FROM driver_bookings
      WHERE status = 'confirmed' AND booking_type = 'ride'
        AND start_at > ${since}
        ${marketId ? sql`AND market_id = ${marketId}` : sql``}
    `;
    const adv = advanceRows[0] as Record<string, unknown>;
    const advanceRate = Number(adv.total) > 0 ? Math.round((Number(adv.advance) / Number(adv.total)) * 100) : 0;

    // 4. Schedule adherence — drivers who went live during set hours
    const adherenceRows = await sql`
      SELECT
        COUNT(DISTINCT ds.driver_id) as total_scheduled,
        COUNT(DISTINCT hp.user_id) as actually_active
      FROM driver_schedules ds
      ${marketId ? sql`JOIN users u ON u.id = ds.driver_id` : sql``}
      LEFT JOIN hmu_posts hp ON hp.user_id = ds.driver_id
        AND hp.post_type = 'driver_available'
        AND hp.created_at > ${since}
      WHERE ds.is_active = true
        ${marketId ? sql`AND u.market_id = ${marketId}` : sql``}
    `;
    const adh = adherenceRows[0] as Record<string, unknown>;
    const adherenceRate = Number(adh.total_scheduled) > 0
      ? Math.round((Number(adh.actually_active) / Number(adh.total_scheduled)) * 100) : 0;

    // 5. Booking conflicts blocked
    const conflictRows = await sql`
      SELECT COUNT(*) as conflicts
      FROM schedule_events
      WHERE event_type = 'conflict_blocked'
        AND created_at > ${since}
        ${marketId ? sql`AND market_id = ${marketId}` : sql``}
    `;
    const conflictsBlocked = Number((conflictRows[0] as Record<string, unknown>).conflicts || 0);

    // 6. Top scheduled drivers
    const topDriverRows = await sql`
      SELECT
        db.driver_id,
        dp.handle,
        dp.display_name,
        COUNT(*) as ride_bookings,
        COALESCE(SUM(EXTRACT(EPOCH FROM (db.end_at - db.start_at)) / 3600), 0) as hours_booked
      FROM driver_bookings db
      JOIN driver_profiles dp ON dp.user_id = db.driver_id
      WHERE db.status = 'confirmed' AND db.booking_type = 'ride'
        AND db.start_at > ${since}
        ${marketId ? sql`AND db.market_id = ${marketId}` : sql``}
      GROUP BY db.driver_id, dp.handle, dp.display_name
      ORDER BY ride_bookings DESC
      LIMIT 10
    `;

    // 7. Schedule event timeline (recent activity)
    const recentEvents = await sql`
      SELECT
        se.event_type, se.created_at, se.details,
        dp.handle as driver_handle
      FROM schedule_events se
      LEFT JOIN driver_profiles dp ON dp.user_id = se.driver_id
      WHERE se.created_at > ${since}
        ${marketId ? sql`AND se.market_id = ${marketId}` : sql``}
      ORDER BY se.created_at DESC
      LIMIT 20
    `;

    return NextResponse.json({
      period: { days, since },
      utilization: {
        percent: utilization,
        bookedHours: Math.round(bookedHours * 10) / 10,
        scheduledHours: Math.round(scheduledPeriodHours * 10) / 10,
        driversWithSchedule: Number((utilizationRows[0] as Record<string, unknown>).drivers_with_schedule || 0),
        driversWithBookings: Number((utilizationRows[0] as Record<string, unknown>).drivers_with_bookings || 0),
      },
      peakHours: { heatmap },
      advanceBooking: {
        rate: advanceRate,
        total: Number(adv.total || 0),
        advance: Number(adv.advance || 0),
        onDemand: Number(adv.on_demand || 0),
      },
      adherence: {
        rate: adherenceRate,
        totalScheduled: Number(adh.total_scheduled || 0),
        actuallyActive: Number(adh.actually_active || 0),
      },
      conflictsBlocked,
      topDrivers: topDriverRows.map((r: Record<string, unknown>) => ({
        driverId: r.driver_id,
        handle: r.handle,
        displayName: r.display_name,
        rideBookings: Number(r.ride_bookings || 0),
        hoursBooked: Math.round(Number(r.hours_booked || 0) * 10) / 10,
      })),
      recentEvents: recentEvents.map((r: Record<string, unknown>) => ({
        type: r.event_type,
        driverHandle: r.driver_handle,
        details: r.details,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    console.error('Schedule analytics error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
