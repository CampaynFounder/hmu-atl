// POST /api/blast/onboard — minimal rider onboarding for the blast funnel.
//
// Called from /rider/blast/new after the user finishes Clerk OTP signup.
// Idempotent: upserts users + rider_profiles with the fields collected
// inline (display_name, phone, avatar_url). Avoids the heavy
// /api/users/onboarding endpoint because the blast funnel only collects
// the minimum needed to send a blast — everything else can be deferred.

import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { stripe } from '@/lib/stripe/connect';

export const runtime = 'nodejs';

interface Body {
  display_name?: string;
  phone?: string;
  avatar_url?: string;
}

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const displayName = (body.display_name ?? '').trim().slice(0, 60);
    let phone = (body.phone ?? '').trim();
    const avatarUrl = (body.avatar_url ?? '').trim() || null;

    // Phone collection moved to Clerk's hosted form. If body didn't include
    // one (form skipped the field), pull it from the Clerk user object.
    if (!phone) {
      try {
        const cc = await clerkClient();
        const u = await cc.users.getUser(clerkId);
        const primary = u.phoneNumbers?.find((p) => p.id === u.primaryPhoneNumberId);
        if (primary?.phoneNumber) {
          phone = primary.phoneNumber;
        }
      } catch (e) {
        console.error('[blast/onboard] could not fetch Clerk user:', e);
      }
    }

    // Ensure user row exists (Clerk webhook usually creates it; if not, we
    // do it here so the blast send doesn't 404).
    let userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) {
      await sql`
        INSERT INTO users (clerk_id, profile_type, account_status)
        VALUES (${clerkId}, 'rider', 'active')
        ON CONFLICT (clerk_id) DO NOTHING
      `;
      userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    }
    const userId = (userRows[0] as { id: string }).id;

    // Lazy Stripe customer creation — needed for the blast deposit hold.
    let stripeCustomerId: string | null = null;
    const existing = await sql`
      SELECT stripe_customer_id, display_name, phone, avatar_url
      FROM rider_profiles WHERE user_id = ${userId} LIMIT 1
    `;
    if (existing.length) {
      stripeCustomerId = (existing[0] as { stripe_customer_id: string | null }).stripe_customer_id ?? null;
    }
    if (!stripeCustomerId) {
      try {
        const cust = await stripe.customers.create({
          metadata: { clerkId, userId, source: 'blast_onboard' },
          phone: phone || undefined,
          name: displayName || undefined,
        });
        stripeCustomerId = cust.id;
      } catch (e) {
        console.error('[blast/onboard] stripe customer create failed:', e);
        // Non-fatal — blast send will surface PAYMENT_METHOD_REQUIRED if PM is missing
      }
    }

    // Upsert rider_profiles with whatever we have.
    await sql`
      INSERT INTO rider_profiles (user_id, display_name, phone, avatar_url, stripe_customer_id)
      VALUES (${userId}, ${displayName || null}, ${phone || null}, ${avatarUrl}, ${stripeCustomerId})
      ON CONFLICT (user_id) DO UPDATE SET
        display_name = COALESCE(EXCLUDED.display_name, rider_profiles.display_name),
        phone = COALESCE(EXCLUDED.phone, rider_profiles.phone),
        avatar_url = COALESCE(EXCLUDED.avatar_url, rider_profiles.avatar_url),
        stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, rider_profiles.stripe_customer_id)
    `;

    // Mirror display_name + photo to Clerk publicMetadata (best-effort).
    try {
      const cc = await clerkClient();
      await cc.users.updateUserMetadata(clerkId, {
        publicMetadata: {
          profileType: 'rider',
          accountStatus: 'active',
          displayName: displayName || undefined,
          avatarUrl: avatarUrl || undefined,
        },
      });
    } catch (e) {
      console.error('[blast/onboard] clerk metadata update failed:', e);
    }

    return NextResponse.json({
      ok: true,
      userId,
      hasDisplayName: !!displayName,
      hasPhoto: !!avatarUrl,
      hasStripeCustomer: !!stripeCustomerId,
    });
  } catch (e) {
    console.error('[blast/onboard] failed:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 },
    );
  }
}
