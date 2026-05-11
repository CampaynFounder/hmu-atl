// POST /api/admin/users/[userId]/send-activation-nudge — Send a single
// activation-nudge SMS to one specific user. Mirrors the cohort logic in
// /api/admin/activation/bulk-nudge but operates on one row, so the admin can
// fire a nudge directly from the user detail page (e.g. "share your HMU link"
// promo for a payment-ready driver).
//
// Body: { checkKey: ActivationCheckKey, ackDuplicate?: boolean }
//
// Returns:
//   200 { sent: 1, eventType, smsPreview } — SMS delivered.
//   409 { error: 'duplicate_within_window', lastSentAt, windowHours } —
//       user got this exact nudge inside the dedup window. Caller can resend
//       by passing ackDuplicate=true.
//   422 { error: 'check_not_applicable', reason } — the chip wouldn't show on
//       /admin/activation (e.g. promo prerequisites not met, or gap already
//       satisfied). Don't send hollow nudges.
//
// RBAC note: this lives behind requireAdmin() today. To grant non-super roles
// (e.g. Sr Growth Manager) the ability to fire activation nudges, register a
// slug like 'activation:send_nudge' in lib/admin/route-permissions.ts and
// gate via admin.permissions instead of relying solely on requireAdmin.
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import { sendSms } from '@/lib/sms/textbee';
import { wasRecentlySent, DEFAULT_DEDUP_WINDOW_HOURS } from '@/lib/sms/dedup';
import {
  computeDriverChecks, computeRiderChecks, renderSms,
  type ActivationCheckKey,
} from '@/lib/admin/activation-checks';

interface DriverRow {
  user_id: string;
  display_name: string | null;
  handle: string | null;
  phone: string | null;
  area_slugs: string[] | null;
  services_entire_market: boolean | null;
  pricing: Record<string, unknown> | null;
  thumbnail_url: string | null;
  video_url: string | null;
  vehicle_info: Record<string, unknown> | null;
  profile_visible: boolean | null;
  stripe_onboarding_complete: boolean | null;
  deposit_floor: string | number | null;
  location_updated_at: string | null;
}

interface RiderRow {
  user_id: string;
  display_name: string | null;
  phone: string | null;
  thumbnail_url: string | null;
  avatar_url: string | null;
  last_sign_in_at: string | null;
  rides_completed_count: number;
  ride_requests_count: number;
  has_payment_method: boolean;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { id: userId } = await params;
  const body = await req.json().catch(() => ({})) as {
    checkKey?: string;
    ackDuplicate?: boolean;
  };
  if (!body.checkKey) {
    return NextResponse.json({ error: 'checkKey required' }, { status: 400 });
  }
  const checkKey = body.checkKey as ActivationCheckKey;

  const userRows = await sql`
    SELECT id, profile_type, account_status
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  ` as Array<{ id: string; profile_type: string; account_status: string }>;
  const user = userRows[0];
  if (!user) {
    return NextResponse.json({ error: 'user not found' }, { status: 404 });
  }

  let smsTemplate = '';
  let displayName: string | null = null;
  let phone: string | null = null;

  if (user.profile_type === 'driver' || user.profile_type === 'both') {
    const rows = await sql`
      SELECT
        u.id as user_id, dp.display_name, dp.handle, dp.phone, dp.area_slugs,
        dp.services_entire_market, dp.pricing, dp.thumbnail_url, dp.video_url,
        dp.vehicle_info, dp.profile_visible, dp.stripe_onboarding_complete,
        dp.deposit_floor, dp.location_updated_at
      FROM users u
      LEFT JOIN driver_profiles dp ON dp.user_id = u.id
      WHERE u.id = ${userId}
      LIMIT 1
    ` as unknown as DriverRow[];
    const d = rows[0];
    if (!d) {
      return NextResponse.json({ error: 'driver profile not found' }, { status: 404 });
    }
    const checks = computeDriverChecks({
      display_name: d.display_name, handle: d.handle, area_slugs: d.area_slugs,
      services_entire_market: d.services_entire_market, pricing: d.pricing,
      thumbnail_url: d.thumbnail_url, video_url: d.video_url,
      vehicle_info: d.vehicle_info, profile_visible: d.profile_visible,
      stripe_onboarding_complete: d.stripe_onboarding_complete,
      deposit_floor: d.deposit_floor, location_updated_at: d.location_updated_at,
      has_profile_row: !!d.handle || !!d.display_name,
    });
    const match = checks.find(c => c.key === checkKey);
    if (!match) {
      return NextResponse.json(
        { error: 'check_not_applicable', reason: `Unknown driver checkKey '${checkKey}'.` },
        { status: 422 },
      );
    }
    if (match.passed) {
      // Same gate the activation page uses: passed=true means chip wouldn't
      // show. For promo chips this means prerequisites unmet (e.g. driver
      // isn't payment-ready, no handle to share).
      const reason = match.tone === 'promo'
        ? `Driver isn't ready for "${match.label}" yet — finish payment-ready prerequisites (pricing, payout setup, deposit floor) and a handle.`
        : `Driver already cleared "${match.label}". No nudge needed.`;
      return NextResponse.json({ error: 'check_not_applicable', reason }, { status: 422 });
    }
    smsTemplate = match.smsTemplate;
    displayName = d.display_name;
    phone = d.phone;
  } else if (user.profile_type === 'rider') {
    const rows = await sql`
      SELECT
        u.id as user_id, rp.display_name, rp.phone, rp.thumbnail_url, rp.avatar_url,
        u.last_sign_in_at,
        (SELECT COUNT(*) FROM rides r WHERE r.rider_id = u.id AND r.status = 'completed') as rides_completed_count,
        (SELECT COUNT(*) FROM hmu_posts hp WHERE hp.user_id = u.id AND hp.post_type = 'rider_request') as ride_requests_count,
        EXISTS (SELECT 1 FROM rider_payment_methods rpm WHERE rpm.rider_id = u.id) as has_payment_method
      FROM users u
      LEFT JOIN rider_profiles rp ON rp.user_id = u.id
      WHERE u.id = ${userId}
      LIMIT 1
    ` as unknown as RiderRow[];
    const r = rows[0];
    if (!r) {
      return NextResponse.json({ error: 'rider profile not found' }, { status: 404 });
    }
    const checks = computeRiderChecks({
      display_name: r.display_name, thumbnail_url: r.thumbnail_url,
      avatar_url: r.avatar_url, last_sign_in_at: r.last_sign_in_at,
      rides_completed_count: Number(r.rides_completed_count ?? 0),
      ride_requests_count: Number(r.ride_requests_count ?? 0),
      has_payment_method: r.has_payment_method,
      has_profile_row: !!r.display_name,
    });
    const match = checks.find(c => c.key === checkKey);
    if (!match) {
      return NextResponse.json(
        { error: 'check_not_applicable', reason: `Unknown rider checkKey '${checkKey}'.` },
        { status: 422 },
      );
    }
    if (match.passed) {
      return NextResponse.json(
        { error: 'check_not_applicable', reason: `Rider already cleared "${match.label}".` },
        { status: 422 },
      );
    }
    smsTemplate = match.smsTemplate;
    displayName = r.display_name;
    phone = r.phone;
  } else {
    return NextResponse.json(
      { error: 'check_not_applicable', reason: `Activation nudges are driver/rider only (got ${user.profile_type}).` },
      { status: 422 },
    );
  }

  if (!phone) {
    return NextResponse.json(
      { error: 'no_phone', reason: 'User has no phone on their profile — can\'t SMS.' },
      { status: 422 },
    );
  }
  if (!smsTemplate) {
    return NextResponse.json(
      { error: 'check_not_applicable', reason: 'Template empty (likely missing handle).' },
      { status: 422 },
    );
  }

  const eventType = `activation_nudge:${checkKey}`;
  const windowHours = DEFAULT_DEDUP_WINDOW_HOURS;

  if (!body.ackDuplicate) {
    const dedup = await wasRecentlySent({ userId, eventType, windowHours });
    if (dedup.recentlySent) {
      return NextResponse.json({
        error: 'duplicate_within_window',
        lastSentAt: dedup.lastSentAt,
        windowHours,
      }, { status: 409 });
    }
  }

  const normalizedPhone = phone.replace(/\D/g, '');
  const message = renderSms(smsTemplate, displayName);
  const truncated = message.length > 160 ? message.slice(0, 160) : message;

  const result = await sendSms(normalizedPhone, truncated, {
    eventType,
    market: 'atl',
    userId,
  });

  if (!result.success) {
    return NextResponse.json({
      error: 'send_failed',
      reason: result.error || 'Unknown SMS provider error',
    }, { status: 502 });
  }

  try {
    await sql`
      INSERT INTO admin_sms_sent (admin_id, recipient_id, recipient_phone, message, status)
      VALUES (${admin.id}, ${userId}, ${normalizedPhone}, ${truncated}, 'sent')
    `;
  } catch (auditErr) {
    console.error('[USER_ACTIVATION_NUDGE] audit insert failed:', auditErr);
  }

  await logAdminAction(admin.id, 'activation_user_nudge', 'user', userId, {
    checkKey, eventType, acknowledgedDuplicate: !!body.ackDuplicate,
  });

  return NextResponse.json({
    sent: 1,
    eventType,
    smsPreview: truncated,
  });
}
