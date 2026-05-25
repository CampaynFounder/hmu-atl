import { NextRequest, NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';

export const runtime = 'nodejs';

// POST /api/admin/backfill/clerk-metadata
//
// Ensures every Neon user has profileType in Clerk publicMetadata.
// Fixes accounts created before the webhook reliably wrote it, or where
// the Clerk API call failed silently during signup.
//
// Safe to run multiple times — checks existing metadata first and skips
// users who are already correct. Clerk updateUserMetadata merges, so other
// metadata keys (accountStatus, tier, etc.) are never overwritten.
//
// Body: { dryRun?: boolean }
//   dryRun=true  → reports how many would be fixed, touches nothing in Clerk
//   dryRun=false → default, writes metadata for all affected users
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const body = await req.json().catch(() => ({})) as { dryRun?: boolean };
  const dryRun = body.dryRun ?? false;

  const rows = await sql`
    SELECT clerk_id, profile_type
    FROM users
    WHERE clerk_id IS NOT NULL
      AND profile_type IS NOT NULL
    ORDER BY created_at ASC
  ` as { clerk_id: string; profile_type: string }[];

  const clerk = await clerkClient();
  let alreadySet = 0;
  let fixed = 0;
  let wouldFix = 0;
  let failed = 0;
  const failures: { clerkId: string; profileType: string; error: string }[] = [];

  for (const { clerk_id: clerkId, profile_type: profileType } of rows) {
    try {
      const clerkUser = await clerk.users.getUser(clerkId);

      if (clerkUser.publicMetadata?.profileType) {
        alreadySet++;
        continue;
      }

      if (dryRun) {
        wouldFix++;
        continue;
      }

      await clerk.users.updateUserMetadata(clerkId, {
        publicMetadata: { profileType },
      });
      fixed++;
    } catch (e) {
      failed++;
      failures.push({
        clerkId,
        profileType,
        error: e instanceof Error ? e.message : String(e),
      });
      if (failures.length > 50) break; // safety valve — don't accumulate unbounded failures
    }
  }

  return NextResponse.json({
    total: rows.length,
    alreadySet,
    fixed,
    wouldFix,
    failed,
    failures,
    dryRun,
  });
}
