// Inbound routing — called from the VoIP.ms webhook AFTER the existing
// sms_inbound insert. Checks if this phone matches an active thread, handles
// STOP, otherwise logs to conversation_messages for Phase 3 to process.

import { sql } from '@/lib/db/client';
import { sendSms } from '@/lib/sms/textbee';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { getConfig } from './config';
import { handleReply } from './orchestrator';

const FLAG = 'conversation_agent';

// Match on the whole trimmed message (case-insensitive). Common TCPA/CTIA
// stop-keyword set. STOPALL and UNSUBSCRIBE are in CTIA's required list.
const STOP_KEYWORDS = new Set([
  'STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT',
]);

export function isStopKeyword(message: string): boolean {
  const trimmed = message.trim().toUpperCase();
  return STOP_KEYWORDS.has(trimmed);
}

interface ActiveThread {
  id: string;
  user_id: string;
  persona_id: string;
  status: string;
  phone: string;
  market_slug: string | null;
  messages_received: number;
}

// Find an active/pending/dormant thread for this normalized phone. Ignores
// opted_out/closed threads — STOP is sticky.
export async function findThreadByPhone(phone10: string): Promise<ActiveThread | null> {
  // Thread phone is stored in Clerk's E.164 format (e.g. "+15551234567"),
  // inbound is normalized to 10 digits. Compare last 10 digits on both sides.
  const rows = await sql`
    SELECT id, user_id, persona_id, status, phone, market_slug, messages_received
    FROM conversation_threads
    WHERE RIGHT(REGEXP_REPLACE(phone, '\D', '', 'g'), 10) = ${phone10}
      AND status IN ('pending','active','dormant','manual')
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  return (rows[0] as ActiveThread) ?? null;
}

export interface InboundResult {
  handled: boolean;
  reason: string;
  action?: 'logged' | 'opted_out';
}

// Fire-and-forget from the VoIP.ms webhook.
// IMPORTANT: never throws — caller's existing flow must continue regardless.
export async function handleConversationInbound(
  phone10: string,
  message: string,
  voipmsId: string | null,
): Promise<InboundResult> {
  try {
    const flagOn = await isFeatureEnabled(FLAG);
    if (!flagOn) {
      console.log('[conversation/inbound] short-circuit: flag off', { phone10 });
      return { handled: false, reason: 'flag-off' };
    }

    const thread = await findThreadByPhone(phone10);
    if (!thread) {
      console.log('[conversation/inbound] no matching thread for inbound', { phone10, messagePreview: message.slice(0, 40) });
      return { handled: false, reason: 'no-thread' };
    }
    console.log('[conversation/inbound] matched thread', { threadId: thread.id, status: thread.status, phone10 });

    // Always log the inbound for audit — happens before STOP processing so we
    // have the message body on record even if we later opt-out.
    await sql`
      INSERT INTO conversation_messages (thread_id, direction, body, voipms_id)
      VALUES (${thread.id}, 'inbound', ${message}, ${voipmsId})
    `;
    await sql`
      UPDATE conversation_threads
      SET messages_received = messages_received + 1, last_inbound_at = NOW(), updated_at = NOW()
      WHERE id = ${thread.id}
    `;

    if (isStopKeyword(message)) {
      await handleStop(thread);
      return { handled: true, reason: 'stop', action: 'opted_out' };
    }

    // Phase 3: route to the Claude orchestrator. Fire-and-forget — never
    // block the VoIP.ms webhook response on Claude latency.
    handleReply(thread.id, message)
      .then(result => console.log('[conversation/inbound] orchestrator result', { threadId: thread.id, result }))
      .catch(err => console.error('[conversation/inbound] orchestrator error:', err));

    return { handled: true, reason: 'logged', action: 'logged' };
  } catch (err) {
    console.error('[conversation/inbound] handleConversationInbound failed:', err);
    return { handled: false, reason: 'error' };
  }
}

async function handleStop(thread: ActiveThread): Promise<void> {
  // Flip opt-in + thread status + cancel any pending outbound.
  await sql`UPDATE users SET opt_in_sms = FALSE WHERE id = ${thread.user_id}`;
  await sql`
    UPDATE conversation_threads
    SET status = 'opted_out', opted_out_at = NOW(), updated_at = NOW()
    WHERE id = ${thread.id}
  `;
  await sql`
    UPDATE scheduled_outbound_messages
    SET status = 'cancelled', processed_at = NOW(), last_error = 'opt-out'
    WHERE thread_id = ${thread.id} AND status = 'pending'
  `;

  // Send a single acknowledgment. Honor the 155-char cap.
  try {
    const config = await getConfig();
    const ack = config.stop_acknowledgment_text || 'You\'re unsubscribed. Reply START to opt back in.';
    const result = await sendSms(thread.phone, ack, {
      userId: thread.user_id,
      eventType: 'conversation_stop_ack',
      market: thread.market_slug || 'atl',
    });
    await sql`
      INSERT INTO conversation_messages (thread_id, direction, body, generated_by, delivery_status, error_message)
      VALUES (${thread.id}, 'outbound', ${ack}, 'template',
        ${result.success ? 'sent' : 'failed'},
        ${result.success ? null : (result.error ?? 'unknown')})
    `;
  } catch (err) {
    console.error('[conversation/inbound] STOP ack failed:', err);
  }
}
