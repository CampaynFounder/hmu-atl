import webpush from 'web-push';
import { neon } from '@neondatabase/serverless';
import { redis } from './redis';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY!;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY!;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:admin@hmu-atl.com';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}
export { VAPID_PUBLIC_KEY };

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}
export interface PushNotificationPayload {
  title: string; body: string; icon?: string; badge?: string;
  data?: Record<string, unknown>; tag?: string;
}

export async function saveSubscription(userId: string, subscription: PushSubscriptionPayload): Promise<void> {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at, updated_at)
    VALUES (${userId}, ${subscription.endpoint}, ${subscription.keys.p256dh}, ${subscription.keys.auth}, NOW(), NOW())
    ON CONFLICT (endpoint) DO UPDATE SET
      user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, updated_at = NOW()
  `;
}

export async function getSubscriptions(userId: string): Promise<PushSubscriptionPayload[]> {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ${userId}`;
  return rows.map((r) => ({ endpoint: r.endpoint as string, keys: { p256dh: r.p256dh as string, auth: r.auth as string } }));
}

export async function sendPush(userId: string, payload: PushNotificationPayload): Promise<number> {
  const dedupKey = `push:dedup:${userId}:${payload.tag ?? payload.title}`;
  const already = await redis.set(dedupKey, '1', { nx: true, ex: 60 });
  if (!already) return 0;
  const subscriptions = await getSubscriptions(userId);
  if (!subscriptions.length) return 0;
  let sent = 0;
  const sql = neon(process.env.DATABASE_URL!);
  await Promise.allSettled(subscriptions.map(async (sub) => {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload));
      sent++;
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'statusCode' in err && (err as { statusCode: number }).statusCode === 410) {
        await sql`DELETE FROM push_subscriptions WHERE endpoint = ${sub.endpoint}`;
      }
    }
  }));
  return sent;
}
