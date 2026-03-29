import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

/**
 * GET — Returns a full earnings audit for the driver.
 *
 * Formula:
 *   Launch Offer earnings_used = Cash gross + Digital gross (during offer period)
 *   Cash collected = SUM(final_agreed_price + add_on_total) for cash rides
 *   Digital gross = SUM(final_agreed_price + add_on_total) for digital rides
 *   Digital net (driver keeps) = SUM(driver_payout_amount) for digital rides
 *   Stripe fees = SUM(stripe_fee_amount)
 *   Platform fees = SUM(platform_fee_amount)
 *   Stripe balance = from Stripe API (available + pending)
 *
 * Validation:
 *   Digital gross - Stripe fees - Platform fees = Digital net
 *   Cash collected + Digital net = Total driver earnings
 *   Launch offer earnings_used ≈ Cash gross + Digital gross (for offer-period rides)
 */
export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const driverId = (userRows[0] as { id: string }).id;

    // Cash rides
    const cashRows = await sql`
      SELECT
        COUNT(*) as rides,
        COALESCE(SUM(COALESCE(final_agreed_price, amount, 0)), 0) as base_total,
        COALESCE(SUM(COALESCE(add_on_total, 0)), 0) as addon_total,
        COALESCE(SUM(COALESCE(final_agreed_price, amount, 0) + COALESCE(add_on_total, 0)), 0) as gross_total
      FROM rides
      WHERE driver_id = ${driverId} AND is_cash = true AND status IN ('ended', 'completed')
    `;
    const cash = cashRows[0] as Record<string, unknown>;

    // Digital rides
    const digitalRows = await sql`
      SELECT
        COUNT(*) as rides,
        COALESCE(SUM(COALESCE(final_agreed_price, amount, 0)), 0) as base_total,
        COALESCE(SUM(COALESCE(add_on_total, 0)), 0) as addon_total,
        COALESCE(SUM(COALESCE(final_agreed_price, amount, 0) + COALESCE(add_on_total, 0)), 0) as gross_total,
        COALESCE(SUM(COALESCE(driver_payout_amount, 0)), 0) as net_to_driver,
        COALESCE(SUM(COALESCE(stripe_fee_amount, 0)), 0) as stripe_fees,
        COALESCE(SUM(COALESCE(platform_fee_amount, 0)), 0) as platform_fees,
        COALESCE(SUM(COALESCE(waived_fee_amount, 0)), 0) as waived_fees
      FROM rides
      WHERE driver_id = ${driverId} AND (is_cash IS NULL OR is_cash = false) AND status IN ('ended', 'completed')
    `;
    const digital = digitalRows[0] as Record<string, unknown>;

    // Launch offer enrollment
    const offerRows = await sql`
      SELECT rides_used, earnings_used, total_waived_fees, status, enrolled_at, exhausted_at, exhausted_reason,
             free_rides, free_earnings_cap, free_days
      FROM driver_offer_enrollments
      WHERE driver_id = ${driverId}
      ORDER BY enrolled_at DESC LIMIT 1
    `;
    const offer = offerRows[0] as Record<string, unknown> | undefined;

    // All rides breakdown (individual)
    const ridesRows = await sql`
      SELECT id, is_cash, status,
        COALESCE(final_agreed_price, amount, 0) as base_price,
        COALESCE(add_on_total, 0) as addons,
        COALESCE(driver_payout_amount, 0) as driver_payout,
        COALESCE(stripe_fee_amount, 0) as stripe_fee,
        COALESCE(platform_fee_amount, 0) as platform_fee,
        COALESCE(waived_fee_amount, 0) as waived_fee,
        created_at
      FROM rides
      WHERE driver_id = ${driverId} AND status IN ('ended', 'completed')
      ORDER BY created_at DESC
      LIMIT 20
    `;

    const cashGross = Number(cash.gross_total || 0);
    const digitalGross = Number(digital.gross_total || 0);
    const digitalNet = Number(digital.net_to_driver || 0);
    const stripeFees = Number(digital.stripe_fees || 0);
    const platformFees = Number(digital.platform_fees || 0);
    const waivedFees = Number(digital.waived_fees || 0);

    // Validation checks
    const expectedDigitalNet = digitalGross - stripeFees - platformFees;
    const digitalNetMatch = Math.abs(expectedDigitalNet - digitalNet) < 0.02;

    return NextResponse.json({
      summary: {
        totalRides: Number(cash.rides || 0) + Number(digital.rides || 0),
        cashRides: Number(cash.rides || 0),
        digitalRides: Number(digital.rides || 0),
      },
      cash: {
        rides: Number(cash.rides || 0),
        baseTotal: Number(cash.base_total || 0),
        addonTotal: Number(cash.addon_total || 0),
        grossCollected: cashGross,
      },
      digital: {
        rides: Number(digital.rides || 0),
        baseTotal: Number(digital.base_total || 0),
        addonTotal: Number(digital.addon_total || 0),
        grossTotal: digitalGross,
        stripeFees,
        platformFees,
        waivedFees,
        netToDriver: digitalNet,
      },
      totals: {
        grossEarnings: cashGross + digitalGross,
        totalDriverKeeps: cashGross + digitalNet,
        totalFees: stripeFees + platformFees,
        totalWaived: waivedFees,
      },
      launchOffer: offer ? {
        status: offer.status,
        ridesUsed: Number(offer.rides_used || 0),
        earningsTracked: Number(offer.earnings_used || 0),
        expectedEarnings: cashGross + digitalGross,
        feesSaved: Number(offer.total_waived_fees || 0),
        limits: {
          rides: Number(offer.free_rides || 0),
          earningsCap: Number(offer.free_earnings_cap || 0),
          days: Number(offer.free_days || 0),
        },
        enrolledAt: offer.enrolled_at,
        exhaustedAt: offer.exhausted_at,
        exhaustedReason: offer.exhausted_reason,
      } : null,
      validation: {
        digitalNetMatch,
        expectedDigitalNet: Math.round(expectedDigitalNet * 100) / 100,
        actualDigitalNet: digitalNet,
        formula: 'Digital gross - Stripe fees - Platform fees = Digital net to driver',
        offerFormula: 'Launch offer earnings_used should equal Cash gross + Digital gross',
      },
      rides: ridesRows.map((r: Record<string, unknown>) => ({
        id: r.id,
        isCash: r.is_cash,
        status: r.status,
        basePrice: Number(r.base_price || 0),
        addons: Number(r.addons || 0),
        gross: Number(r.base_price || 0) + Number(r.addons || 0),
        driverPayout: Number(r.driver_payout || 0),
        stripeFee: Number(r.stripe_fee || 0),
        platformFee: Number(r.platform_fee || 0),
        waivedFee: Number(r.waived_fee || 0),
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    console.error('Earnings audit error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
