import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

async function requireAdmin() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const rows = await sql`
    SELECT id, profile_type FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `;
  if (!rows.length || rows[0].profile_type !== 'admin') return null;
  return rows[0];
}

/**
 * GET /api/admin/users — list users with optional search
 * ?search=name&type=driver|rider&status=active|suspended
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const search = searchParams.get('search');
  const type = searchParams.get('type');
  const status = searchParams.get('status');

  let query = `
    SELECT u.id, u.clerk_id, u.profile_type, u.account_status, u.tier,
           u.completed_rides, u.dispute_count, u.created_at,
           dp.display_name as driver_name, dp.phone as driver_phone,
           rp.display_name as rider_name, rp.phone as rider_phone
    FROM users u
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
    LEFT JOIN rider_profiles rp ON rp.user_id = u.id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (search) {
    params.push(`%${search}%`);
    const p = params.length;
    query += ` AND (dp.display_name ILIKE $${p} OR rp.display_name ILIKE $${p} OR dp.phone ILIKE $${p} OR rp.phone ILIKE $${p} OR u.clerk_id ILIKE $${p})`;
  }
  if (type) {
    params.push(type);
    query += ` AND u.profile_type = $${params.length}`;
  }
  if (status) {
    params.push(status);
    query += ` AND u.account_status = $${params.length}`;
  }

  query += ` ORDER BY u.created_at DESC LIMIT 50`;

  const rows = await sql.unsafe(query, params);

  const users = rows.map((r: Record<string, unknown>) => ({
    id: r.id,
    clerkId: r.clerk_id,
    profileType: r.profile_type,
    accountStatus: r.account_status,
    tier: r.tier,
    displayName: r.driver_name || r.rider_name || 'No name',
    phone: r.driver_phone || r.rider_phone || null,
    completedRides: r.completed_rides,
    disputeCount: r.dispute_count,
    createdAt: r.created_at,
  }));

  return NextResponse.json({ users });
}

/**
 * PATCH /api/admin/users — update user status
 * { userId, action: 'suspend' | 'activate' | 'ban' }
 */
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

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
    return NextResponse.json({ error: 'Invalid action. Use: suspend, activate, ban' }, { status: 400 });
  }

  const rows = await sql`
    UPDATE users SET account_status = ${newStatus}, updated_at = NOW()
    WHERE id = ${userId}
    RETURNING id, clerk_id, account_status
  `;

  if (!rows.length) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Sync to Clerk metadata
  const user = rows[0];
  try {
    const clerk = await clerkClient();
    await clerk.users.updateUserMetadata(user.clerk_id as string, {
      publicMetadata: { accountStatus: newStatus },
    });
  } catch {
    // Non-critical — Neon is source of truth
  }

  return NextResponse.json({ success: true, userId, status: newStatus });
}

/**
 * DELETE /api/admin/users — fully delete a user from Neon + Clerk
 * { userId } or { clerkId }
 */
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { userId, clerkId: inputClerkId } = await req.json();

  // Find the user
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

  // Delete all references — query FK constraints dynamically so new tables are covered
  const fkRows = await sql`
    SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'users'
      AND ccu.column_name = 'id'
  `;

  // Delete from each referencing table (skip cascade-handled ones)
  for (const fk of fkRows) {
    const table = fk.table_name as string;
    const column = fk.column_name as string;
    // Skip tables with ON DELETE CASCADE (profiles, notifications, hmu_posts)
    // — they'll be handled when we delete the user
    if (['driver_profiles', 'rider_profiles', 'notifications', 'hmu_posts'].includes(table)) continue;
    await sql.unsafe(`DELETE FROM ${table} WHERE ${column} = $1`, [neonId]);
  }

  // Delete the user (cascades to profiles, notifications, hmu_posts)
  await sql`DELETE FROM users WHERE id = ${neonId}`;

  // Delete from Clerk
  try {
    const clerk = await clerkClient();
    await clerk.users.deleteUser(clerkId);
  } catch {
    // May already be deleted
  }

  return NextResponse.json({ success: true, deleted: { neonId, clerkId } });
}
