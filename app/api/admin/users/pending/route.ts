// GET /api/admin/users/pending — Drivers awaiting video review
// PATCH /api/admin/users/pending — Approve or reject a pending driver
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import { clerkClient } from '@clerk/nextjs/server';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const rows = await sql`
    SELECT
      u.id, u.clerk_id, u.profile_type, u.account_status, u.created_at,
      dp.first_name, dp.last_name, dp.handle, dp.video_url,
      dp.vehicle_info, dp.areas
    FROM users u
    JOIN driver_profiles dp ON dp.user_id = u.id
    WHERE u.account_status = 'pending_activation'
      AND u.profile_type = 'driver'
    ORDER BY u.created_at ASC
  `;

  return NextResponse.json({
    pending: rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      clerkId: r.clerk_id,
      name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'No name',
      handle: r.handle,
      videoUrl: r.video_url,
      vehicleInfo: r.vehicle_info,
      areas: r.areas,
      createdAt: r.created_at,
    })),
  });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { userId, action, rejectReason } = await req.json();

  if (!userId || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'userId and action (approve|reject) required' }, { status: 400 });
  }

  if (action === 'approve') {
    const rows = await sql`
      UPDATE users SET account_status = 'active', updated_at = NOW()
      WHERE id = ${userId} AND account_status = 'pending_activation'
      RETURNING id, clerk_id
    `;

    if (!rows.length) {
      return NextResponse.json({ error: 'User not found or already active' }, { status: 404 });
    }

    try {
      const clerk = await clerkClient();
      await clerk.users.updateUserMetadata(rows[0].clerk_id as string, {
        publicMetadata: { accountStatus: 'active' },
      });
    } catch {
      // Non-critical
    }

    await logAdminAction(admin.id, 'approve_driver', 'user', userId, {});
    return NextResponse.json({ success: true, status: 'active' });
  }

  // Reject
  const rows = await sql`
    UPDATE users SET account_status = 'suspended', updated_at = NOW()
    WHERE id = ${userId} AND account_status = 'pending_activation'
    RETURNING id, clerk_id
  `;

  if (!rows.length) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  await logAdminAction(admin.id, 'reject_driver', 'user', userId, { rejectReason });
  return NextResponse.json({ success: true, status: 'rejected', reason: rejectReason });
}
