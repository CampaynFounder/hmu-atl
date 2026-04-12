import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import { clerkClient } from '@clerk/nextjs/server';

/**
 * POST /api/admin/users/delete
 * Delete one or more incomplete/abandoned users from both Clerk and Neon.
 * Safety: only deletes users in pending_activation status with 0 completed rides.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  try {
    const { userIds } = await req.json() as { userIds: string[] };

    if (!userIds?.length) {
      return NextResponse.json({ error: 'No users specified' }, { status: 400 });
    }

    if (userIds.length > 50) {
      return NextResponse.json({ error: 'Max 50 users per batch' }, { status: 400 });
    }

    // Safety check: only fetch users that are pending_activation with 0 rides
    const safeUsers = await sql`
      SELECT id, clerk_id, profile_type, account_status, completed_rides
      FROM users
      WHERE id = ANY(${userIds})
        AND account_status = 'pending_activation'
        AND completed_rides = 0
    `;

    if (!safeUsers.length) {
      return NextResponse.json({ error: 'No eligible users found (must be pending_activation with 0 rides)' }, { status: 400 });
    }

    const results: { id: string; clerkId: string; clerkDeleted: boolean; neonDeleted: boolean }[] = [];

    for (const user of safeUsers) {
      const u = user as { id: string; clerk_id: string; profile_type: string };
      let clerkDeleted = false;
      let neonDeleted = false;

      // Delete from Clerk
      try {
        const clerk = await clerkClient();
        await clerk.users.deleteUser(u.clerk_id);
        clerkDeleted = true;
      } catch (err: unknown) {
        // User may already be deleted from Clerk
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.includes('not found') || errMsg.includes('404')) {
          clerkDeleted = true; // Already gone
        } else {
          console.error(`Failed to delete Clerk user ${u.clerk_id}:`, err);
        }
      }

      // Delete from Neon (cascades to profiles, rides, etc.)
      try {
        const del = await sql`DELETE FROM users WHERE id = ${u.id} RETURNING id`;
        neonDeleted = del.length > 0;
      } catch (err) {
        console.error(`Failed to delete Neon user ${u.id}:`, err);
      }

      results.push({ id: u.id, clerkId: u.clerk_id, clerkDeleted, neonDeleted });
    }

    const deletedCount = results.filter(r => r.neonDeleted).length;

    // Audit log
    await logAdminAction(
      admin.id,
      'delete_incomplete_users',
      'user',
      `batch_${deletedCount}`,
      { count: deletedCount, userIds: results.filter(r => r.neonDeleted).map(r => r.id) },
    ).catch(() => {});

    return NextResponse.json({
      deleted: deletedCount,
      skipped: userIds.length - safeUsers.length,
      results,
    });
  } catch (error) {
    console.error('Delete users error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
