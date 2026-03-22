// Driver Enrollment Offer Operations
// Manages the free intro offer system for new drivers

import { sql } from './client';
import type { DriverEnrollmentOffer, DriverOfferEnrollment } from './types';

// ============================================
// OFFER TEMPLATES
// ============================================

export async function getActiveOffer(): Promise<DriverEnrollmentOffer | null> {
  const rows = await sql`
    SELECT * FROM driver_enrollment_offers
    WHERE is_active = true
    LIMIT 1
  `;
  return rows[0] ?? null;
}

// ============================================
// DRIVER ENROLLMENTS
// ============================================

export async function getDriverEnrollment(driverId: string): Promise<DriverOfferEnrollment | null> {
  const rows = await sql`
    SELECT * FROM driver_offer_enrollments
    WHERE driver_id = ${driverId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function enrollDriver(
  driverId: string,
  offer: DriverEnrollmentOffer
): Promise<DriverOfferEnrollment> {
  const rows = await sql`
    INSERT INTO driver_offer_enrollments (
      driver_id, offer_id, free_rides, free_earnings_cap, free_days
    ) VALUES (
      ${driverId}, ${offer.id}, ${offer.free_rides}, ${offer.free_earnings_cap}, ${offer.free_days}
    )
    ON CONFLICT (driver_id) DO NOTHING
    RETURNING *
  `;
  // If already enrolled (conflict), return existing
  if (!rows[0]) {
    const existing = await getDriverEnrollment(driverId);
    return existing!;
  }
  return rows[0];
}

export async function updateEnrollmentProgress(
  driverId: string,
  additionalEarnings: number,
  waivedFee: number
): Promise<{ enrollment: DriverOfferEnrollment; justExhausted: boolean }> {
  // Increment progress
  const rows = await sql`
    UPDATE driver_offer_enrollments
    SET
      rides_used = rides_used + 1,
      earnings_used = earnings_used + ${additionalEarnings},
      total_waived_fees = total_waived_fees + ${waivedFee}
    WHERE driver_id = ${driverId} AND status = 'active'
    RETURNING *
  `;

  if (!rows[0]) {
    const existing = await getDriverEnrollment(driverId);
    return { enrollment: existing!, justExhausted: false };
  }

  const enrollment = rows[0] as DriverOfferEnrollment;

  // Check if any limit is now hit
  const exhaustReason = checkExhaustion(enrollment);
  if (exhaustReason) {
    await sql`
      UPDATE driver_offer_enrollments
      SET status = 'exhausted', exhausted_at = NOW(), exhausted_reason = ${exhaustReason}
      WHERE driver_id = ${driverId}
    `;
    enrollment.status = 'exhausted';
    enrollment.exhausted_reason = exhaustReason;
    return { enrollment, justExhausted: true };
  }

  return { enrollment, justExhausted: false };
}

export async function isDriverInFreeWindow(driverId: string): Promise<boolean> {
  const enrollment = await getDriverEnrollment(driverId);
  if (!enrollment || enrollment.status !== 'active') return false;

  // Check day limit
  const daysSinceEnroll = daysBetween(new Date(enrollment.enrolled_at), new Date());
  if (daysSinceEnroll >= enrollment.free_days) {
    // Expire it
    await sql`
      UPDATE driver_offer_enrollments
      SET status = 'expired', exhausted_at = NOW(), exhausted_reason = 'days_limit'
      WHERE driver_id = ${driverId} AND status = 'active'
    `;
    return false;
  }

  return true;
}

// ============================================
// HELPERS
// ============================================

function checkExhaustion(enrollment: DriverOfferEnrollment): string | null {
  const daysSinceEnroll = daysBetween(new Date(enrollment.enrolled_at), new Date());

  if (daysSinceEnroll >= enrollment.free_days) return 'days_limit';
  if (enrollment.rides_used >= enrollment.free_rides) return 'rides_limit';
  if (Number(enrollment.earnings_used) >= Number(enrollment.free_earnings_cap)) return 'earnings_limit';

  return null;
}

function daysBetween(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export function getOfferProgress(enrollment: DriverOfferEnrollment) {
  const daysSinceEnroll = daysBetween(new Date(enrollment.enrolled_at), new Date());
  const daysRemaining = Math.max(0, enrollment.free_days - daysSinceEnroll);
  const ridesRemaining = Math.max(0, enrollment.free_rides - enrollment.rides_used);
  const earningsRemaining = Math.max(0, Number(enrollment.free_earnings_cap) - Number(enrollment.earnings_used));
  const expiresAt = new Date(new Date(enrollment.enrolled_at).getTime() + enrollment.free_days * 86400000);

  return {
    ridesRemaining,
    ridesTotal: enrollment.free_rides,
    earningsRemaining: Math.round(earningsRemaining * 100) / 100,
    earningsTotal: Number(enrollment.free_earnings_cap),
    daysRemaining,
    daysTotal: enrollment.free_days,
    expiresAt,
    totalSaved: Number(enrollment.total_waived_fees),
  };
}
