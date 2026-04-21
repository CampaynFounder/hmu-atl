// GET /api/admin/drilldown?type=matched|active|completed|cancelled|disputed|revenue|unconverted|drivers
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const type = req.nextUrl.searchParams.get('type');
  if (!type) return NextResponse.json({ error: 'type param required' }, { status: 400 });

  // Market scope — matches the semantics of /api/admin/stats so card totals
  // equal drill-down list counts. NULL market_id rows are included when a
  // market is selected (legacy data), same as stats does.
  const marketId = req.nextUrl.searchParams.get('marketId');

  switch (type) {
    case 'matched':
    case 'active': {
      const statuses = type === 'matched'
        ? ['matched']
        : ['active', 'otw', 'here', 'confirming'];
      const rows = await sql`
        SELECT
          r.id, r.ref_code, r.status,
          COALESCE(r.final_agreed_price, r.amount) as price,
          r.is_cash, r.pickup_address, r.dropoff_address,
          r.created_at, r.otw_at, r.here_at, r.started_at,
          dp.display_name as driver_name, dp.handle as driver_handle,
          COALESCE(rp.display_name, rp.first_name) as rider_name, rp.handle as rider_handle
        FROM rides r
        LEFT JOIN driver_profiles dp ON dp.user_id = r.driver_id
        LEFT JOIN rider_profiles rp ON rp.user_id = r.rider_id
        WHERE r.status = ANY(${statuses})
          AND (${marketId}::uuid IS NULL OR r.market_id = ${marketId})
        ORDER BY r.created_at DESC
        LIMIT 50
      `;
      return NextResponse.json({
        items: rows.map((r: Record<string, unknown>) => ({
          id: r.id, refCode: r.ref_code, status: r.status,
          price: Number(r.price || 0), isCash: r.is_cash ?? false,
          pickup: r.pickup_address, dropoff: r.dropoff_address,
          driverName: r.driver_name ?? 'Unknown', driverHandle: r.driver_handle,
          riderName: r.rider_name ?? 'Unknown', riderHandle: r.rider_handle,
          createdAt: r.created_at, otwAt: r.otw_at, hereAt: r.here_at, startedAt: r.started_at,
        })),
      });
    }

    case 'completed':
    case 'cancelled':
    case 'disputed': {
      const statuses = type === 'completed' ? ['completed', 'ended'] : [type];
      const rows = await sql`
        SELECT
          r.id, r.ref_code, r.status,
          COALESCE(r.final_agreed_price, r.amount) as price,
          r.is_cash, r.pickup_address, r.dropoff_address,
          r.driver_payout_amount, r.platform_fee_amount,
          r.created_at, r.ended_at,
          dp.display_name as driver_name, dp.handle as driver_handle,
          COALESCE(rp.display_name, rp.first_name) as rider_name, rp.handle as rider_handle
        FROM rides r
        LEFT JOIN driver_profiles dp ON dp.user_id = r.driver_id
        LEFT JOIN rider_profiles rp ON rp.user_id = r.rider_id
        WHERE r.status = ANY(${statuses})
          AND (${marketId}::uuid IS NULL OR r.market_id = ${marketId})
        ORDER BY r.created_at DESC
        LIMIT 50
      `;
      return NextResponse.json({
        items: rows.map((r: Record<string, unknown>) => ({
          id: r.id, refCode: r.ref_code, status: r.status,
          price: Number(r.price || 0), isCash: r.is_cash ?? false,
          pickup: r.pickup_address, dropoff: r.dropoff_address,
          driverPayout: r.driver_payout_amount ? Number(r.driver_payout_amount) : null,
          platformFee: r.platform_fee_amount ? Number(r.platform_fee_amount) : null,
          driverName: r.driver_name ?? 'Unknown', driverHandle: r.driver_handle,
          riderName: r.rider_name ?? 'Unknown', riderHandle: r.rider_handle,
          createdAt: r.created_at, endedAt: r.ended_at,
        })),
      });
    }

    case 'revenue': {
      const rows = await sql`
        SELECT
          r.id, r.ref_code, r.status,
          COALESCE(r.final_agreed_price, r.amount) as price,
          r.is_cash, r.driver_payout_amount, r.platform_fee_amount,
          r.created_at, r.ended_at,
          dp.display_name as driver_name,
          COALESCE(rp.display_name, rp.first_name) as rider_name
        FROM rides r
        LEFT JOIN driver_profiles dp ON dp.user_id = r.driver_id
        LEFT JOIN rider_profiles rp ON rp.user_id = r.rider_id
        WHERE r.status IN ('completed', 'ended')
          AND (${marketId}::uuid IS NULL OR r.market_id = ${marketId})
        ORDER BY COALESCE(r.final_agreed_price, r.amount) DESC
        LIMIT 50
      `;
      return NextResponse.json({
        items: rows.map((r: Record<string, unknown>) => ({
          id: r.id, refCode: r.ref_code, status: r.status,
          price: Number(r.price || 0), isCash: r.is_cash ?? false,
          driverPayout: r.driver_payout_amount ? Number(r.driver_payout_amount) : null,
          platformFee: r.platform_fee_amount ? Number(r.platform_fee_amount) : null,
          driverName: r.driver_name ?? 'Unknown',
          riderName: r.rider_name ?? 'Unknown',
          createdAt: r.created_at, endedAt: r.ended_at,
        })),
      });
    }

    case 'unconverted': {
      const rows = await sql`
        SELECT
          u.id, u.profile_type, u.created_at, u.account_status, u.phone,
          COALESCE(rp.display_name, rp.first_name, dp.display_name, dp.first_name) as name,
          COALESCE(rp.handle, dp.handle) as handle
        FROM users u
        LEFT JOIN rider_profiles rp ON rp.user_id = u.id
        LEFT JOIN driver_profiles dp ON dp.user_id = u.id
        WHERE u.completed_rides = 0 AND u.account_status = 'active'
          AND (${marketId}::uuid IS NULL OR u.market_id = ${marketId})
        ORDER BY u.created_at DESC
        LIMIT 50
      `;
      return NextResponse.json({
        items: rows.map((r: Record<string, unknown>) => ({
          id: r.id, name: r.name ?? 'Unknown', handle: r.handle,
          phone: r.phone, profileType: r.profile_type,
          accountStatus: r.account_status, createdAt: r.created_at,
        })),
      });
    }

    case 'abandoned': {
      const rows = await sql`
        SELECT
          u.id, u.clerk_id, u.profile_type, u.created_at, u.account_status,
          u.phone, u.signup_source,
          COALESCE(rp.display_name, rp.first_name, dp.display_name, dp.first_name) as name,
          COALESCE(rp.handle, dp.handle) as handle
        FROM users u
        LEFT JOIN rider_profiles rp ON rp.user_id = u.id
        LEFT JOIN driver_profiles dp ON dp.user_id = u.id
        WHERE u.completed_rides = 0 AND u.account_status = 'pending_activation'
          AND (${marketId}::uuid IS NULL OR u.market_id = ${marketId})
        ORDER BY u.created_at DESC
        LIMIT 100
      `;
      return NextResponse.json({
        items: rows.map((r: Record<string, unknown>) => ({
          id: r.id, clerkId: r.clerk_id, name: r.name ?? 'Unknown', handle: r.handle,
          phone: r.phone, profileType: r.profile_type,
          signupSource: r.signup_source ?? 'unknown',
          accountStatus: r.account_status, createdAt: r.created_at,
        })),
      });
    }

    case 'drivers': {
      const rows = await sql`
        SELECT
          dp.display_name as name, dp.handle,
          r.id as ride_id, r.ref_code, r.status,
          COALESCE(r.final_agreed_price, r.amount) as price,
          COALESCE(rp.display_name, rp.first_name) as rider_name,
          r.created_at
        FROM rides r
        JOIN driver_profiles dp ON dp.user_id = r.driver_id
        LEFT JOIN rider_profiles rp ON rp.user_id = r.rider_id
        WHERE r.status IN ('matched', 'otw', 'here', 'confirming', 'active')
          AND (${marketId}::uuid IS NULL OR r.market_id = ${marketId})
        ORDER BY r.created_at DESC
        LIMIT 50
      `;
      return NextResponse.json({
        items: rows.map((r: Record<string, unknown>) => ({
          name: r.name ?? 'Unknown', handle: r.handle,
          rideId: r.ride_id, refCode: r.ref_code, status: r.status,
          price: Number(r.price || 0),
          riderName: r.rider_name ?? 'Unknown',
          createdAt: r.created_at,
        })),
      });
    }

    default:
      return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
  }
}
