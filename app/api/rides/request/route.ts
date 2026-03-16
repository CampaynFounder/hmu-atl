// POST /api/rides/request
// Rider creates a new ride request

import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/guards';
import { isValidCoordinates, isInAtlantaMetro, calculateDistance, estimateETA } from '@/lib/geo/distance';
import { calculateFare, createEscrow, validateEscrowParams } from '@/lib/payments/escrow';
import { notifyNearbyDrivers, checkMatchRateLimit } from '@/lib/rides/matching';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Request validation schema
const RequestRideSchema = z.object({
  pickupLatitude: z.number().min(-90).max(90),
  pickupLongitude: z.number().min(-180).max(180),
  pickupAddress: z.string().min(1).max(500),
  dropoffLatitude: z.number().min(-90).max(90),
  dropoffLongitude: z.number().min(-180).max(180),
  dropoffAddress: z.string().min(1).max(500),
  vehicleType: z.enum(['sedan', 'suv', 'luxury']).optional(),
  passengerCount: z.number().int().min(1).max(6).default(1),
  notes: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Validate user is a rider
    if (!user.profile_type || !['rider', 'both'].includes(user.profile_type)) {
      return NextResponse.json(
        { error: 'Only riders can request rides' },
        { status: 403 }
      );
    }

    // 3. Check account status
    if (user.account_status !== 'active') {
      return NextResponse.json(
        { error: 'Account must be active to request rides' },
        { status: 403 }
      );
    }

    // 4. Rate limiting
    if (!checkMatchRateLimit(user.id)) {
      return NextResponse.json(
        { error: 'Too many ride requests. Please wait and try again.' },
        { status: 429 }
      );
    }

    // 5. Parse and validate request body
    const body = await req.json();
    const validated = RequestRideSchema.parse(body);

    const pickupLocation = {
      latitude: validated.pickupLatitude,
      longitude: validated.pickupLongitude,
    };

    const dropoffLocation = {
      latitude: validated.dropoffLatitude,
      longitude: validated.dropoffLongitude,
    };

    // 6. Validate coordinates
    if (!isValidCoordinates(pickupLocation) || !isValidCoordinates(dropoffLocation)) {
      return NextResponse.json(
        { error: 'Invalid coordinates' },
        { status: 400 }
      );
    }

    // 7. Validate Atlanta metro area
    if (!isInAtlantaMetro(pickupLocation) || !isInAtlantaMetro(dropoffLocation)) {
      return NextResponse.json(
        { error: 'Service only available in Atlanta metro area' },
        { status: 400 }
      );
    }

    // 8. Calculate distance and fare
    const distanceMiles = calculateDistance(pickupLocation, dropoffLocation);

    if (distanceMiles < 0.5) {
      return NextResponse.json(
        { error: 'Ride distance too short (minimum 0.5 miles)' },
        { status: 400 }
      );
    }

    if (distanceMiles > 50) {
      return NextResponse.json(
        { error: 'Ride distance too long (maximum 50 miles)' },
        { status: 400 }
      );
    }

    const estimatedMinutes = estimateETA(distanceMiles);
    const fareBreakdown = calculateFare({
      distanceMiles,
      estimatedMinutes,
    });

    // 9. Check for Stripe customer
    const userResult = await pool.query(
      'SELECT stripe_customer_id FROM users WHERE id = $1',
      [user.id]
    );

    if (!userResult.rows[0]?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'Payment method not configured' },
        { status: 400 }
      );
    }

    const stripeCustomerId = userResult.rows[0].stripe_customer_id;

    // 10. Create ride record
    const rideResult = await pool.query(
      `INSERT INTO rides (
        rider_id,
        pickup_latitude,
        pickup_longitude,
        pickup_address,
        dropoff_latitude,
        dropoff_longitude,
        dropoff_address,
        vehicle_type,
        passenger_count,
        estimated_distance,
        estimated_duration,
        estimated_fare,
        status,
        notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending', $13)
      RETURNING id, created_at`,
      [
        user.id,
        validated.pickupLatitude,
        validated.pickupLongitude,
        validated.pickupAddress,
        validated.dropoffLatitude,
        validated.dropoffLongitude,
        validated.dropoffAddress,
        validated.vehicleType || 'sedan',
        validated.passengerCount,
        distanceMiles,
        estimatedMinutes,
        fareBreakdown.total,
        validated.notes || null,
      ]
    );

    const rideId = rideResult.rows[0].id;

    // 11. Notify nearby drivers (async, don't wait)
    notifyNearbyDrivers({
      rideId,
      pickupLocation,
      dropoffLocation,
      estimatedFare: fareBreakdown.total,
    }).catch((err) => {
      console.error('[RIDES] Failed to notify drivers:', err);
    });

    // 12. Return ride details
    return NextResponse.json({
      success: true,
      ride: {
        id: rideId,
        status: 'pending',
        pickupAddress: validated.pickupAddress,
        dropoffAddress: validated.dropoffAddress,
        estimatedDistance: distanceMiles,
        estimatedDuration: estimatedMinutes,
        fare: {
          baseFare: fareBreakdown.baseFare,
          distanceFee: fareBreakdown.distanceFee,
          timeFee: fareBreakdown.timeFee,
          total: fareBreakdown.total,
        },
        createdAt: rideResult.rows[0].created_at,
      },
    });
  } catch (error) {
    console.error('[RIDES] Request error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create ride request' },
      { status: 500 }
    );
  }
}
