import { sql } from '@/lib/db/client';

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

// Send an OS-level push to a user's registered device via Expo's push service,
// which fans out to APNs (iOS) and FCM (Android) for us. Worker-safe: a plain
// fetch, no Node SDK. Best-effort — never throws into callers, and no-ops when
// the user has no token (e.g. permission denied or never opened a native build).
export async function sendPushToUser(userId: string, msg: PushMessage): Promise<void> {
  try {
    const rows = await sql`
      SELECT push_token FROM users
      WHERE id = ${userId} AND push_token IS NOT NULL
      LIMIT 1
    `;
    const token = (rows[0] as { push_token?: string } | undefined)?.push_token;
    if (!token) return;
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        to: token,
        title: msg.title,
        body: msg.body,
        data: msg.data ?? {},
        sound: 'default',
        priority: 'high',
        channelId: 'default',
      }),
    });
    if (!res.ok) console.error('[push] Expo send failed:', await res.text());
  } catch (err) {
    console.error('[push] send error:', err);
  }
}
