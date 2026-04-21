import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { publishAdminEvent } from '@/lib/ably/server';

// POST — rider/driver submits a support ticket
export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { rideId, category, message } = await req.json() as {
      rideId?: string;
      category: string;
      message: string;
    };

    if (!category || !message?.trim()) {
      return NextResponse.json({ error: 'Category and message are required' }, { status: 400 });
    }

    const userRows = await sql`SELECT id, market_id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;
    const userMarketId = (userRows[0] as { market_id: string | null }).market_id;

    // Determine priority based on category
    const priority = ['safety', 'report_driver'].includes(category) ? 'urgent'
      : ['refund', 'overcharged'].includes(category) ? 'high'
      : 'normal';

    // Stamp the filer's market on the ticket so admin queries can filter by
    // the currently-selected market.
    const result = await sql`
      INSERT INTO support_tickets (user_id, ride_id, category, message, priority, market_id)
      VALUES (${userId}, ${rideId || null}, ${category}, ${message.trim()}, ${priority}, ${userMarketId})
      RETURNING id
    `;

    const ticketId = (result[0] as { id: string }).id;

    // Notify admin via Ably
    await publishAdminEvent('support_ticket', {
      ticketId,
      userId,
      rideId: rideId || null,
      category,
      priority,
      preview: message.trim().slice(0, 100),
    }).catch(() => {});

    return NextResponse.json({ id: ticketId, status: 'open' });
  } catch (error) {
    console.error('Support ticket error:', error);
    return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 });
  }
}

// GET — admin fetches all tickets
export async function GET(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Check admin
    const userRows = await sql`SELECT id, is_admin FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length || !(userRows[0] as { is_admin: boolean }).is_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const marketId = req.nextUrl.searchParams.get('marketId');

    const tickets = await sql`
      SELECT
        t.id, t.category, t.message, t.status, t.priority,
        t.admin_notes, t.created_at, t.updated_at, t.resolved_at,
        t.ride_id,
        u.clerk_id as user_clerk_id,
        COALESCE(rp.display_name, rp.first_name, dp.display_name, dp.first_name) as user_name,
        COALESCE(rp.handle, dp.handle) as user_handle,
        u.profile_type as user_type,
        r.ref_code as ride_ref_code,
        r.status as ride_status,
        COALESCE(r.final_agreed_price, r.amount) as ride_price,
        r.pickup_address as ride_pickup,
        r.dropoff_address as ride_dropoff,
        r_dp.display_name as ride_driver_name,
        r_rp.display_name as ride_rider_name
      FROM support_tickets t
      LEFT JOIN users u ON u.id = t.user_id
      LEFT JOIN rider_profiles rp ON rp.user_id = t.user_id
      LEFT JOIN driver_profiles dp ON dp.user_id = t.user_id
      LEFT JOIN rides r ON r.id = t.ride_id
      LEFT JOIN driver_profiles r_dp ON r_dp.user_id = r.driver_id
      LEFT JOIN rider_profiles r_rp ON r_rp.user_id = r.rider_id
      WHERE (${marketId}::uuid IS NULL OR t.market_id = ${marketId})
      ORDER BY
        CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
        t.created_at DESC
      LIMIT 100
    `;

    return NextResponse.json({
      tickets: tickets.map((t: Record<string, unknown>) => ({
        id: t.id,
        category: t.category,
        message: t.message,
        status: t.status,
        priority: t.priority,
        adminNotes: t.admin_notes,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        resolvedAt: t.resolved_at,
        userName: t.user_name || 'User',
        userHandle: t.user_handle,
        userType: t.user_type,
        ride: t.ride_id ? {
          id: t.ride_id,
          refCode: t.ride_ref_code,
          status: t.ride_status,
          price: Number(t.ride_price || 0),
          pickup: t.ride_pickup,
          dropoff: t.ride_dropoff,
          driverName: t.ride_driver_name,
          riderName: t.ride_rider_name,
        } : null,
      })),
    });
  } catch (error) {
    console.error('Fetch tickets error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// PATCH — admin updates a ticket (status, notes)
export async function PATCH(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userRows = await sql`SELECT id, is_admin FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length || !(userRows[0] as { is_admin: boolean }).is_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const adminId = (userRows[0] as { id: string }).id;

    const { ticketId, status, adminNotes } = await req.json() as {
      ticketId: string;
      status?: string;
      adminNotes?: string;
    };

    if (!ticketId) return NextResponse.json({ error: 'ticketId required' }, { status: 400 });

    const updates: string[] = [];
    if (status) updates.push('status');
    if (adminNotes !== undefined) updates.push('notes');

    await sql`
      UPDATE support_tickets SET
        status = COALESCE(${status || null}, status),
        admin_notes = COALESCE(${adminNotes ?? null}, admin_notes),
        resolved_by = CASE WHEN ${status || null} = 'resolved' THEN ${adminId} ELSE resolved_by END,
        resolved_at = CASE WHEN ${status || null} = 'resolved' THEN NOW() ELSE resolved_at END,
        updated_at = NOW()
      WHERE id = ${ticketId}
    `;

    return NextResponse.json({ updated: true });
  } catch (error) {
    console.error('Update ticket error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
