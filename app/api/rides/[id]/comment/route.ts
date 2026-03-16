// POST /api/rides/[id]/comment
// Add comment to ride (FB-style conversation)

import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/guards';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CommentSchema = z.object({
  message: z.string().min(1).max(500),
  type: z.enum(['offer_counter', 'question', 'update', 'general']).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: rideId } = await params;
    const body = await req.json();
    const { message, type } = CommentSchema.parse(body);

    // Verify user is involved in this ride
    const rideCheck = await pool.query(
      `SELECT rider_id, driver_id FROM rides WHERE id = $1`,
      [rideId]
    );

    if (rideCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
    }

    const ride = rideCheck.rows[0];
    const isRider = ride.rider_id === user.id;
    const isDriver = ride.driver_id === user.id;

    if (!isRider && !isDriver) {
      return NextResponse.json(
        { error: 'Not authorized for this ride' },
        { status: 403 }
      );
    }

    // Insert comment
    const result = await pool.query(
      `INSERT INTO ride_comments (ride_id, user_id, message, comment_type, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, created_at`,
      [rideId, user.id, message, type || 'general']
    );

    // Update ride's last_activity for engagement tracking
    await pool.query(
      `UPDATE rides SET updated_at = NOW() WHERE id = $1`,
      [rideId]
    );

    return NextResponse.json({
      success: true,
      comment: {
        id: result.rows[0].id,
        message,
        userId: user.id,
        createdAt: result.rows[0].created_at,
      },
    });
  } catch (error) {
    console.error('[RIDES] Comment error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid comment', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to add comment' },
      { status: 500 }
    );
  }
}

// GET /api/rides/[id]/comment
// Get all comments for a ride (conversation history)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: rideId } = await params;

    // Verify user access
    const rideCheck = await pool.query(
      `SELECT rider_id, driver_id FROM rides WHERE id = $1`,
      [rideId]
    );

    if (rideCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
    }

    const ride = rideCheck.rows[0];
    if (ride.rider_id !== user.id && ride.driver_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Get comments with user info
    const comments = await pool.query(
      `SELECT
         rc.id,
         rc.message,
         rc.comment_type,
         rc.created_at,
         u.id as user_id,
         u.clerk_id,
         rc.user_id = $2 as is_me
       FROM ride_comments rc
       JOIN users u ON rc.user_id = u.id
       WHERE rc.ride_id = $1
       ORDER BY rc.created_at ASC`,
      [rideId, user.id]
    );

    return NextResponse.json({
      success: true,
      comments: comments.rows.map((row: any) => ({
        id: row.id,
        message: row.message,
        type: row.comment_type,
        userId: row.user_id,
        isMe: row.is_me,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error('[RIDES] Get comments error:', error);
    return NextResponse.json(
      { error: 'Failed to get comments' },
      { status: 500 }
    );
  }
}
