// Admin helpers — auth guard and audit logging

import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { NextResponse } from 'next/server';

export interface AdminUser {
  id: string;
  clerk_id: string;
  profile_type: string;
}

/**
 * Verify the current user is an admin. Returns admin user or null.
 * Use in API routes.
 */
export async function requireAdmin(): Promise<AdminUser | null> {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const rows = await sql`
    SELECT id, clerk_id, profile_type FROM users
    WHERE clerk_id = ${clerkId} AND is_admin = true
    LIMIT 1
  `;
  if (!rows.length) return null;
  return rows[0] as AdminUser;
}

/**
 * Return 403 response if not admin
 */
export function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
}

/**
 * Log an admin action to the audit trail
 */
export async function logAdminAction(
  adminId: string,
  action: string,
  targetType?: string,
  targetId?: string,
  details?: Record<string, unknown>
): Promise<void> {
  await sql`
    INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
    VALUES (${adminId}, ${action}, ${targetType ?? null}, ${targetId ?? null}, ${JSON.stringify(details ?? {})})
  `;
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}
