// Partner delivery booking — creation (no charge).
//
// Validates the driver + market, computes the delivery-fee split, and creates a
// normal direct_booking post targeted at the driver plus a partner_bookings
// ledger row. NO money moves here — the card hold is placed when the driver
// accepts (see lib/partner/booking-hold.ts, invoked from the accept route),
// mirroring the ride flow's "hold at accept".
//
// Gated by the `partner_bookings` feature flag (dark by default) and the
// driver's `accept_partner_bookings` consent flag.

import { sql } from '@/lib/db/client';
import { isValidCoordinates } from '@/lib/geo/distance';
import { resolveMarketBySlug } from '@/lib/markets/resolver';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { createDirectBookingPost } from '@/lib/db/direct-bookings';
import { createTentativeBooking } from '@/lib/schedule/conflicts';
import { notifyUser, publishAdminEvent } from '@/lib/ably/server';
import { resolveFeePolicy, computeDeliverySplit } from '@/lib/partner/fees';
import { resolvePartnerRider } from '@/lib/partner/rider';
import { customerDefaultPaymentMethod } from '@/lib/partner/payer';
import { dispatchPartnerEvent } from '@/lib/partner/webhooks';
import type { PartnerContext } from '@/lib/partner/auth';

interface Coord {
  lat?: unknown;
  lng?: unknown;
  address?: unknown;
}

export interface BookingInput {
  driver_handle?: unknown;
  external_rider?: { ref?: unknown; name?: unknown; phone?: unknown };
  pickup?: Coord;
  dropoff?: Coord;
  delivery_fee_cents?: unknown;
  market_slug?: unknown;
  scheduled_for?: unknown;
}

export interface FeeSplitDTO {
  delivery_fee_cents: number;
  platform_fee_cents: number;
  driver_payout_cents: number;
}

export type BookingResult =
  | {
      ok: true;
      bookingId: string;
      status: string;
      expiresAt: string;
      feeSplit: FeeSplitDTO;
    }
  | { ok: false; httpStatus: number; error: string; message: string };

const fail = (httpStatus: number, error: string, message: string): BookingResult => ({
  ok: false,
  httpStatus,
  error,
  message,
});

function coord(c: Coord | undefined): { lat: number; lng: number; address: string | null } | null {
  if (!c || typeof c.lat !== 'number' || typeof c.lng !== 'number') return null;
  if (!isValidCoordinates({ latitude: c.lat, longitude: c.lng })) return null;
  return { lat: c.lat, lng: c.lng, address: typeof c.address === 'string' ? c.address : null };
}

export async function createPartnerDeliveryBooking(
  ctx: PartnerContext,
  body: BookingInput,
): Promise<BookingResult> {
  const partner = ctx.partner;

  // --- validate input ---
  const handle = typeof body.driver_handle === 'string' ? body.driver_handle.trim() : '';
  if (!handle) return fail(400, 'bad_request', 'driver_handle is required');

  const extRef = typeof body.external_rider?.ref === 'string' ? body.external_rider.ref.trim() : '';
  if (!extRef) return fail(400, 'bad_request', 'external_rider.ref is required');

  const pickup = coord(body.pickup);
  const dropoff = coord(body.dropoff);
  if (!pickup || !dropoff) {
    return fail(400, 'bad_request', 'pickup and dropoff must each be { lat, lng }');
  }

  const deliveryFeeCents = Number(body.delivery_fee_cents);
  if (!Number.isInteger(deliveryFeeCents) || deliveryFeeCents <= 0) {
    return fail(400, 'bad_request', 'delivery_fee_cents must be a positive integer');
  }

  const marketSlug = typeof body.market_slug === 'string' ? body.market_slug.toLowerCase() : '';
  if (!marketSlug) return fail(400, 'bad_request', 'market_slug is required');

  // --- payer config ---
  if (partner.payerMode === 'vendor_funded' && !partner.vendorStripeCustomerId) {
    return fail(400, 'partner_not_configured', 'Partner has no vendor Stripe customer on file');
  }

  // --- market ---
  const market = await resolveMarketBySlug(marketSlug);
  if (!market) return fail(400, 'unknown_market', `No market with slug '${marketSlug}'`);
  if (partner.marketIds.length > 0 && !partner.marketIds.includes(market.market_id)) {
    return fail(403, 'market_not_allowed', 'Partner is not enabled for this market');
  }

  // --- feature flag (dark by default) ---
  const enabled = await isFeatureEnabled('partner_bookings', { marketSlug });
  if (!enabled) return fail(404, 'not_available', 'Partner bookings are not enabled');

  // --- driver eligibility ---
  const driverRows = await sql`
    SELECT dp.user_id, dp.accept_partner_bookings, dp.stripe_account_id,
           dp.payout_setup_complete, dp.areas, u.account_status
    FROM driver_profiles dp
    JOIN users u ON u.id = dp.user_id
    WHERE dp.handle = ${handle}
    LIMIT 1
  `;
  const driver = driverRows[0] as
    | {
        user_id: string;
        accept_partner_bookings: boolean;
        stripe_account_id: string | null;
        payout_setup_complete: boolean;
        areas: string[] | null;
        account_status: string;
      }
    | undefined;

  if (!driver) return fail(404, 'driver_not_found', `No driver with handle '${handle}'`);
  if (driver.account_status !== 'active') return fail(409, 'driver_unavailable', 'Driver is not active');
  if (driver.accept_partner_bookings !== true) {
    return fail(403, 'driver_not_bookable', 'Driver has not opted into partner bookings');
  }
  if (!driver.stripe_account_id || driver.payout_setup_complete !== true) {
    return fail(409, 'driver_not_payable', 'Driver cannot receive payouts yet');
  }

  // --- fee split ---
  const policy = await resolveFeePolicy(marketSlug);
  const split = computeDeliverySplit({ deliveryFeeCents, policy });
  const feeSplit: FeeSplitDTO = {
    delivery_fee_cents: split.deliveryFeeCents,
    platform_fee_cents: split.platformFeeCents,
    driver_payout_cents: split.driverPayoutCents,
  };

  // --- synthetic rider (+ guest Stripe customer for pass_through) ---
  const rider = await resolvePartnerRider(
    { id: partner.id, payerMode: partner.payerMode, vendorStripeCustomerId: partner.vendorStripeCustomerId },
    {
      ref: extRef,
      name: typeof body.external_rider?.name === 'string' ? body.external_rider.name : null,
      phone: typeof body.external_rider?.phone === 'string' ? body.external_rider.phone : null,
    },
    market.market_id,
  );

  // --- funding source must have a card on file before we commit a driver ---
  const fundingCustomer =
    partner.payerMode === 'pass_through' ? rider.stripeCustomerId : partner.vendorStripeCustomerId;
  if (!fundingCustomer) {
    return fail(400, 'partner_not_configured', 'No funding Stripe customer for this booking');
  }
  const pm = await customerDefaultPaymentMethod(fundingCustomer);
  if (!pm) {
    if (partner.payerMode === 'pass_through') {
      return fail(
        402,
        'payment_setup_required',
        'No card on file for this customer. POST /api/partner/v1/payment-setup to collect one, then retry.',
      );
    }
    return fail(400, 'partner_not_configured', 'Vendor Stripe customer has no card on file');
  }

  // --- create the direct_booking post (price = delivery fee in dollars) ---
  const timeWindow: Record<string, unknown> = {
    pickup: pickup.address ?? undefined,
    dropoff: dropoff.address ?? undefined,
    destination: dropoff.address ?? undefined,
    time: 'ASAP',
    isNow: true,
    pickup_coords: { lat: pickup.lat, lng: pickup.lng },
    dropoff_coords: { lat: dropoff.lat, lng: dropoff.lng },
    partner_booking: true,
  };

  const post = await createDirectBookingPost({
    riderId: rider.userId,
    driverUserId: driver.user_id,
    marketId: market.market_id,
    price: deliveryFeeCents / 100,
    areas: Array.isArray(driver.areas) ? driver.areas : [],
    pickupAreaSlug: null,
    dropoffAreaSlug: null,
    dropoffInMarket: true,
    timeWindow,
    pickupAddress: pickup.address,
    dropoffAddress: dropoff.address,
    tripType: 'one_way',
    isCash: false,
    expiryMinutes: 15,
  });
  const postId = post.id as string;
  const rawExpiry = post.booking_expires_at ?? post.expires_at;
  const expiresAt =
    rawExpiry instanceof Date ? rawExpiry.toISOString() : String(rawExpiry);

  // --- hold the driver's calendar (best-effort; matches the direct-booking flow) ---
  try {
    await createTentativeBooking(
      driver.user_id,
      rider.userId,
      postId,
      new Date().toISOString(),
      market.market_id,
    );
  } catch (e) {
    console.error('[partner/booking] tentative hold failed (non-fatal):', e);
  }

  // --- partner_bookings ledger row ---
  await sql`
    INSERT INTO partner_bookings (
      partner_id, post_id, rider_id, driver_id, market_id, external_ref,
      delivery_fee_cents, platform_fee_cents, driver_payout_cents, status
    ) VALUES (
      ${partner.id}, ${postId}, ${rider.userId}, ${driver.user_id}, ${market.market_id}, ${extRef},
      ${split.deliveryFeeCents}, ${split.platformFeeCents}, ${split.driverPayoutCents}, 'pending_accept'
    )
  `;

  // --- notify the driver so their request feed surfaces it ---
  await notifyUser(driver.user_id, 'partner_booking_request', {
    postId,
    price: deliveryFeeCents / 100,
    pickup: pickup.address,
    dropoff: dropoff.address,
    partner: partner.name,
  }).catch(() => {});
  publishAdminEvent('partner_booking_created', {
    postId,
    partnerId: partner.id,
    driverId: driver.user_id,
    deliveryFeeCents,
  }).catch(() => {});
  dispatchPartnerEvent(partner.id, 'booking.created', {
    booking_id: postId,
    status: 'pending_accept',
    driver_handle: handle,
    fee_split: feeSplit,
  }).catch(() => {});

  return { ok: true, bookingId: postId, status: 'pending_accept', expiresAt, feeSplit };
}
