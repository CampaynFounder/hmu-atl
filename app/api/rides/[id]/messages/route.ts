import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { publishRideUpdate } from '@/lib/ably/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    // Verify user is part of this ride
    const rideRows = await sql`
      SELECT driver_id, rider_id, status FROM rides WHERE id = ${rideId} LIMIT 1
    `;
    if (!rideRows.length) return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
    const ride = rideRows[0] as Record<string, unknown>;

    if (ride.driver_id !== userId && ride.rider_id !== userId) {
      return NextResponse.json({ error: 'Not part of this ride' }, { status: 403 });
    }

    const messages = await sql`
      SELECT rm.id, rm.sender_id, rm.content, rm.created_at
      FROM ride_messages rm
      WHERE rm.ride_id = ${rideId}
      ORDER BY rm.created_at ASC
      LIMIT 100
    `;

    return NextResponse.json({
      messages: messages.map((m: Record<string, unknown>) => ({
        id: m.id,
        senderId: m.sender_id,
        content: m.content,
        createdAt: m.created_at,
      })),
    });
  } catch (error) {
    console.error('Chat GET error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;
    const body = await req.json();
    const content = (body.content || '').trim();

    if (!content || content.length > 500) {
      return NextResponse.json({ error: 'Message must be 1-500 characters' }, { status: 400 });
    }

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    // Verify user is part of this ride and ride is in chat-eligible status
    const rideRows = await sql`
      SELECT driver_id, rider_id, status FROM rides WHERE id = ${rideId} LIMIT 1
    `;
    if (!rideRows.length) return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
    const ride = rideRows[0] as Record<string, unknown>;

    if (ride.driver_id !== userId && ride.rider_id !== userId) {
      return NextResponse.json({ error: 'Not part of this ride' }, { status: 403 });
    }

    const chatStatuses = ['otw', 'here', 'active', 'ended'];
    if (!chatStatuses.includes(ride.status as string)) {
      return NextResponse.json({ error: 'Chat not available in this ride status' }, { status: 400 });
    }

    // Insert message
    const rows = await sql`
      INSERT INTO ride_messages (ride_id, sender_id, content)
      VALUES (${rideId}, ${userId}, ${content})
      RETURNING id, created_at
    `;
    const msg = rows[0] as { id: string; created_at: string };

    // Publish to Ably
    try {
      await publishRideUpdate(rideId, 'chat_message', {
        id: msg.id,
        senderId: userId,
        content,
        createdAt: msg.created_at,
      });
    } catch (e) {
      console.error('Ably chat publish failed:', e);
    }

    return NextResponse.json({
      id: msg.id,
      senderId: userId,
      content,
      createdAt: msg.created_at,
    }, { status: 201 });
  } catch (error) {
    console.error('Chat POST error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
