// GET /api/rides/nearby-drivers
// Find available drivers near a location

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/guards';
import { findNearbyDrivers } from '@/lib/rides/matching';
import { isValidCoordinates } from '@/lib/geo/distance';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate user
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Parse query parameters
    const { searchParams } = new URL(req.url);
    const latitude = parseFloat(searchParams.get('latitude') || '');
    const longitude = parseFloat(searchParams.get('longitude') || '');
    const radiusMiles = parseFloat(searchParams.get('radius') || '5');
    const vehicleType = searchParams.get('vehicleType') || undefined;

    // 3. Validate coordinates
    if (isNaN(latitude) || isNaN(longitude)) {
      return NextResponse.json(
        { error: 'Valid latitude and longitude required' },
        { status: 400 }
      );
    }

    const coordinates = { latitude, longitude };

    if (!isValidCoordinates(coordinates)) {
      return NextResponse.json(
        { error: 'Invalid coordinates' },
        { status: 400 }
      );
    }

    // 4. Validate radius
    if (isNaN(radiusMiles) || radiusMiles <= 0 || radiusMiles > 25) {
      return NextResponse.json(
        { error: 'Radius must be between 0 and 25 miles' },
        { status: 400 }
      );
    }

    // 5. Find nearby drivers
    const matches = await findNearbyDrivers({
      pickupLocation: coordinates,
      radiusMiles,
      vehicleType: vehicleType as 'sedan' | 'suv' | 'luxury' | undefined,
    });

    // 6. Format response (don't expose sensitive driver info)
    const drivers = matches.map((match) => ({
      vehicleType: match.driver.vehicleType,
      rating: match.driver.rating,
      distanceToPickup: Math.round(match.distanceToPickup * 10) / 10, // Round to 1 decimal
      estimatedETA: match.estimatedETA,
      location: {
        latitude: match.driver.latitude,
        longitude: match.driver.longitude,
      },
    }));

    return NextResponse.json({
      success: true,
      count: drivers.length,
      drivers,
    });
  } catch (error) {
    console.error('[DRIVERS] Nearby search error:', error);

    return NextResponse.json(
      { error: 'Failed to find nearby drivers' },
      { status: 500 }
    );
  }
}
