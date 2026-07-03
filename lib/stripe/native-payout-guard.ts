// Shared guard for the Option B (native forms / Custom accounts) payout
// endpoints. Resolves the authenticated driver AND enforces the
// driver_payout_native_forms feature flag — so these Custom-account endpoints
// are inert (403) until the flag is flipped ON, preventing accidental Custom
// account creation while Option A (embedded) is the default.

import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { isFeatureEnabled } from '@/lib/feature-flags';

export type NativePayoutDriver = {
  ok: true;
  clerkId: string;
  userId: string;
  stripeAccountId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
};

export type NativePayoutDenied = { ok: false; status: number; error: string };

export async function requireNativePayoutDriver(): Promise<NativePayoutDriver | NativePayoutDenied> {
  const { userId: clerkId } = await auth();
  if (!clerkId) return { ok: false, status: 401, error: 'Unauthorized' };

  const rows = await sql`
    SELECT u.id AS user_id, u.phone, dp.stripe_account_id, dp.first_name, dp.last_name, dp.email
    FROM users u
    JOIN driver_profiles dp ON dp.user_id = u.id
    WHERE u.clerk_id = ${clerkId} LIMIT 1
  `;
  if (!rows.length) return { ok: false, status: 404, error: 'Driver profile not found' };
  const r = rows[0] as {
    user_id: string; phone: string | null; stripe_account_id: string | null;
    first_name: string; last_name: string; email: string;
  };

  const enabled = await isFeatureEnabled('driver_payout_native_forms', { userId: r.user_id });
  if (!enabled) return { ok: false, status: 403, error: 'NATIVE_PAYOUT_DISABLED' };

  return {
    ok: true,
    clerkId,
    userId: r.user_id,
    stripeAccountId: r.stripe_account_id,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    phone: r.phone,
  };
}

// Best-effort client IP for tos_acceptance (Cloudflare → cf-connecting-ip).
export function clientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    '0.0.0.0'
  );
}
