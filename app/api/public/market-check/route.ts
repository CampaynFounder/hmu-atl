// GET /api/public/market-check — pre-auth geo → market resolution for mobile
// sign-up. The mobile app has no Clerk session at the phone-entry step, so it
// can't call the authed /api/markets/active-check. This returns the same shape
// { isActive, marketSlug, displayName } so the app can (a) gate sign-up to live
// markets until national rollout and (b) stamp the correct market slug into
// Clerk unsafeMetadata BEFORE signUp.create() — the webhook reads that to set
// users.market_id at row creation (COALESCE can't overwrite it later).
//
// Optional `phone` param waitlists the user when they're outside a live market,
// mirroring the authed endpoint's passive capture. Rate-limited per IP since
// it's unauthenticated.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { resolveMarketByGeo } from '@/lib/markets/geo';
import { checkRateLimit } from '@/lib/rate-limit/check';
import { isDemoPhone } from '@/lib/demo/phones';

export const runtime = 'nodejs';

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip') ?? 'unknown';
}

export async function GET(req: NextRequest) {
  const rl = await checkRateLimit({
    key: `market-check:${clientIp(req)}`,
    limit: 60,
    windowSeconds: 3600,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
    );
  }

  const lat = parseFloat(req.nextUrl.searchParams.get('lat') ?? '');
  const lng = parseFloat(req.nextUrl.searchParams.get('lng') ?? '');
  if (!isFinite(lat) || !isFinite(lng)) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 });
  }

  // App-store reviewers run from outside any live market. Authoritative bypass:
  // a demo phone is always "active" so the sign-up gate can never block review,
  // regardless of where the reviewer's device reports it is.
  const phoneParam = req.nextUrl.searchParams.get('phone');
  if (isDemoPhone(phoneParam)) {
    const geo = await resolveMarketByGeo(lat, lng);
    return NextResponse.json({
      isActive: true,
      marketSlug: geo.marketSlug ?? 'atl',
      displayName: geo.displayName,
    });
  }

  const result = await resolveMarketByGeo(lat, lng);

  // Outside a live market: waitlist the typed phone (E.164) so we can text them
  // when HMU launches there. No session yet, so the phone is the only key.
  if (!result.isActive) {
    const phone = req.nextUrl.searchParams.get('phone');
    if (phone && phone.replace(/\D/g, '').length >= 10) {
      void captureWaitlist(phone, result.marketSlug);
    }
  }

  return NextResponse.json(result);
}

async function captureWaitlist(phone: string, marketSlug: string | null) {
  try {
    await sql`
      INSERT INTO market_waitlist (phone, market_slug, source)
      VALUES (${phone}, ${marketSlug}, 'mobile_signup')
      ON CONFLICT (phone) DO NOTHING
    `;
  } catch {}
}
