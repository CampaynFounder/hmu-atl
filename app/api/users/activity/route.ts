// POST /api/users/activity
// Track user activity for engagement analytics and personalization

import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/guards';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ActivitySchema = z.object({
  event: z.enum([
    // Onboarding events
    'signup_started',
    'video_recorded',
    'payment_added',
    'profile_completed',

    // Engagement events
    'feed_viewed',
    'ride_request_viewed',
    'driver_profile_viewed',
    'comment_sent',

    // Conversion events
    'ride_requested',
    'ride_accepted',
    'ride_completed',

    // Retention events
    'app_opened',
    'notification_clicked',
    'favorite_driver_added',
    'saved_route_used',
  ]),
  properties: z.record(z.string(), z.any()).optional(),
  timestamp: z.string().datetime().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { event, properties, timestamp } = ActivitySchema.parse(body);

    // Store activity event
    await pool.query(
      `INSERT INTO user_activity (
        user_id,
        event_name,
        properties,
        created_at
      ) VALUES ($1, $2, $3, $4)`,
      [
        user.id,
        event,
        JSON.stringify(properties || {}),
        timestamp ? new Date(timestamp) : new Date(),
      ]
    );

    // Update user's last_active timestamp
    await pool.query(
      `UPDATE users SET last_active = NOW() WHERE id = $1`,
      [user.id]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[ACTIVITY] Track error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid event', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to track activity' },
      { status: 500 }
    );
  }
}

// GET /api/users/activity
// Get user engagement metrics for personalization
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get lifecycle stage
    const stats = await pool.query(
      `SELECT
        COUNT(DISTINCT CASE WHEN event_name = 'ride_completed' THEN id END) as completed_rides,
        COUNT(DISTINCT CASE WHEN event_name = 'app_opened' THEN id END) as app_opens,
        MAX(CASE WHEN event_name = 'ride_completed' THEN created_at END) as last_ride,
        MIN(created_at) as first_activity
      FROM user_activity
      WHERE user_id = $1`,
      [user.id]
    );

    const metrics = stats.rows[0];
    const completedRides = parseInt(metrics.completed_rides) || 0;
    const daysSinceSignup = Math.floor(
      (Date.now() - new Date(metrics.first_activity).getTime()) / (1000 * 60 * 60 * 24)
    );
    const daysSinceLastRide = metrics.last_ride
      ? Math.floor((Date.now() - new Date(metrics.last_ride).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Determine lifecycle stage
    let stage = 'new'; // Default: just signed up

    if (completedRides === 0 && daysSinceSignup < 7) {
      stage = 'onboarding'; // 0 rides, less than 7 days
    } else if (completedRides >= 1 && completedRides < 5) {
      stage = 'activation'; // 1-4 rides
    } else if (completedRides >= 5 && completedRides < 20) {
      stage = 'growth'; // 5-19 rides
    } else if (completedRides >= 20) {
      stage = 'retention'; // 20+ rides (power user)
    }

    // Check if at risk of churn
    const isAtRisk = daysSinceLastRide && daysSinceLastRide > 14;

    return NextResponse.json({
      success: true,
      lifecycle: {
        stage,
        isAtRisk,
        metrics: {
          completedRides,
          daysSinceSignup,
          daysSinceLastRide,
        },
      },
    });
  } catch (error) {
    console.error('[ACTIVITY] Get metrics error:', error);
    return NextResponse.json(
      { error: 'Failed to get activity' },
      { status: 500 }
    );
  }
}
