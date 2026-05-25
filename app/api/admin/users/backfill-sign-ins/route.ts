// POST /api/admin/users/backfill-sign-ins
//
// One-shot maintenance endpoint that pulls `lastSignInAt` from Clerk for every
// Neon user where `last_sign_in_at` is NULL, and floors `sign_in_count` at 1
// when Clerk reports the user has signed in. We CANNOT recover a true historical
// count — Clerk's API only exposes the most recent sign-in timestamp — so the
// floor is a best-effort signal that "this user has signed in at least once,"
// not an exact count.
//
// Idempotent: safe to re-run. Only touches rows where last_sign_in_at IS NULL.
// Super-admin only (one-shot, alters historical counters).

import { NextRequest, NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface BackfillResult {
  scanned: number;
  updated: number;
  skipped_no_clerk_signin: number;
  skipped_clerk_missing: number;
  errors: Array<{ clerkId: string; error: string }>;
  dryRun: boolean;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super) {
    return NextResponse.json({ error: 'Super admin only' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const dryRun = body.dryRun !== false; // default to dry-run for safety
  const limit = Math.min(Number(body.limit) || 500, 2000);

  // Candidate users: Neon row exists, last_sign_in_at is NULL.
  const candidates = await sql`
    SELECT id, clerk_id
    FROM users
    WHERE last_sign_in_at IS NULL
      AND clerk_id IS NOT NULL
    ORDER BY created_at ASC
    LIMIT ${limit}
  ` as Array<{ id: string; clerk_id: string }>;

  const result: BackfillResult = {
    scanned: candidates.length,
    updated: 0,
    skipped_no_clerk_signin: 0,
    skipped_clerk_missing: 0,
    errors: [],
    dryRun,
  };

  const clerk = await clerkClient();

  for (const u of candidates) {
    try {
      const clerkUser = await clerk.users.getUser(u.clerk_id);
      const lastSignInAt = clerkUser.lastSignInAt;

      if (!lastSignInAt) {
        result.skipped_no_clerk_signin++;
        continue;
      }

      if (dryRun) {
        result.updated++;
        continue;
      }

      // Floor sign_in_count at 1 — Clerk says they've signed in at least once.
      // Don't overwrite an existing higher count if some other path has been
      // writing it (defensive; today only the webhook writes it).
      await sql`
        UPDATE users SET
          last_sign_in_at = ${new Date(lastSignInAt).toISOString()},
          sign_in_count = GREATEST(COALESCE(sign_in_count, 0), 1)
        WHERE id = ${u.id}
      `;
      result.updated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Clerk returns 404 for users that exist in Neon but were deleted in Clerk.
      if (msg.includes('not found') || msg.includes('404')) {
        result.skipped_clerk_missing++;
      } else {
        result.errors.push({ clerkId: u.clerk_id, error: msg });
      }
    }
  }

  if (!dryRun) {
    await logAdminAction(admin.id, 'backfill_sign_ins', 'system', undefined, {
      scanned: result.scanned,
      updated: result.updated,
      skipped_no_clerk_signin: result.skipped_no_clerk_signin,
      skipped_clerk_missing: result.skipped_clerk_missing,
      error_count: result.errors.length,
    });
  }

  return NextResponse.json(result);
}
