import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { resolveMarketBySlug, MARKET_SLUG_HEADER, DEFAULT_MARKET_SLUG } from '@/lib/markets/resolver';

/** PATCH /api/users/me — set profileType on first mobile sign-up */
export async function PATCH(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { profileType?: string };
  const { profileType } = body;
  if (!profileType || !['rider', 'driver'].includes(profileType)) {
    return NextResponse.json({ error: 'Invalid profileType' }, { status: 400 });
  }

  // UPSERT — handles race where stub doesn't exist yet on first mobile sign-up
  await sql`
    INSERT INTO users (clerk_id, profile_type, account_status)
    VALUES (${clerkId}, ${profileType}, 'active')
    ON CONFLICT (clerk_id) DO UPDATE SET profile_type = ${profileType}
  `;

  return NextResponse.json({ ok: true });
}

/** GET /api/users/me — resolve Clerk ID to internal user ID + profile type + driver handle */
export async function GET(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // One query joins the user with their driver handle so /d/[handle] can cheaply
  // check "is this page about me?" without a second fetch.
  const rows = await sql`
    SELECT u.id, u.profile_type, u.account_status, u.is_admin,
           dp.handle AS driver_handle,
           ar.is_super
    FROM users u
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
    LEFT JOIN admin_roles ar ON ar.id = u.admin_role_id
    WHERE u.clerk_id = ${clerkId}
    LIMIT 1
  `;

  if (!rows.length) {
    // No Neon row yet — webhook hasn't arrived. Create a stub so the client can
    // resolve its user ID, but include market_id and phone so the row doesn't
    // need a later backfill. The webhook will COALESCE on arrival if it wins the
    // race; ON CONFLICT below heals any concurrent duplicate.
    let marketId: string | null = null;
    let verifiedPhone: string | null = null;
    try {
      const clerk = await clerkClient();
      const clerkUser = await clerk.users.getUser(clerkId);
      for (const p of clerkUser.phoneNumbers || []) {
        if (p.verification?.status === 'verified') { verifiedPhone = p.phoneNumber; break; }
      }
      const metaMarket = (clerkUser.unsafeMetadata?.market as string) || null;
      const headerMarket = request.headers.get(MARKET_SLUG_HEADER);
      const marketSlug = metaMarket || headerMarket || DEFAULT_MARKET_SLUG;
      const market = await resolveMarketBySlug(marketSlug)
        ?? await resolveMarketBySlug(DEFAULT_MARKET_SLUG);
      marketId = market?.market_id ?? null;
    } catch (e) {
      console.warn('[/api/users/me] Could not resolve market/phone for stub:', e);
    }

    const newUserRows = await sql`
      INSERT INTO users (clerk_id, profile_type, account_status, market_id, phone)
      VALUES (${clerkId}, 'rider', 'active', ${marketId}, ${verifiedPhone})
      ON CONFLICT (clerk_id) DO UPDATE
        SET market_id = COALESCE(users.market_id, EXCLUDED.market_id),
            phone     = COALESCE(users.phone,     EXCLUDED.phone)
      RETURNING id, profile_type, account_status
    `;
    const newUser = newUserRows[0] as { id: string; profile_type: string; account_status: string };
    return NextResponse.json({
      id: newUser.id,
      profileType: newUser.profile_type,
      accountStatus: newUser.account_status,
      driverHandle: null,
    });
  }

  const user = rows[0] as {
    id: string;
    profile_type: string;
    account_status: string;
    driver_handle: string | null;
    is_admin: boolean;
    is_super: boolean | null;
  };
  return NextResponse.json({
    id: user.id,
    profileType: user.profile_type,
    accountStatus: user.account_status,
    driverHandle: user.driver_handle || null,
    isSuperAdmin: !!(user.is_admin && user.is_super),
  });
}
