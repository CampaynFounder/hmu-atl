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
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50'));
  const offset = (page - 1) * limit;

  // Build query with filters — using rides as a ledger proxy since
  // transaction_ledger may not exist yet
  let query = `
    SELECT
      r.id as ride_id, r.status, r.price, r.application_fee,
      r.created_at, r.updated_at,
      dp.first_name as driver_name, dp.handle as driver_handle,
      rp.first_name as rider_name,
      u_driver.tier as driver_tier
    FROM rides r
    LEFT JOIN driver_profiles dp ON dp.user_id = r.driver_id
    LEFT JOIN rider_profiles rp ON rp.user_id = r.rider_id
    LEFT JOIN users u_driver ON u_driver.id = r.driver_id
    WHERE r.status IN ('completed', 'disputed', 'cancelled')
  `;
  const params: unknown[] = [];

  if (rideId) {
    params.push(rideId);
    query += ` AND r.id = $${params.length}`;
  }
  if (userId) {
    params.push(userId);
    query += ` AND (r.driver_id = $${params.length} OR r.rider_id = $${params.length})`;
  }

  query += ` ORDER BY r.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const rows = await sql.unsafe(query, params);

  // Get total count for pagination
  let countQuery = `SELECT COUNT(*) as total FROM rides r WHERE r.status IN ('completed', 'disputed', 'cancelled')`;
  const countParams: unknown[] = [];
  if (rideId) {
    countParams.push(rideId);
    countQuery += ` AND r.id = $${countParams.length}`;
  }
  if (userId) {
    countParams.push(userId);
    countQuery += ` AND (r.driver_id = $${countParams.length} OR r.rider_id = $${countParams.length})`;
  }
  const countRows = await sql.unsafe(countQuery, countParams);

  return NextResponse.json({
    transactions: rows.map((r: Record<string, unknown>) => ({
      rideId: r.ride_id,
      status: r.status,
      amount: Number(r.price ?? 0),
      platformFee: Number(r.application_fee ?? 0),
      stripeFee: Math.round((Number(r.price ?? 0) * 0.029 + 0.30) * 100) / 100,
      driverPayout: Number(r.price ?? 0) - Number(r.application_fee ?? 0) -
        Math.round((Number(r.price ?? 0) * 0.029 + 0.30) * 100) / 100,
      driverName: r.driver_name,
      driverHandle: r.driver_handle,
      riderName: r.rider_name,
      driverTier: r.driver_tier,
      createdAt: r.created_at,
    })),
    pagination: {
      page,
      limit,
      total: Number(countRows[0]?.total ?? 0),
      totalPages: Math.ceil(Number(countRows[0]?.total ?? 0) / limit),
    },
  });
}
