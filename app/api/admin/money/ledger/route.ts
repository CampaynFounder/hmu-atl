// GET /api/admin/money/ledger — Transaction ledger viewer
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { searchParams } = req.nextUrl;
  const rideId = searchParams.get('ride_id');
  const userId = searchParams.get('user_id');

  try {
    let rows;
    if (rideId) {
      rows = await sql`
        SELECT r.id as ride_id, r.status,
          COALESCE(r.final_agreed_price, r.amount) as amount,
          COALESCE(r.platform_fee_amount, 0) as platform_fee,
          COALESCE(r.stripe_fee_amount, 0) as stripe_fee,
          COALESCE(r.driver_payout_amount, 0) as driver_payout,
          COALESCE(r.waived_fee_amount, 0) as waived_fee,
          r.is_cash, r.created_at,
          COALESCE(dp.display_name, dp.first_name) as driver_name, dp.handle as driver_handle,
          COALESCE(rp.display_name, rp.first_name) as rider_name,
          u_driver.tier as driver_tier
        FROM rides r
        LEFT JOIN driver_profiles dp ON dp.user_id = r.driver_id
        LEFT JOIN rider_profiles rp ON rp.user_id = r.rider_id
        LEFT JOIN users u_driver ON u_driver.id = r.driver_id
        WHERE r.id = ${rideId}
        ORDER BY r.created_at DESC LIMIT 50
      `;
    } else if (userId) {
      rows = await sql`
        SELECT r.id as ride_id, r.status,
          COALESCE(r.final_agreed_price, r.amount) as amount,
          COALESCE(r.platform_fee_amount, 0) as platform_fee,
          COALESCE(r.stripe_fee_amount, 0) as stripe_fee,
          COALESCE(r.driver_payout_amount, 0) as driver_payout,
          COALESCE(r.waived_fee_amount, 0) as waived_fee,
          r.is_cash, r.created_at,
          COALESCE(dp.display_name, dp.first_name) as driver_name, dp.handle as driver_handle,
          COALESCE(rp.display_name, rp.first_name) as rider_name,
          u_driver.tier as driver_tier
        FROM rides r
        LEFT JOIN driver_profiles dp ON dp.user_id = r.driver_id
        LEFT JOIN rider_profiles rp ON rp.user_id = r.rider_id
        LEFT JOIN users u_driver ON u_driver.id = r.driver_id
        WHERE r.driver_id = ${userId} OR r.rider_id = ${userId}
        ORDER BY r.created_at DESC LIMIT 50
      `;
    } else {
      rows = await sql`
        SELECT r.id as ride_id, r.status,
          COALESCE(r.final_agreed_price, r.amount) as amount,
          COALESCE(r.platform_fee_amount, 0) as platform_fee,
          COALESCE(r.stripe_fee_amount, 0) as stripe_fee,
          COALESCE(r.driver_payout_amount, 0) as driver_payout,
          COALESCE(r.waived_fee_amount, 0) as waived_fee,
          r.is_cash, r.created_at,
          COALESCE(dp.display_name, dp.first_name) as driver_name, dp.handle as driver_handle,
          COALESCE(rp.display_name, rp.first_name) as rider_name,
          u_driver.tier as driver_tier
        FROM rides r
        LEFT JOIN driver_profiles dp ON dp.user_id = r.driver_id
        LEFT JOIN rider_profiles rp ON rp.user_id = r.rider_id
        LEFT JOIN users u_driver ON u_driver.id = r.driver_id
        ORDER BY r.created_at DESC LIMIT 50
      `;
    }

    return NextResponse.json({
      transactions: rows.map((r: Record<string, unknown>) => ({
        rideId: r.ride_id,
        status: r.status,
        amount: Number(r.amount ?? 0),
        platformFee: Number(r.platform_fee ?? 0),
        stripeFee: Number(r.stripe_fee ?? 0),
        driverPayout: Number(r.driver_payout ?? 0),
        waivedFee: Number(r.waived_fee ?? 0),
        isCash: r.is_cash,
        driverName: r.driver_name,
        driverHandle: r.driver_handle,
        riderName: r.rider_name,
        driverTier: r.driver_tier,
        createdAt: r.created_at,
      })),
      pagination: { page: 1, limit: 50, total: rows.length, totalPages: 1 },
    });
  } catch (error) {
    console.error('Ledger error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
