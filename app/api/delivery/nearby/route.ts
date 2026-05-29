// GET /api/delivery/nearby
// Returns active delivery opportunities near the courier's current location.
// Includes full payout breakdown for each opportunity.

import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RADIUS_MILES = 10;
const KM_PER_MILE = 1.60934;
const RADIUS_KM = RADIUS_MILES * KM_PER_MILE;
const EARTH_RADIUS_KM = 6371;

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.profile_type !== 'driver') {
      return NextResponse.json({ error: 'Only couriers can browse deliveries' }, { status: 403 });
    }

    const url = new URL(req.url);
    const lat = parseFloat(url.searchParams.get('lat') ?? '');
    const lng = parseFloat(url.searchParams.get('lng') ?? '');

    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json({ error: 'lat and lng required' }, { status: 400 });
    }

    const { rows } = await pool.query(
      `SELECT
        dr.id,
        dr.merchant_name AS "merchantName",
        dr.merchant_address AS "merchantAddress",
        dr.customer_address AS "customerAddress",
        dr.estimated_merchant_spend_cents AS "estimatedMerchantSpendCents",
        dr.delivery_fee_cents AS "deliveryFeeCents",
        dr.platform_fee_cents AS "platformFeeCents",
        dr.expires_at AS "expiresAt",
        dr.created_at AS "createdAt",
        -- haversine distance in miles from courier to merchant
        (
          $3 * ACOS(
            LEAST(1.0, COS(RADIANS($1)) * COS(RADIANS(dr.merchant_lat))
            * COS(RADIANS(dr.merchant_lng) - RADIANS($2))
            + SIN(RADIANS($1)) * SIN(RADIANS(dr.merchant_lat)))
          )
        ) / $4 AS "distanceMiles",
        -- item summary
        (SELECT JSON_AGG(JSON_BUILD_OBJECT('name', name, 'quantity', quantity) ORDER BY created_at)
         FROM delivery_items WHERE delivery_id = dr.id) AS items,
        (SELECT COUNT(*) FROM delivery_items WHERE delivery_id = dr.id)::INT AS "itemCount"
      FROM delivery_requests dr
      WHERE dr.status = 'pending'
        AND dr.expires_at > NOW()
        AND dr.courier_id IS NULL
        AND (
          $3 * ACOS(
            LEAST(1.0, COS(RADIANS($1)) * COS(RADIANS(dr.merchant_lat))
            * COS(RADIANS(dr.merchant_lng) - RADIANS($2))
            + SIN(RADIANS($1)) * SIN(RADIANS(dr.merchant_lat)))
          )
        ) <= $5
      ORDER BY "distanceMiles" ASC
      LIMIT 30`,
      [lat, lng, EARTH_RADIUS_KM, KM_PER_MILE, RADIUS_KM],
    );

    const opportunities = rows.map((row: any) => {
      const courierEarnCents = row.deliveryFeeCents - row.platformFeeCents;
      const courierAdvanceCents = row.estimatedMerchantSpendCents;
      return {
        id: row.id,
        merchantName: row.merchantName,
        merchantAddress: row.merchantAddress,
        customerAreaSlug: row.customerAddress,
        items: row.items ?? [],
        itemCount: row.itemCount ?? 0,
        estimatedMerchantSpend: row.estimatedMerchantSpendCents / 100,
        deliveryFee: row.deliveryFeeCents / 100,
        courierEarn: courierEarnCents / 100,
        courierAdvance: courierAdvanceCents / 100,
        courierGuaranteed: (courierEarnCents + courierAdvanceCents) / 100,
        distanceMiles: Math.round((row.distanceMiles ?? 0) * 10) / 10,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
      };
    });

    return NextResponse.json({ opportunities });
  } catch (err) {
    console.error('[delivery/nearby]', err);
    return NextResponse.json({ error: 'Failed to load opportunities' }, { status: 500 });
  }
}
