import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { computeRideBreakdown } from '@/lib/payments/breakdown';
import ActiveRideClient from './active-ride-client';

export default async function RidePage({ params }: { params: Promise<{ id: string }> }) {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  const { id: rideId } = await params;

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rideId)) {
    redirect('/');
  }

  const userRows = await sql`SELECT id, profile_type FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) redirect('/');
  const user = userRows[0] as { id: string; profile_type: string };

  let rideRows;
  try {
    rideRows = await sql`
      SELECT r.*,
        dp.display_name as driver_name, dp.handle as driver_handle, dp.thumbnail_url as driver_avatar_url, dp.vehicle_info as driver_vehicle_info,
        rp.display_name as rider_display_name, rp.handle as rider_handle, rp.avatar_url as rider_avatar_url,
        rl.lat as last_driver_lat, rl.lng as last_driver_lng
      FROM rides r
      LEFT JOIN driver_profiles dp ON dp.user_id = r.driver_id
      LEFT JOIN rider_profiles rp ON rp.user_id = r.rider_id
      LEFT JOIN LATERAL (
        SELECT lat, lng FROM ride_locations
        WHERE ride_id = r.id ORDER BY recorded_at DESC LIMIT 1
      ) rl ON true
      WHERE r.id = ${rideId} AND (r.driver_id = ${user.id} OR r.rider_id = ${user.id})
      LIMIT 1
    `;
  } catch {
    // Invalid ride ID or DB error
    redirect(user.profile_type === 'driver' ? '/driver/home' : '/rider/home');
  }

  if (!rideRows.length) {
    redirect(user.profile_type === 'driver' ? '/driver/home' : '/rider/home');
  }

  const ride = rideRows[0] as Record<string, unknown>;
  const isDriver = ride.driver_id === user.id;

  // Load existing add-ons
  let addOnRows: Record<string, unknown>[] = [];
  let addOnTotal = 0;
  try {
    addOnRows = await sql`
      SELECT id, name, unit_price, quantity, subtotal, status, added_by,
             stripe_charge_status, error_message
      FROM ride_add_ons
      WHERE ride_id = ${rideId} AND status NOT IN ('removed')
      ORDER BY added_at
    ` as Record<string, unknown>[];
    addOnTotal = addOnRows
      .filter(a => a.status !== 'disputed')
      .reduce((sum, a) => sum + Number(a.subtotal ?? 0), 0);
  } catch { /* non-critical */ }

  // Rider's default payment method — shown in the "confirming" state receipt
  // so the rider knows which card/wallet the deposit was secured against.
  // Driver view never needs this, so skip the query for drivers.
  let riderPaymentBrand: string | null = null;
  let riderPaymentLast4: string | null = null;
  if (!isDriver) {
    try {
      const pmRows = await sql`
        SELECT brand, last4 FROM rider_payment_methods
        WHERE rider_id = ${user.id} AND is_default = true
        LIMIT 1
      `;
      if (pmRows.length) {
        riderPaymentBrand = (pmRows[0] as Record<string, unknown>).brand as string | null;
        riderPaymentLast4 = (pmRows[0] as Record<string, unknown>).last4 as string | null;
      }
    } catch { /* non-critical */ }
  }

  // Down Bad sum extra + ride details — fetched from the originating post.
  let sumExtra: { text: string; mediaUrl: string; mediaType: 'photo' | 'video' } | null = null;
  let rideDetails: { additionalPassengers: number; kids: number; luggage: 'none' | 'bag' | 'trunk' } | null = null;
  if (ride.hmu_post_id) {
    try {
      const postRows = await sql`
        SELECT sum_extra_text, sum_extra_media_url, sum_extra_media_type, ride_details
        FROM hmu_posts
        WHERE id = ${ride.hmu_post_id as string}
          AND post_type = 'down_bad'
          AND sum_extra_media_url IS NOT NULL
        LIMIT 1
      `;
      if (postRows.length) {
        const p = postRows[0] as Record<string, unknown>;
        sumExtra = {
          text: (p.sum_extra_text as string) || '',
          mediaUrl: (p.sum_extra_media_url as string) || '',
          mediaType: (p.sum_extra_media_type as 'photo' | 'video') || 'photo',
        };
        rideDetails = (p.ride_details as { additionalPassengers: number; kids: number; luggage: 'none' | 'bag' | 'trunk' } | null) ?? null;
      }
    } catch { /* non-critical */ }
  }

  // Ride breakdown — only fetched once the ride has ended so we don't
  // pay for the extra query on every in-flight render.
  const endedStatuses = ['ended', 'completed', 'disputed'];
  const breakdown = endedStatuses.includes(ride.status as string)
    ? await computeRideBreakdown(rideId).catch(() => null)
    : null;

  return (
    <>
      {/* Mapbox GL loaded via CDN to avoid bundling into worker */}
      <link href="https://api.mapbox.com/mapbox-gl-js/v3.9.4/mapbox-gl.css" rel="stylesheet" />
      <script src="https://api.mapbox.com/mapbox-gl-js/v3.9.4/mapbox-gl.js" async />
      <style>{`.mapboxgl-ctrl-logo { width: 60px !important; height: 16px !important; opacity: 0.3 !important; } .mapboxgl-ctrl-attrib { font-size: 9px !important; opacity: 0.3 !important; }`}</style>
    <ActiveRideClient
      rideId={rideId}
      userId={user.id}
      isDriver={isDriver}
      initialRide={{
        refCode: (ride.ref_code as string) || null,
        status: ride.status as string,
        driverName: (ride.driver_name as string) || (ride.driver_handle as string) || 'Driver',
        driverHandle: (ride.driver_handle as string) || null,
        driverAvatarUrl: (ride.driver_avatar_url as string) || null,
        riderName: (ride.rider_handle as string) || (ride.rider_display_name as string) || 'Rider',
        riderHandle: (ride.rider_handle as string) || null,
        riderAvatarUrl: (ride.rider_avatar_url as string) || null,
        agreedPrice: Number(ride.final_agreed_price || ride.amount || 0),
        agreementSummary: ride.agreement_summary as Record<string, unknown> | null,
        pickup: ride.pickup as Record<string, unknown> | null,
        dropoff: ride.dropoff as Record<string, unknown> | null,
        stops: ride.stops as unknown[] | null,
        pickupAddress: (ride.pickup_address as string) || null,
        pickupLat: ride.pickup_lat ? Number(ride.pickup_lat) : null,
        pickupLng: ride.pickup_lng ? Number(ride.pickup_lng) : null,
        dropoffAddress: (ride.dropoff_address as string) || null,
        dropoffLat: ride.dropoff_lat ? Number(ride.dropoff_lat) : null,
        dropoffLng: ride.dropoff_lng ? Number(ride.dropoff_lng) : null,
        otwAt: ride.otw_at as string | null,
        hereAt: ride.here_at as string | null,
        startedAt: ride.started_at as string | null,
        endedAt: ride.ended_at as string | null,
        disputeWindowExpiresAt: ride.dispute_window_expires_at as string | null,
        earlyEndReason: (ride.early_end_reason as string) || null,
        earlyEndNotes: (ride.early_end_notes as string) || null,
        riderAcknowledgedEarlyEnd: ride.rider_acknowledged_early_end as boolean | null,
        driverPayoutAmount: Number(ride.driver_payout_amount || 0),
        platformFeeAmount: Number(ride.platform_fee_amount || 0),
        cooAt: ride.coo_at as string | null,
        riderLat: ride.rider_lat ? Number(ride.rider_lat) : null,
        riderLng: ride.rider_lng ? Number(ride.rider_lng) : null,
        riderLocationText: (ride.rider_location_text as string) || null,
        driverPlate: ((ride.driver_vehicle_info as Record<string, unknown>)?.license_plate as string) || null,
        driverPlateState: ((ride.driver_vehicle_info as Record<string, unknown>)?.plate_state as string) || null,
        isCash: (ride.is_cash as boolean) || false,
        proposedPrice: ride.proposed_price ? Number(ride.proposed_price) : null,
        proposedPriceReason: (ride.proposed_price_reason as string) || null,
        waitMinutes: Number(ride.wait_minutes ?? 5),
        confirmDeadline: (ride.confirm_deadline as string) || null,
        addOns: addOnRows.map(a => ({
          id: a.id as string,
          name: a.name as string,
          unitPrice: Number(a.unit_price ?? 0),
          quantity: Number(a.quantity ?? 1),
          subtotal: Number(a.subtotal ?? 0),
          status: a.status as string,
          addedBy: (a.added_by as string) || 'rider',
          chargeStatus: (a.stripe_charge_status as string) || null,
          errorMessage: (a.error_message as string) || null,
        })),
        addOnTotal,
        breakdown,
        cancelRequestedAt: ride.cancel_requested_at
          ? new Date(ride.cancel_requested_at as string).toISOString()
          : null,
        cancelRequestedBy: (ride.cancel_requested_by as 'rider' | 'driver' | null) ?? null,
        cancelRequestReason: (ride.cancel_request_reason as string) || null,
        cancelResolution: (ride.cancel_resolution as string) || null,
        visibleDeposit: Number(ride.visible_deposit ?? 0),
        pricingModeKey: (ride.pricing_mode_key as string) || 'legacy_full_fare',
        riderPaymentBrand,
        riderPaymentLast4,
        hmuPostId: (ride.hmu_post_id as string) || null,
        sumExtra,
        rideDetails,
        initialDriverLat: ride.last_driver_lat ? Number(ride.last_driver_lat) : null,
        initialDriverLng: ride.last_driver_lng ? Number(ride.last_driver_lng) : null,
      }}
      mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''}
    />
    </>
  );
}
