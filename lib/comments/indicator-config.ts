// Superadmin toggles for the in-app "new comment on your photo" indicator.
// Stored inside the existing `comments.settings` platform_config row so there's
// one source of truth for all comment behavior. Each flag independently enables
// a surface, so a market can disable any one without touching the others.

import { sql } from '@/lib/db/client';

export interface CommentIndicatorConfig {
  /** Red dot/count on the PROFILE tab when you have unread comments. */
  tabBadge: boolean;
  /** The dedicated Activity inbox screen listing comment notifications. */
  activityInbox: boolean;
  /** The transient in-app banner when a comment lands while the app is open. */
  liveBanner: boolean;
}

export const DEFAULT_INDICATOR_CONFIG: CommentIndicatorConfig = {
  tabBadge: true,
  activityInbox: true,
  liveBanner: true,
};

export async function getCommentIndicatorConfig(): Promise<CommentIndicatorConfig> {
  try {
    const rows = await sql`SELECT config_value FROM platform_config WHERE config_key = 'comments.settings' LIMIT 1`;
    const v = (rows[0]?.config_value as Record<string, unknown> | undefined) ?? {};
    return {
      tabBadge: v.indicatorTabBadge !== false,
      activityInbox: v.indicatorActivityInbox !== false,
      liveBanner: v.indicatorLiveBanner !== false,
    };
  } catch {
    return DEFAULT_INDICATOR_CONFIG;
  }
}
