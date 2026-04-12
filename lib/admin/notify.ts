import { sql } from '@/lib/db/client';
import { sendSms } from '@/lib/sms/textbee';

/**
 * Send an admin notification SMS if the notification type is enabled,
 * the user is not in the exclusion list, and date filters pass.
 * Fire-and-forget — never throws, never blocks the caller.
 */
export async function notifyAdminSms(
  notificationType: string,
  message: string,
  opts?: { clerkId?: string; userId?: string; userCreatedAt?: string }
): Promise<void> {
  try {
    const rows = await sql`
      SELECT enabled, admin_phone, excluded_user_ids, signup_after, exclude_before
      FROM admin_notification_config
      WHERE notification_type = ${notificationType}
      LIMIT 1
    `;

    if (!rows.length) return;
    const config = rows[0] as {
      enabled: boolean;
      admin_phone: string | null;
      excluded_user_ids: string[] | null;
      signup_after: string | null;
      exclude_before: string | null;
    };

    if (!config.enabled || !config.admin_phone) return;

    // Check exclusion list
    const excluded = config.excluded_user_ids || [];
    if (opts?.clerkId && excluded.includes(opts.clerkId)) return;
    if (opts?.userId && excluded.includes(opts.userId)) return;

    // Check date filters — if user has a creation date, apply filters
    if (opts?.userCreatedAt || opts?.userId) {
      let createdAt: Date | null = opts.userCreatedAt ? new Date(opts.userCreatedAt) : null;

      // Look up user created_at if not provided
      if (!createdAt && opts.userId) {
        const userRows = await sql`SELECT created_at FROM users WHERE id = ${opts.userId} LIMIT 1`;
        if (userRows.length) createdAt = new Date(userRows[0].created_at as string);
      } else if (!createdAt && opts.clerkId) {
        const userRows = await sql`SELECT created_at FROM users WHERE clerk_id = ${opts.clerkId} LIMIT 1`;
        if (userRows.length) createdAt = new Date(userRows[0].created_at as string);
      }

      if (createdAt) {
        // exclude_before: skip users who signed up before this date
        if (config.exclude_before) {
          const cutoff = new Date(config.exclude_before);
          if (createdAt < cutoff) return;
        }

        // signup_after: only notify for users who signed up after this date
        if (config.signup_after) {
          const after = new Date(config.signup_after);
          if (createdAt < after) return;
        }
      }
    }

    await sendSms(config.admin_phone, message, {
      eventType: notificationType,
    });
  } catch (err) {
    console.error(`Admin notify SMS failed (${notificationType}):`, err);
  }
}
