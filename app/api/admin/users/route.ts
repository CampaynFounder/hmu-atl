import { NextRequest, NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';

/**
 * GET /api/admin/users — list users with optional search
 * ?search=name&type=driver|rider&status=active|suspended
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { searchParams } = req.nextUrl;
  const search = searchParams.get('search');
  const type = searchParams.get('type');
  const status = searchParams.get('status');
  const marketId = searchParams.get('marketId');
  const visibility = searchParams.get('visibility'); // 'visible' | 'hidden' | null (drivers only)
  const visibilityBool: boolean | null =
    visibility === 'visible' ? true : visibility === 'hidden' ? false : null;

  try {
    // Build filtered query — use separate queries instead of sql.unsafe
    let rows;
    if (search && type && status) {
      const pattern = `%${search}%`;
      rows = await sql`
        SELECT u.id, u.clerk_id, u.profile_type, u.account_status, u.tier,
               COALESCE(u.completed_rides, 0) as completed_rides,
               u.created_at,
               COALESCE(dp.display_name, dp.first_name) as driver_name, dp.phone as driver_phone,
               COALESCE(rp.display_name, rp.first_name) as rider_name,
               CASE u.profile_type
                 WHEN 'driver' THEN dp.profile_visible
                 WHEN 'rider'  THEN rp.profile_visible
                 ELSE NULL
               END AS profile_visible
        FROM users u
        LEFT JOIN driver_profiles dp ON dp.user_id = u.id
        LEFT JOIN rider_profiles rp ON rp.user_id = u.id
        WHERE u.profile_type = ${type}
          AND u.account_status = ${status}
          AND (dp.display_name ILIKE ${pattern} OR dp.first_name ILIKE ${pattern}
               OR rp.display_name ILIKE ${pattern} OR rp.first_name ILIKE ${pattern}
               OR dp.phone ILIKE ${pattern} OR u.clerk_id ILIKE ${pattern})
          AND (${marketId}::uuid IS NULL OR u.market_id = ${marketId})
          AND (${visibilityBool}::boolean IS NULL OR
               (u.profile_type = 'driver' AND dp.profile_visible = ${visibilityBool}) OR
               (u.profile_type = 'rider'  AND rp.profile_visible = ${visibilityBool}))
        ORDER BY u.created_at DESC LIMIT 50
      `;
    } else if (search && type) {
      const pattern = `%${search}%`;
      rows = await sql`
        SELECT u.id, u.clerk_id, u.profile_type, u.account_status, u.tier,
               COALESCE(u.completed_rides, 0) as completed_rides,
               u.created_at,
               COALESCE(dp.display_name, dp.first_name) as driver_name, dp.phone as driver_phone,
               COALESCE(rp.display_name, rp.first_name) as rider_name,
               CASE u.profile_type
                 WHEN 'driver' THEN dp.profile_visible
                 WHEN 'rider'  THEN rp.profile_visible
                 ELSE NULL
               END AS profile_visible
        FROM users u
        LEFT JOIN driver_profiles dp ON dp.user_id = u.id
        LEFT JOIN rider_profiles rp ON rp.user_id = u.id
        WHERE u.profile_type = ${type}
          AND (dp.display_name ILIKE ${pattern} OR dp.first_name ILIKE ${pattern}
               OR rp.display_name ILIKE ${pattern} OR rp.first_name ILIKE ${pattern}
               OR dp.phone ILIKE ${pattern} OR u.clerk_id ILIKE ${pattern})
          AND (${marketId}::uuid IS NULL OR u.market_id = ${marketId})
          AND (${visibilityBool}::boolean IS NULL OR
               (u.profile_type = 'driver' AND dp.profile_visible = ${visibilityBool}) OR
               (u.profile_type = 'rider'  AND rp.profile_visible = ${visibilityBool}))
        ORDER BY u.created_at DESC LIMIT 50
      `;
    } else if (search && status) {
      const pattern = `%${search}%`;
      rows = await sql`
        SELECT u.id, u.clerk_id, u.profile_type, u.account_status, u.tier,
               COALESCE(u.completed_rides, 0) as completed_rides,
               u.created_at,
               COALESCE(dp.display_name, dp.first_name) as driver_name, dp.phone as driver_phone,
               COALESCE(rp.display_name, rp.first_name) as rider_name,
               CASE u.profile_type
                 WHEN 'driver' THEN dp.profile_visible
                 WHEN 'rider'  THEN rp.profile_visible
                 ELSE NULL
               END AS profile_visible
        FROM users u
        LEFT JOIN driver_profiles dp ON dp.user_id = u.id
        LEFT JOIN rider_profiles rp ON rp.user_id = u.id
        WHERE u.account_status = ${status}
          AND (dp.display_name ILIKE ${pattern} OR dp.first_name ILIKE ${pattern}
               OR rp.display_name ILIKE ${pattern} OR rp.first_name ILIKE ${pattern}
               OR dp.phone ILIKE ${pattern} OR u.clerk_id ILIKE ${pattern})
          AND (${marketId}::uuid IS NULL OR u.market_id = ${marketId})
          AND (${visibilityBool}::boolean IS NULL OR
               (u.profile_type = 'driver' AND dp.profile_visible = ${visibilityBool}) OR
               (u.profile_type = 'rider'  AND rp.profile_visible = ${visibilityBool}))
        ORDER BY u.created_at DESC LIMIT 50
      `;
    } else if (type && status) {
      rows = await sql`
        SELECT u.id, u.clerk_id, u.profile_type, u.account_status, u.tier,
               COALESCE(u.completed_rides, 0) as completed_rides,
               u.created_at,
               COALESCE(dp.display_name, dp.first_name) as driver_name, dp.phone as driver_phone,
               COALESCE(rp.display_name, rp.first_name) as rider_name,
               CASE u.profile_type
                 WHEN 'driver' THEN dp.profile_visible
                 WHEN 'rider'  THEN rp.profile_visible
                 ELSE NULL
               END AS profile_visible
        FROM users u
        LEFT JOIN driver_profiles dp ON dp.user_id = u.id
        LEFT JOIN rider_profiles rp ON rp.user_id = u.id
        WHERE u.profile_type = ${type} AND u.account_status = ${status}
          AND (${marketId}::uuid IS NULL OR u.market_id = ${marketId})
          AND (${visibilityBool}::boolean IS NULL OR
               (u.profile_type = 'driver' AND dp.profile_visible = ${visibilityBool}) OR
               (u.profile_type = 'rider'  AND rp.profile_visible = ${visibilityBool}))
        ORDER BY u.created_at DESC LIMIT 50
      `;
    } else if (search) {
      const pattern = `%${search}%`;
      rows = await sql`
        SELECT u.id, u.clerk_id, u.profile_type, u.account_status, u.tier,
               COALESCE(u.completed_rides, 0) as completed_rides,
               u.created_at,
               COALESCE(dp.display_name, dp.first_name) as driver_name, dp.phone as driver_phone,
               COALESCE(rp.display_name, rp.first_name) as rider_name,
               CASE u.profile_type
                 WHEN 'driver' THEN dp.profile_visible
                 WHEN 'rider'  THEN rp.profile_visible
                 ELSE NULL
               END AS profile_visible
        FROM users u
        LEFT JOIN driver_profiles dp ON dp.user_id = u.id
        LEFT JOIN rider_profiles rp ON rp.user_id = u.id
        WHERE (dp.display_name ILIKE ${pattern} OR dp.first_name ILIKE ${pattern}
              OR rp.display_name ILIKE ${pattern} OR rp.first_name ILIKE ${pattern}
              OR dp.phone ILIKE ${pattern} OR u.clerk_id ILIKE ${pattern})
          AND (${marketId}::uuid IS NULL OR u.market_id = ${marketId})
          AND (${visibilityBool}::boolean IS NULL OR
               (u.profile_type = 'driver' AND dp.profile_visible = ${visibilityBool}) OR
               (u.profile_type = 'rider'  AND rp.profile_visible = ${visibilityBool}))
        ORDER BY u.created_at DESC LIMIT 50
      `;
    } else if (type) {
      rows = await sql`
        SELECT u.id, u.clerk_id, u.profile_type, u.account_status, u.tier,
               COALESCE(u.completed_rides, 0) as completed_rides,
               u.created_at,
               COALESCE(dp.display_name, dp.first_name) as driver_name, dp.phone as driver_phone,
               COALESCE(rp.display_name, rp.first_name) as rider_name,
               CASE u.profile_type
                 WHEN 'driver' THEN dp.profile_visible
                 WHEN 'rider'  THEN rp.profile_visible
                 ELSE NULL
               END AS profile_visible
        FROM users u
        LEFT JOIN driver_profiles dp ON dp.user_id = u.id
        LEFT JOIN rider_profiles rp ON rp.user_id = u.id
        WHERE u.profile_type = ${type}
          AND (${marketId}::uuid IS NULL OR u.market_id = ${marketId})
          AND (${visibilityBool}::boolean IS NULL OR
               (u.profile_type = 'driver' AND dp.profile_visible = ${visibilityBool}) OR
               (u.profile_type = 'rider'  AND rp.profile_visible = ${visibilityBool}))
        ORDER BY u.created_at DESC LIMIT 50
      `;
    } else if (status) {
      rows = await sql`
        SELECT u.id, u.clerk_id, u.profile_type, u.account_status, u.tier,
               COALESCE(u.completed_rides, 0) as completed_rides,
               u.created_at,
               COALESCE(dp.display_name, dp.first_name) as driver_name, dp.phone as driver_phone,
               COALESCE(rp.display_name, rp.first_name) as rider_name,
               CASE u.profile_type
                 WHEN 'driver' THEN dp.profile_visible
                 WHEN 'rider'  THEN rp.profile_visible
                 ELSE NULL
               END AS profile_visible
        FROM users u
        LEFT JOIN driver_profiles dp ON dp.user_id = u.id
        LEFT JOIN rider_profiles rp ON rp.user_id = u.id
        WHERE u.account_status = ${status}
          AND (${marketId}::uuid IS NULL OR u.market_id = ${marketId})
          AND (${visibilityBool}::boolean IS NULL OR
               (u.profile_type = 'driver' AND dp.profile_visible = ${visibilityBool}) OR
               (u.profile_type = 'rider'  AND rp.profile_visible = ${visibilityBool}))
        ORDER BY u.created_at DESC LIMIT 50
      `;
    } else {
      rows = await sql`
        SELECT u.id, u.clerk_id, u.profile_type, u.account_status, u.tier,
               COALESCE(u.completed_rides, 0) as completed_rides,
               u.created_at,
               COALESCE(dp.display_name, dp.first_name) as driver_name, dp.phone as driver_phone,
               COALESCE(rp.display_name, rp.first_name) as rider_name,
               CASE u.profile_type
                 WHEN 'driver' THEN dp.profile_visible
                 WHEN 'rider'  THEN rp.profile_visible
                 ELSE NULL
               END AS profile_visible
        FROM users u
        LEFT JOIN driver_profiles dp ON dp.user_id = u.id
        LEFT JOIN rider_profiles rp ON rp.user_id = u.id
        WHERE (${marketId}::uuid IS NULL OR u.market_id = ${marketId})
          AND (${visibilityBool}::boolean IS NULL OR
               (u.profile_type = 'driver' AND dp.profile_visible = ${visibilityBool}) OR
               (u.profile_type = 'rider'  AND rp.profile_visible = ${visibilityBool}))
        ORDER BY u.created_at DESC LIMIT 50
      `;
    }

    const users = rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      clerkId: r.clerk_id,
      profileType: r.profile_type,
      accountStatus: r.account_status,
      tier: r.tier,
      displayName: r.driver_name || r.rider_name || 'No name',
      phone: r.driver_phone || null,
      completedRides: Number(r.completed_rides ?? 0),
      disputeCount: 0,
      createdAt: r.created_at,
      profileVisible: r.profile_visible ?? null,
    }));

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Admin users GET error:', error);
    return NextResponse.json({ error: 'Internal server error', details: String(error) }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/users — update user status
 */
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { userId, action } = await req.json();
  if (!userId || !action) {
    return NextResponse.json({ error: 'userId and action required' }, { status: 400 });
  }

  const statusMap: Record<string, string> = {
    suspend: 'suspended',
    activate: 'active',
    ban: 'suspended',
  };

  const newStatus = statusMap[action];
  if (!newStatus) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const rows = await sql`
    UPDATE users SET account_status = ${newStatus}, updated_at = NOW()
    WHERE id = ${userId}
    RETURNING id, clerk_id, account_status
  `;

  if (!rows.length) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  try {
    const clerk = await clerkClient();
    await clerk.users.updateUserMetadata(rows[0].clerk_id as string, {
      publicMetadata: { accountStatus: newStatus },
    });
  } catch {
    // Non-critical
  }

  return NextResponse.json({ success: true, userId, status: newStatus });
}

/**
 * DELETE /api/admin/users — fully delete a user
 */
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { userId, clerkId: inputClerkId } = await req.json();

  let userRows;
  if (userId) {
    userRows = await sql`SELECT id, clerk_id FROM users WHERE id = ${userId}`;
  } else if (inputClerkId) {
    userRows = await sql`SELECT id, clerk_id FROM users WHERE clerk_id = ${inputClerkId}`;
  } else {
    return NextResponse.json({ error: 'userId or clerkId required' }, { status: 400 });
  }

  if (!userRows.length) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const user = userRows[0];
  const neonId = user.id as string;
  const clerkId = user.clerk_id as string;

  await sql`DELETE FROM users WHERE id = ${neonId}`;

  try {
    const clerk = await clerkClient();
    await clerk.users.deleteUser(clerkId);
  } catch {
    // May already be deleted
  }

  return NextResponse.json({ success: true, deleted: { neonId, clerkId } });
}
