// Attribution — first-touch UTM capture keyed by cookie_id.
// Cookie is set by middleware. Client fires /api/attribution/touch when UTMs exist in URL.
// On signup, server-side attachAttributionToUser() links the cookie_id to the new user.

import { sql } from '@/lib/db/client';

export const ATTRIB_COOKIE = 'hmu_attrib_id';

export interface AttributionTouch {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  referrer?: string | null;
  landing_path?: string | null;
}

export async function recordFirstTouch(cookieId: string, data: AttributionTouch): Promise<void> {
  await sql`
    INSERT INTO user_attribution (
      cookie_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      referrer, landing_path
    ) VALUES (
      ${cookieId},
      ${data.utm_source ?? null},
      ${data.utm_medium ?? null},
      ${data.utm_campaign ?? null},
      ${data.utm_content ?? null},
      ${data.utm_term ?? null},
      ${data.referrer ?? null},
      ${data.landing_path ?? null}
    )
    ON CONFLICT (cookie_id) DO NOTHING
  `;
}

export async function attachAttributionToUser(cookieId: string, userId: string): Promise<void> {
  await sql`
    UPDATE user_attribution
    SET user_id = ${userId}, attached_at = NOW()
    WHERE cookie_id = ${cookieId} AND user_id IS NULL
  `;
}
