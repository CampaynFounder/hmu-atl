// GET /api/users/personalization
// Get personalized content based on user lifecycle stage

import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's lifecycle stage and activity
    const activityRes = await fetch(
      `${req.nextUrl.origin}/api/users/activity`,
      {
        headers: req.headers,
      }
    );

    if (!activityRes.ok) {
      throw new Error('Failed to get activity');
    }

    const { lifecycle } = await activityRes.json();

    // Get personalized content based on stage
    const personalization = await getPersonalizedContent(user.id, lifecycle);

    return NextResponse.json({
      success: true,
      ...personalization,
    });
  } catch (error) {
    console.error('[PERSONALIZATION] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get personalization' },
      { status: 500 }
    );
  }
}

async function getPersonalizedContent(
  userId: string,
  lifecycle: { stage: string; isAtRisk: boolean; metrics: any }
) {
  const stage = lifecycle.stage;

  // Onboarding stage: Guide through first ride
  if (stage === 'onboarding' || stage === 'new') {
    return {
      stage: 'onboarding',
      greeting: "Welcome! Let's get you on your first ride 🚗",
      cta: {
        primary: 'Request Your First Ride',
        secondary: 'See How It Works',
      },
      tips: [
        'Add a profile video to build trust',
        'Your first ride is just a tap away',
        'Drivers in your area are ready',
      ],
      showTutorial: true,
      highlightFeatures: ['video_verification', 'safe_payments'],
    };
  }

  // Activation: Building habits (1-4 rides)
  if (stage === 'activation') {
    // Get favorite routes
    const routes = await pool.query(
      `SELECT
        pickup_address,
        dropoff_address,
        COUNT(*) as ride_count
      FROM rides
      WHERE rider_id = $1 AND status = 'paid'
      GROUP BY pickup_address, dropoff_address
      ORDER BY ride_count DESC
      LIMIT 3`,
      [userId]
    );

    return {
      stage: 'activation',
      greeting: "You're getting the hang of it! 🎉",
      cta: {
        primary: 'Request Another Ride',
        secondary: 'Save Favorite Route',
      },
      tips: [
        `You've completed ${lifecycle.metrics.completedRides} rides`,
        'Save your frequent routes for faster booking',
        'Favorite drivers you trust',
      ],
      suggestedRoutes: routes.rows,
      showProgress: true,
      milestone: {
        current: lifecycle.metrics.completedRides,
        next: 5,
        reward: 'Unlock priority matching',
      },
    };
  }

  // Growth: Regular user (5-19 rides)
  if (stage === 'growth') {
    // Get preferred drivers
    const preferredDrivers = await pool.query(
      `SELECT
        d.id,
        u.clerk_id,
        COUNT(*) as ride_count,
        AVG(rr.rating) as avg_rating
      FROM rides r
      JOIN drivers d ON r.driver_id = d.id
      JOIN users u ON d.user_id = u.id
      LEFT JOIN ride_ratings rr ON r.id = rr.ride_id
      WHERE r.rider_id = $1 AND r.status = 'paid'
      GROUP BY d.id, u.clerk_id
      ORDER BY ride_count DESC, avg_rating DESC
      LIMIT 5`,
      [userId]
    );

    return {
      stage: 'growth',
      greeting: "You're a regular! Here's what's new 📈",
      cta: {
        primary: 'Quick Book with Favorite Driver',
        secondary: 'Explore New Areas',
      },
      tips: [
        `${lifecycle.metrics.completedRides} rides completed`,
        'Book your favorite drivers instantly',
        'Earn rewards for referrals',
      ],
      preferredDrivers: preferredDrivers.rows,
      showLoyalty: true,
      referralBonus: {
        amount: 10,
        message: 'Give $10, Get $10',
      },
    };
  }

  // Retention: Power user (20+ rides)
  if (stage === 'retention') {
    // Get lifetime value stats
    const stats = await pool.query(
      `SELECT
        COUNT(*) as total_rides,
        SUM(final_fare) as total_spent,
        AVG(final_fare) as avg_fare,
        COUNT(DISTINCT driver_id) as unique_drivers
      FROM rides
      WHERE rider_id = $1 AND status = 'paid'`,
      [userId]
    );

    return {
      stage: 'retention',
      greeting: "Welcome back, power rider! 🌟",
      cta: {
        primary: 'Quick Book',
        secondary: 'View Your Stats',
      },
      tips: [
        `${stats.rows[0].total_rides} lifetime rides`,
        'VIP matching priority',
        'Exclusive driver access',
      ],
      stats: {
        totalRides: stats.rows[0].total_rides,
        totalSpent: stats.rows[0].total_spent,
        avgFare: stats.rows[0].avg_fare,
        uniqueDrivers: stats.rows[0].unique_drivers,
      },
      showVIPBadge: true,
      earlyAccess: true,
    };
  }

  // At-risk user: Re-engagement
  if (lifecycle.isAtRisk) {
    return {
      stage: 'at_risk',
      greeting: "We've missed you! 💙",
      cta: {
        primary: 'Get a Discount Ride',
        secondary: "See What's New",
      },
      tips: [
        `It's been ${lifecycle.metrics.daysSinceLastRide} days`,
        'New drivers in your area',
        'Special comeback offer: 20% off',
      ],
      incentive: {
        type: 'discount',
        value: 0.2,
        message: '20% off your next ride',
      },
      showReactivation: true,
    };
  }

  // Default fallback
  return {
    stage: 'default',
    greeting: 'Ready to ride?',
    cta: {
      primary: 'Request a Ride',
      secondary: 'View Feed',
    },
  };
}
