// Weekly cron — scans drivers with incomplete profiles or no recent activity
// and publishes a single targeted tip to user:{userId}:notify.
//
// Trigger from Cloudflare Workers cron (wrangler.worker.jsonc):
//   { "crons": [{ "name": "driver-nudges", "cron": "0 17 * * 1" }] }  // Mon 17:00 UTC = 12pm ET
//
// Request security: Bearer token in Authorization header (CRON_SECRET).

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { notifyUser } from '@/lib/ably/server';
import { isFeatureEnabled } from '@/lib/feature-flags';

interface StaleDriver {
  user_id: string;
  thumbnail_url: string | null;
  video_url: string | null;
  pricing: unknown;
  schedule: unknown;
  area_slugs: string[] | null;
  last_post_at: Date | null;
}

function isEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v !== 'object') return false;
  if (Array.isArray(v)) return v.length === 0;
  return Object.keys(v as object).length === 0;
}

function pickTip(d: StaleDriver): { id: string; title: string; body: string; cta_label: string; cta_href: string } | null {
  if (!d.thumbnail_url) {
    return {
      id: 'nudge_photo',
      title: 'Add a profile photo — riders book faces they trust.',
      body: 'One upload. 2x your match rate.',
      cta_label: 'Update profile',
      cta_href: '/driver/profile',
    };
  }
  if (!d.video_url) {
    return {
      id: 'nudge_video',
      title: 'Add a 15-second video intro.',
      body: 'The #1 thing that gets you picked. Takes 30 seconds.',
      cta_label: 'Record now',
      cta_href: '/driver/profile',
    };
  }
  if (isEmpty(d.pricing)) {
    return {
      id: 'nudge_pricing',
      title: 'Set your pricing — you\'re invisible without it.',
      body: 'Let HMU set defaults at $25 min, or set your own in 10 seconds.',
      cta_label: 'Set prices',
      cta_href: '/driver/profile',
    };
  }
  if (isEmpty(d.schedule)) {
    return {
      id: 'nudge_schedule',
      title: 'Pick your days. No schedule = no matches.',
      body: 'Fri + Sat covers most drivers. Add more whenever.',
      cta_label: 'Set schedule',
      cta_href: '/driver/profile',
    };
  }
  if (!d.area_slugs || d.area_slugs.length === 0) {
    return {
      id: 'nudge_areas',
      title: 'Where you running? Pick your areas.',
      body: 'Riders filter by area. Leave it empty and you stay hidden.',
      cta_label: 'Pick areas',
      cta_href: '/driver/profile',
    };
  }
  const now = Date.now();
  const lastPost = d.last_post_at ? new Date(d.last_post_at).getTime() : 0;
  const daysSincePost = lastPost ? (now - lastPost) / 86_400_000 : Infinity;
  if (daysSincePost > 14) {
    return {
      id: 'nudge_post',
      title: 'Been quiet this week — drop your HMU link in a FB group.',
      body: 'Uber buys ads. You ARE the ad.',
      cta_label: 'See the groups',
      cta_href: '/driver/playbook#fb-groups',
    };
  }
  return null;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') || '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const globalEnabled = await isFeatureEnabled('driver_playbook');
  if (!globalEnabled) {
    return NextResponse.json({ ok: true, skipped: 'flag-off' });
  }

  const rows = (await sql`
    SELECT
      dp.user_id,
      dp.thumbnail_url, dp.video_url, dp.pricing, dp.schedule, dp.area_slugs,
      (SELECT MAX(created_at) FROM hmu_posts WHERE user_id = dp.user_id) AS last_post_at
    FROM driver_profiles dp
    INNER JOIN users u ON u.id = dp.user_id
    LEFT JOIN user_preferences up ON up.user_id = dp.user_id
    WHERE u.account_status = 'active'
      AND u.profile_type = 'driver'
      AND COALESCE(up.hide_tips, FALSE) = FALSE
    LIMIT 500
  `) as StaleDriver[];

  let sent = 0;
  for (const d of rows) {
    const tip = pickTip(d);
    if (!tip) continue;
    try {
      await notifyUser(d.user_id, 'tip', tip);
      sent++;
    } catch (err) {
      console.error('notify failed for', d.user_id, err);
    }
  }

  return NextResponse.json({ ok: true, scanned: rows.length, sent });
}
