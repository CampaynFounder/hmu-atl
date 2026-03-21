import twilio from 'twilio';
import { neon } from '@neondatabase/serverless';
import { redis } from './redis';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER!;

/**
 * Send an SMS to a user by their internal user ID.
 * Looks up their phone number from the Neon users table.
 * Uses Redis dedup — same (userId + body) pair is suppressed within 60 s.
 * Returns the Twilio message SID, or null if suppressed or no phone on record.
 */
export async function sendSMS(
  userId: string,
  body: string
): Promise<string | null> {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`
    SELECT phone_number FROM users WHERE id = ${userId} LIMIT 1
  `;
  const phone = rows[0]?.phone_number as string | undefined;
  if (!phone) return null;

  const dedupKey = `sms:dedup:${userId}:${body.slice(0, 64)}`;
  const allowed = await redis.set(dedupKey, '1', { nx: true, ex: 60 });
  if (!allowed) return null;

  const message = await client.messages.create({ from: FROM_NUMBER, to: phone, body });
  return message.sid;
}
