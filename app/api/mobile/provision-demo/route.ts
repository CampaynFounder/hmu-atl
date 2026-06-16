// POST /api/mobile/provision-demo — one-time, zero-OTP provisioning of the
// app-store reviewer demo accounts.
//
// Creates the Clerk user(s) for the configured demo phones via the Backend API
// (admin-created phones are verified — no SMS/OTP ever) and upserts the matching
// Neon user row with the correct role + active status. After this runs, you log
// in through the OTP bypass (/mobile/demo-signin) and complete onboarding in the
// app (also no OTP) — the real onboarding flow then creates the profile rows.
//
// Safety:
//   • Disabled (404) unless DEMO_PROVISION_SECRET is set; gated by an exact
//     x-provision-secret header match. Delete the secret to turn it off again.
//   • Will ONLY ever touch phones already listed in DEMO_LOGIN_PHONE, so a
//     leaked secret can't mint arbitrary accounts.
//   • Idempotent: re-running finds the existing Clerk user and just re-syncs
//     role/status.
import { NextRequest, NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { resolveMarketBySlug, DEFAULT_MARKET_SLUG } from '@/lib/markets/resolver';

export const runtime = 'nodejs';

const PROVISION_SECRET = process.env.DEMO_PROVISION_SECRET || '';
const DEMO_PHONES_10 = (process.env.DEMO_LOGIN_PHONE || '')
  .split(',')
  .map((s) => s.replace(/\D/g, '').slice(-10))
  .filter((d) => d.length === 10);

const norm10 = (p: string) => (p || '').replace(/\D/g, '').slice(-10);

export async function POST(req: NextRequest) {
  if (!PROVISION_SECRET) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (req.headers.get('x-provision-secret') !== PROVISION_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { accounts?: Array<{ phone?: string; role?: string }> };
  try {
    body = (await req.json()) as { accounts?: Array<{ phone?: string; role?: string }> };
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const accounts = body.accounts ?? [];
  const allowed = new Set(DEMO_PHONES_10);
  const clerk = await clerkClient();
  const market = await resolveMarketBySlug(DEFAULT_MARKET_SLUG);
  const results: Array<Record<string, unknown>> = [];

  for (const acct of accounts) {
    const phone10 = norm10(acct.phone ?? '');
    const role = acct.role === 'driver' ? 'driver' : 'rider';
    if (phone10.length !== 10 || !allowed.has(phone10)) {
      results.push({ phone: acct.phone, status: 'skipped', reason: 'not in DEMO_LOGIN_PHONE' });
      continue;
    }
    const e164 = `+1${phone10}`;
    try {
      const existing = await clerk.users.getUserList({ phoneNumber: [e164], limit: 1 });
      let user = existing.data[0];
      if (!user) {
        user = await clerk.users.createUser({
          phoneNumber: [e164],
          skipPasswordRequirement: true,
          publicMetadata: { profileType: role },
        });
      } else {
        await clerk.users.updateUserMetadata(user.id, { publicMetadata: { profileType: role } });
      }

      // Deterministically set the Neon row (don't wait on the webhook): correct
      // role + active so the reviewer lands past the pending gate. The profile
      // row itself is created when you complete onboarding via the bypass login.
      await sql`
        INSERT INTO users (clerk_id, profile_type, account_status, phone, market_id)
        VALUES (${user.id}, ${role}, 'active', ${e164}, ${market?.market_id ?? null})
        ON CONFLICT (clerk_id) DO UPDATE SET
          profile_type   = ${role},
          account_status = 'active',
          phone          = COALESCE(users.phone, ${e164})
      `;

      results.push({ phone: e164, role, clerkUserId: user.id, status: 'provisioned' });
    } catch (err) {
      results.push({ phone: e164, role, status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ results });
}
