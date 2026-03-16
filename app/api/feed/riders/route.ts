// GET /api/feed/riders
// Get feed of ride requests for drivers (with safety matching)

import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/guards';
import { findSafeMatches, SafetyPreferences } from '@/lib/rides/safety-matching';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is a driver
    const driverCheck = await pool.query(
      'SELECT id FROM driver_profiles WHERE user_id = $1',
      [user.id]
    );

    if (driverCheck.rows.length === 0) {
      return NextResponse.json(
        { error: 'Only drivers can access ride requests' },
        { status: 403 }
      );
    }

    const driverId = driverCheck.rows[0].id;

    // Get pagination params
    const { searchParams } = req.nextUrl;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = (page - 1) * limit;

    // Get driver's current location
    const locationRes = await pool.query(
      'SELECT current_latitude, current_longitude FROM driver_profiles WHERE id = $1',
      [driverId]
    );

    const currentLocation = locationRes.rows[0];
    if (!currentLocation?.current_latitude || !currentLocation?.current_longitude) {
      return NextResponse.json(
        { error: 'Driver location not set. Please enable location services.' },
        { status: 400 }
      );
    }

    // Get driver's safety preferences
    const prefsRes = await pool.query(
      `SELECT
        rider_gender_pref,
        require_lgbtq_friendly,
        min_rider_rating,
        require_verification,
        avoid_disputes,
        max_trip_distance_miles,
        matching_priority
      FROM user_preferences
      WHERE user_id = $1`,
      [user.id]
    );

    const prefs = prefsRes.rows[0] || {};
    const safetyPreferences: SafetyPreferences = {
      genderPref: prefs.rider_gender_pref || 'no_preference',
      requireLgbtqFriendly: prefs.require_lgbtq_friendly || false,
      minRating: parseFloat(prefs.min_rider_rating) || 4.0,
      requireVerification: prefs.require_verification || false,
      avoidDisputes: prefs.avoid_disputes !== false,
      maxTripDistanceMiles: prefs.max_trip_distance_miles,
      matchingPriority: prefs.matching_priority || 'safety_first',
    };

    // Get all pending ride requests in the area
    const ridesRes = await pool.query(
      `SELECT
        r.id as ride_id,
        r.rider_id,
        r.pickup->>'address' as pickup_address,
        CAST(r.pickup->>'latitude' AS FLOAT) as pickup_lat,
        CAST(r.pickup->>'longitude' AS FLOAT) as pickup_lng,
        r.dropoff->>'address' as dropoff_address,
        CAST(r.dropoff->>'latitude' AS FLOAT) as dropoff_lat,
        CAST(r.dropoff->>'longitude' AS FLOAT) as dropoff_lng,
        r.stops,
        r.amount as offer_amount,
        r.created_at,
        u.id as user_id,
        u.clerk_id,
        u.gender,
        u.pronouns,
        u.lgbtq_friendly,
        u.is_verified,
        uss.avg_rating
      FROM rides r
      JOIN users u ON r.rider_id = u.id
      JOIN user_safety_scores uss ON uss.user_id = u.id
      WHERE r.status = 'pending'
        AND r.driver_id IS NULL
        AND r.created_at > NOW() - INTERVAL '1 hour'
      ORDER BY r.created_at DESC
      LIMIT 50`,
      []
    );

    // Apply safety matching to each request
    const matchedRequests = [];

    for (const ride of ridesRes.rows) {
      // Use safety matching algorithm
      const matches = await findSafeMatches({
        userId: user.id,
        userType: 'driver',
        pickupLocation: {
          latitude: ride.pickup_lat,
          longitude: ride.pickup_lng,
        },
        radiusMiles: 10,
        preferences: safetyPreferences,
      });

      // Check if this specific rider matches
      const riderMatch = matches.find((m) => m.userId === ride.rider_id);
      if (!riderMatch) {
        continue; // Skip riders that don't match preferences
      }

      // Calculate trip distance (approximate)
      const tripDistance = calculateDistance(
        { latitude: ride.pickup_lat, longitude: ride.pickup_lng },
        { latitude: ride.dropoff_lat, longitude: ride.dropoff_lng }
      );

      // Skip if exceeds max distance preference
      if (prefs.max_trip_distance_miles && tripDistance > prefs.max_trip_distance_miles) {
        continue;
      }

      // Get rider's first name from Clerk ID
      // TODO: Fetch from Clerk API or cache
      const firstName = 'Rider'; // Placeholder

      matchedRequests.push({
        rider: {
          id: ride.user_id,
          clerkId: ride.clerk_id,
          firstName,
          lastName: null,
          videoUrl: null, // TODO: Fetch video URL from storage
          thumbnailUrl: null,
          rating: parseFloat(ride.avg_rating) || 5.0,
          isVerified: ride.is_verified || false,
          gender: ride.gender,
          pronouns: ride.pronouns,
          lgbtqFriendly: ride.lgbtq_friendly || false,
        },
        request: {
          id: ride.ride_id,
          pickupAddress: ride.pickup_address,
          pickupLat: ride.pickup_lat,
          pickupLng: ride.pickup_lng,
          dropoffAddress: ride.dropoff_address,
          dropoffLat: ride.dropoff_lat,
          dropoffLng: ride.dropoff_lng,
          stops: ride.stops ? JSON.parse(ride.stops) : [],
          offerAmount: parseFloat(ride.offer_amount) || 0,
          distance: tripDistance,
          estimatedDuration: Math.round(tripDistance * 3), // 3 min per mile estimate
          note: null, // TODO: Add note field to rides table
          requestedAt: new Date(ride.created_at),
        },
        match: {
          score: riderMatch.matchScore,
          reasons: riderMatch.matchReasons,
          distanceToPickup: riderMatch.distanceToPickup,
          estimatedETA: riderMatch.estimatedETA,
        },
      });
    }

    // Apply pagination
    const paginatedRequests = matchedRequests.slice(offset, offset + limit);
    const hasMore = matchedRequests.length > offset + limit;

    return NextResponse.json({
      success: true,
      requests: paginatedRequests,
      hasMore,
      total: matchedRequests.length,
      page,
    });
  } catch (error) {
    console.error('[FEED] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get ride requests' },
      { status: 500 }
    );
  }
}

// Helper function (duplicate from geo/distance.ts for now)
function calculateDistance(
  point1: { latitude: number; longitude: number },
  point2: { latitude: number; longitude: number }
): number {
  const EARTH_RADIUS_MILES = 3958.8;

  const toRadians = (deg: number) => (deg * Math.PI) / 180;

  const lat1Rad = toRadians(point1.latitude);
  const lat2Rad = toRadians(point2.latitude);
  const latDiff = toRadians(point2.latitude - point1.latitude);
  const lonDiff = toRadians(point2.longitude - point1.longitude);

  const a =
    Math.sin(latDiff / 2) * Math.sin(latDiff / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(lonDiff / 2) *
      Math.sin(lonDiff / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_MILES * c;
}
