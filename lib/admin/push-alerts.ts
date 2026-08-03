// Super-admin push alerts — per-request "new ride" pings and the daily summary.
// Both are gated by a superadmin config (platform_config admin.push_alerts),
// each default ON. All sends are best-effort and never block their caller.

import { sql } from '@/lib/db/client';
import { sendPushToUser, type PushMessage } from '@/lib/push/send';
import { getPlatformConfig } from '@/lib/platform-config/get';

// A `type` (not interface) so it satisfies getPlatformConfig's Record constraint.
export type AdminPushConfig = {
  rideRequests: boolean; // push on every ride request
  dailySummary: boolean; // 7am ET daily summary push
};

const DEFAULTS: AdminPushConfig = { rideRequests: true, dailySummary: true };

export async function getAdminPushConfig(): Promise<AdminPushConfig> {
  return getPlatformConfig('admin.push_alerts', DEFAULTS);
}

/** Push a message to every super-admin who has a registered device. Best-effort. */
export async function notifySuperAdmins(msg: PushMessage): Promise<number> {
  const rows = await sql`
    SELECT u.id
    FROM users u
    JOIN admin_roles ar ON ar.id = u.admin_role_id
    WHERE u.is_admin = true
      AND ar.is_super = true
      AND u.push_token IS NOT NULL
  `;
  const ids = (rows as { id: string }[]).map((r) => r.id);
  await Promise.all(ids.map((id) => sendPushToUser(id, msg).catch(() => {})));
  return ids.length;
}

export interface DailySummary {
  requested: number; completed: number; gmv: number; revenue: number; profit: number;
}

/** Compute the trailing-24h metrics. */
export async function computeDailySummary(): Promise<DailySummary> {
  const rows = await sql`
    SELECT
      (SELECT COUNT(*) FROM hmu_posts
        WHERE post_type IN ('direct_booking','blast','down_bad','rider_request')
          AND created_at > NOW() - INTERVAL '24 hours') AS requested,
      (SELECT COUNT(*) FROM rides
        WHERE status IN ('completed','ended')
          AND completed_at > NOW() - INTERVAL '24 hours') AS completed,
      (SELECT COALESCE(SUM(final_agreed_price), 0) FROM rides
        WHERE payment_captured = true AND payment_captured_at > NOW() - INTERVAL '24 hours') AS gmv,
      (SELECT COALESCE(SUM(platform_fee_amount), 0) FROM rides
        WHERE payment_captured = true AND payment_captured_at > NOW() - INTERVAL '24 hours') AS revenue,
      (SELECT COALESCE(SUM(stripe_fee_amount), 0) FROM rides
        WHERE payment_captured = true AND payment_captured_at > NOW() - INTERVAL '24 hours') AS stripe_cost
  `;
  const m = rows[0] as Record<string, string>;
  const revenue = Number(m.revenue);
  return {
    requested: Number(m.requested),
    completed: Number(m.completed),
    gmv: Number(m.gmv),
    revenue,
    profit: revenue - Number(m.stripe_cost),
  };
}

/** Compute + push the daily summary to super-admins. Returns metrics + recipient count. */
export async function sendDailySummary(): Promise<DailySummary & { recipients: number }> {
  const s = await computeDailySummary();
  const money = (n: number) => `$${n.toFixed(2)}`;
  const recipients = await notifySuperAdmins({
    title: `📊 HMU daily — ${s.requested} requested, ${s.completed} completed`,
    body: `GMV ${money(s.gmv)} · Revenue ${money(s.revenue)} · Profit ${money(s.profit)} (last 24h)`,
    data: { type: 'admin_daily_summary', ...s },
  });
  return { ...s, recipients };
}

const KIND_LABEL: Record<string, string> = {
  direct_booking: 'ride',
  blast: 'blast',
  down_bad: 'Down Bad',
  rider_request: 'ride',
};

/**
 * Fire a "new ride request" push to super-admins, if enabled. Fire-and-forget:
 * callers should not await this on the request path.
 */
export async function alertRideRequested(params: {
  kind: 'direct_booking' | 'blast' | 'down_bad' | 'rider_request';
  riderHandle?: string | null;
  price?: number | null;
  areas?: string | null;
}): Promise<void> {
  try {
    const cfg = await getAdminPushConfig();
    if (!cfg.rideRequests) return;

    const who = params.riderHandle ? `@${params.riderHandle}` : 'A rider';
    const label = KIND_LABEL[params.kind] ?? 'ride';
    const bits = [params.areas, params.price != null ? `$${params.price}` : null].filter(Boolean).join(' · ');

    await notifySuperAdmins({
      title: `🚗 New ${label} request`,
      body: bits ? `${who} — ${bits}` : `${who} just requested a ${label}.`,
      data: { type: 'admin_ride_request', kind: params.kind },
    });
  } catch { /* best-effort */ }
}
