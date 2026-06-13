// Outbound partner webhooks.
//
// Vendors can't subscribe to our private Ably channels, so we POST signed
// lifecycle events to their configured webhook_url. Each event is persisted to
// partner_webhook_deliveries first (so the cron can guarantee delivery), then
// an immediate best-effort attempt fires. The retry cron
// (/api/partner/cron/retry-webhooks) redelivers anything still pending with
// exponential backoff — so delivery survives a Worker cutting the inline
// attempt short or the vendor being briefly down.
//
// Signing mirrors the inbound scheme: X-HMU-Signature: t=<unix>,v1=<hmac> over
// "<t>.<body>" using the partner's webhook_secret.

import { sql } from '@/lib/db/client';
import { hmacSha256Hex } from '@/lib/partner/crypto';

export type PartnerWebhookEvent =
  | 'booking.created'
  | 'booking.accepted'
  | 'booking.hold_failed'
  | 'booking.captured'
  | 'booking.cancelled';

const MAX_ATTEMPTS = 6;
const TIMEOUT_MS = 10_000;

// Backoff between retries, by attempt count: 1m, 5m, 15m, 1h, 6h.
const BACKOFF_SEC = [60, 300, 900, 3600, 21600];
function nextRetryIso(attempts: number): string {
  const sec = BACKOFF_SEC[Math.min(attempts - 1, BACKOFF_SEC.length - 1)] ?? 21600;
  return new Date(Date.now() + sec * 1000).toISOString();
}

interface DeliveryRow {
  id: string;
  event_type: string;
  payload: unknown;
  target_url: string;
  attempts: number;
  webhook_secret: string | null;
}

async function attemptDelivery(row: DeliveryRow): Promise<void> {
  const envelope = { id: row.id, type: row.event_type, data: row.payload };
  const body = JSON.stringify(envelope);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (row.webhook_secret) {
    const t = Math.floor(Date.now() / 1000);
    const v1 = await hmacSha256Hex(row.webhook_secret, `${t}.${body}`);
    headers['X-HMU-Signature'] = `t=${t},v1=${v1}`;
  }

  let status = 0;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(row.target_url, { method: 'POST', headers, body, signal: controller.signal });
      status = res.status;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    status = 0; // network error / timeout
  }

  const attempts = row.attempts + 1;
  if (status >= 200 && status < 300) {
    await sql`
      UPDATE partner_webhook_deliveries
      SET status = ${status}, attempts = ${attempts}, delivered_at = NOW(), next_retry_at = NULL
      WHERE id = ${row.id}
    `;
  } else {
    const giveUp = attempts >= MAX_ATTEMPTS;
    await sql`
      UPDATE partner_webhook_deliveries
      SET status = ${status}, attempts = ${attempts},
          next_retry_at = ${giveUp ? null : nextRetryIso(attempts)}
      WHERE id = ${row.id}
    `;
  }
}

/**
 * Queue + best-effort-deliver a lifecycle event to the partner's webhook_url.
 * Safe to call fire-and-forget. No-ops if the partner has no webhook configured.
 * The INSERT is awaited (fast); the first delivery attempt is fired without
 * blocking, and the retry cron backstops it.
 */
export async function dispatchPartnerEvent(
  partnerId: string,
  eventType: PartnerWebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  const rows = await sql`SELECT webhook_url, webhook_secret FROM api_partners WHERE id = ${partnerId} LIMIT 1`;
  const p = rows[0] as { webhook_url: string | null; webhook_secret: string | null } | undefined;
  if (!p?.webhook_url) return; // no webhook configured

  const ins = await sql`
    INSERT INTO partner_webhook_deliveries (partner_id, event_type, payload, target_url, attempts, next_retry_at)
    VALUES (${partnerId}, ${eventType}, ${JSON.stringify(payload)}::jsonb, ${p.webhook_url}, 0, NOW())
    RETURNING id
  `;
  const id = (ins[0] as { id: string }).id;

  // Best-effort immediate attempt; cron guarantees eventual delivery.
  void attemptDelivery({
    id,
    event_type: eventType,
    payload,
    target_url: p.webhook_url,
    attempts: 0,
    webhook_secret: p.webhook_secret,
  }).catch(() => {});
}

/** Redeliver pending webhooks whose backoff has elapsed. Returns count processed. */
export async function retryPartnerWebhooks(limit = 50): Promise<number> {
  const rows = await sql`
    SELECT d.id, d.event_type, d.payload, d.target_url, d.attempts, p.webhook_secret
    FROM partner_webhook_deliveries d
    JOIN api_partners p ON p.id = d.partner_id
    WHERE d.delivered_at IS NULL
      AND d.next_retry_at IS NOT NULL
      AND d.next_retry_at <= NOW()
      AND d.attempts < ${MAX_ATTEMPTS}
    ORDER BY d.next_retry_at ASC
    LIMIT ${limit}
  `;
  for (const r of rows) {
    await attemptDelivery(r as DeliveryRow);
  }
  return rows.length;
}
