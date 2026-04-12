import { sql } from '@/lib/db/client';
import { sendSms } from '@/lib/sms/textbee';

/**
 * Send an admin notification SMS if the notification type is enabled
 * and the user is not in the exclusion list.
 * Fire-and-forget — never throws, never blocks the caller.
 */
export async function notifyAdminSms(
  notificationType: string,
  message: string,
  opts?: { clerkId?: string; userId?: string }
): Promise<void> {
  try {
    const rows = await sql`
      SELECT enabled, admin_phone, excluded_user_ids
      FROM admin_notification_config
      WHERE notification_type = ${notificationType}
      LIMIT 1
    `;

    if (!rows.length) return;
    const config = rows[0] as {
      enabled: boolean;
      admin_phone: string | null;
      excluded_user_ids: string[] | null;
    };

    if (!config.enabled || !config.admin_phone) return;

    // Check exclusion list
    const excluded = config.excluded_user_ids || [];
    if (opts?.clerkId && excluded.includes(opts.clerkId)) return;
    if (opts?.userId && excluded.includes(opts.userId)) return;

    await sendSms(config.admin_phone, message, {
      eventType: notificationType,
    });
  } catch (err) {
    console.error(`Admin notify SMS failed (${notificationType}):`, err);
  }
}
