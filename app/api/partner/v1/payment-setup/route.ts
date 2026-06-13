// POST /api/partner/v1/payment-setup — pass_through card collection.
//
// For pass_through partners: ensures a Stripe customer for the guest rider and
// returns a SetupIntent client_secret (+ HMU's publishable key) so the vendor's
// frontend can attach a card with Stripe.js. The same customer is reused when
// the booking is created, so the card is on file at hold time.
//
// Requires bookings:write. Not applicable to vendor_funded partners.

import { NextRequest, NextResponse } from 'next/server';
import { authenticatePartner } from '@/lib/partner/auth';
import { resolveMarketBySlug } from '@/lib/markets/resolver';
import { resolvePartnerRider } from '@/lib/partner/rider';
import { createGuestSetupIntent } from '@/lib/partner/payer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SetupBody {
  external_rider?: { ref?: unknown; name?: unknown; phone?: unknown };
  market_slug?: unknown;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const auth = await authenticatePartner(req, rawBody, 'bookings:write');
  if (!auth.ok) return auth.res;
  const partner = auth.ctx.partner;

  if (partner.payerMode !== 'pass_through') {
    return NextResponse.json(
      { error: 'not_applicable', message: 'payment-setup is only for pass_through partners' },
      { status: 400 },
    );
  }

  let body: SetupBody;
  try {
    body = rawBody ? (JSON.parse(rawBody) as SetupBody) : {};
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid JSON body' }, { status: 400 });
  }

  const ref = typeof body.external_rider?.ref === 'string' ? body.external_rider.ref.trim() : '';
  if (!ref) return NextResponse.json({ error: 'bad_request', message: 'external_rider.ref is required' }, { status: 400 });
  const marketSlug = typeof body.market_slug === 'string' ? body.market_slug.toLowerCase() : '';
  if (!marketSlug) return NextResponse.json({ error: 'bad_request', message: 'market_slug is required' }, { status: 400 });

  const market = await resolveMarketBySlug(marketSlug);
  if (!market) return NextResponse.json({ error: 'unknown_market', message: `No market '${marketSlug}'` }, { status: 400 });

  const rider = await resolvePartnerRider(
    { id: partner.id, payerMode: partner.payerMode, vendorStripeCustomerId: partner.vendorStripeCustomerId },
    {
      ref,
      name: typeof body.external_rider?.name === 'string' ? body.external_rider.name : null,
      phone: typeof body.external_rider?.phone === 'string' ? body.external_rider.phone : null,
    },
    market.market_id,
  );
  if (!rider.stripeCustomerId) {
    return NextResponse.json({ error: 'internal_error', message: 'Could not create customer' }, { status: 500 });
  }

  const clientSecret = await createGuestSetupIntent(rider.stripeCustomerId);

  return NextResponse.json({
    customer_id: rider.stripeCustomerId,
    client_secret: clientSecret,
    publishable_key: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null,
  });
}
