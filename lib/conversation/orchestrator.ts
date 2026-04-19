// Reply orchestrator. Wires persona + config + Claude + SMS together.
// Called from inbound.ts AFTER the non-STOP message has been logged and the
// thread's messages_received counter incremented.
//
// Short-circuits on every guard violation (flag off, opt-out, cap hit,
// hand-off regex, rate limit, spend cap) — never throws.

import { sql } from '@/lib/db/client';
import { sendSms } from '@/lib/sms/textbee';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { getConfig } from './config';
import { getPersonaById, type ConversationPersona } from './personas';
import { generateReply, canAffordCall, recordSpend, type ClaudeMessage } from './claude';
import { needsHandoff, HANDOFF_MESSAGE } from './handoff';
import { composeSystemPrompt } from './prompt-parts';

const FLAG = 'conversation_agent';
const HISTORY_LIMIT = 10;

export type OrchestratorResult =
  | { handled: true; action: 'handoff' | 'replied' | 'capped'; text?: string }
  | { handled: false; reason: string };

export async function handleReply(threadId: string, latestInboundBody: string): Promise<OrchestratorResult> {
  try {
    const flagOn = await isFeatureEnabled(FLAG);
    if (!flagOn) return { handled: false, reason: 'flag-off' };

    const threadRows = await sql`
      SELECT t.id, t.user_id, t.persona_id, t.status, t.phone, t.market_slug,
        t.messages_sent, t.messages_received, t.last_outbound_at, t.vision_delivered_at,
        t.flagged_for_review,
        u.opt_in_sms
      FROM conversation_threads t
      JOIN users u ON u.id = t.user_id
      WHERE t.id = ${threadId}
      LIMIT 1
    `;
    const thread = threadRows[0] as {
      id: string;
      user_id: string;
      persona_id: string;
      status: string;
      phone: string;
      market_slug: string | null;
      messages_sent: number;
      messages_received: number;
      last_outbound_at: Date | null;
      vision_delivered_at: Date | null;
      flagged_for_review: boolean;
      opt_in_sms: boolean;
    } | undefined;

    if (!thread) return { handled: false, reason: 'thread-not-found' };
    if (!thread.opt_in_sms) return { handled: false, reason: 'opt-in-false' };
    if (thread.status === 'opted_out' || thread.status === 'closed' || thread.status === 'manual') {
      return { handled: false, reason: `status-${thread.status}` };
    }

    const config = await getConfig();

    // Cap check — if we've received more inbound than allowed, we explicitly
    // hand off one last time (so the user knows we're not ghosting them).
    if (thread.messages_received > config.max_inbound_per_thread) {
      await flagAndSendHandoff(thread, 'inbound-cap-reached');
      return { handled: true, action: 'capped', text: HANDOFF_MESSAGE };
    }

    // Rate-limit: don't reply twice inside the Claude-call window.
    if (thread.last_outbound_at) {
      const ageSec = (Date.now() - new Date(thread.last_outbound_at).getTime()) / 1000;
      if (ageSec < config.claude_rate_limit_seconds) {
        return { handled: false, reason: 'rate-limited' };
      }
    }

    // Hand-off short-circuit — skip Claude entirely on hot topics.
    const handoff = needsHandoff(latestInboundBody);
    if (handoff.handoff) {
      await flagAndSendHandoff(thread, `handoff:${handoff.matchedPattern ?? 'pattern'}`);
      return { handled: true, action: 'handoff', text: HANDOFF_MESSAGE };
    }

    // Spend guardrail.
    const afford = await canAffordCall();
    if (!afford.ok) {
      console.warn('[conversation/orchestrator] spend cap reached, skipping Claude');
      return { handled: false, reason: 'spend-cap-reached' };
    }

    const persona = await getPersonaById(thread.persona_id);
    if (!persona || !persona.is_active) return { handled: false, reason: 'persona-inactive' };

    // Compose prompt with vision directive if this is the first non-STOP reply.
    const shouldDeliverVision =
      !thread.vision_delivered_at &&
      config.vision_trigger === 'first_reply' &&
      !!persona.vision_template;

    const systemPrompt = buildSystemPrompt(persona, shouldDeliverVision);
    const messages = await loadHistory(thread.id, HISTORY_LIMIT);

    const result = await generateReply({
      model: config.claude_model,
      systemPrompt,
      messages,
      maxTokens: 256,
      temperature: 0.7,
    });

    if (!result.success) {
      console.error('[conversation/orchestrator] Claude call failed:', result.error);
      await sql`
        INSERT INTO conversation_messages (thread_id, direction, body, generated_by, delivery_status, error_message)
        VALUES (${thread.id}, 'outbound', ${'[claude error]'}, 'claude', 'failed', ${result.error.slice(0, 500)})
      `;
      return { handled: false, reason: 'claude-failed' };
    }

    await recordSpend(result.costCents);

    const replyText = truncateForSms(result.text);

    const sendResult = await sendSms(thread.phone, replyText, {
      userId: thread.user_id,
      eventType: 'conversation_claude_reply',
      market: thread.market_slug || 'atl',
    });

    await sql`
      INSERT INTO conversation_messages (thread_id, direction, body, generated_by, delivery_status, voipms_id, error_message)
      VALUES (
        ${thread.id}, 'outbound', ${replyText}, 'claude',
        ${sendResult.success ? 'sent' : 'failed'},
        ${sendResult.messageId ?? null},
        ${sendResult.success ? null : (sendResult.error ?? 'unknown')}
      )
    `;

    if (sendResult.success) {
      await sql`
        UPDATE conversation_threads
        SET
          status = CASE WHEN status = 'pending' THEN 'active' ELSE status END,
          messages_sent = messages_sent + 1,
          last_outbound_at = NOW(),
          vision_delivered_at = CASE WHEN ${shouldDeliverVision}::boolean AND vision_delivered_at IS NULL THEN NOW() ELSE vision_delivered_at END,
          updated_at = NOW()
        WHERE id = ${thread.id}
      `;
    }

    return { handled: true, action: 'replied', text: replyText };
  } catch (err) {
    console.error('[conversation/orchestrator] handleReply failed:', err);
    return { handled: false, reason: 'error' };
  }
}

function buildSystemPrompt(persona: ConversationPersona, includeVision: boolean): string {
  return composeSystemPrompt({
    personaSystemPrompt: persona.system_prompt,
    visionTemplate: persona.vision_template,
    includeVisionDirective: includeVision,
  });
}

async function loadHistory(threadId: string, limit: number): Promise<ClaudeMessage[]> {
  const rows = await sql`
    SELECT direction, body
    FROM conversation_messages
    WHERE thread_id = ${threadId}
    ORDER BY sent_at ASC
    LIMIT ${limit}
  `;
  const msgs: ClaudeMessage[] = (rows as Array<{ direction: string; body: string }>)
    .map(r => ({
      role: r.direction === 'inbound' ? ('user' as const) : ('assistant' as const),
      content: r.body,
    }));

  // Claude requires messages to alternate strictly and the first to be 'user'.
  // Collapse consecutive same-role messages by concatenation.
  const collapsed: ClaudeMessage[] = [];
  for (const m of msgs) {
    const last = collapsed[collapsed.length - 1];
    if (last && last.role === m.role) {
      last.content += '\n' + m.content;
    } else {
      collapsed.push({ ...m });
    }
  }
  // If history starts with assistant (shouldn't happen — greeting is outbound
  // and user's reply is logged inbound before this is called), drop it.
  while (collapsed.length > 0 && collapsed[0].role !== 'user') collapsed.shift();

  // Must end with user (the inbound we just got). If it doesn't, the caller
  // sequence is broken; return empty so Claude refuses cleanly.
  if (collapsed.length === 0 || collapsed[collapsed.length - 1].role !== 'user') {
    return [];
  }

  return collapsed;
}

function truncateForSms(text: string): string {
  const SMS_MAX = 155;
  if (text.length <= SMS_MAX) return text;
  return text.slice(0, SMS_MAX - 1).trimEnd() + '…';
}

async function flagAndSendHandoff(
  thread: {
    id: string; user_id: string; phone: string; market_slug: string | null; flagged_for_review: boolean;
  },
  reason: string,
): Promise<void> {
  const sendResult = await sendSms(thread.phone, HANDOFF_MESSAGE, {
    userId: thread.user_id,
    eventType: 'conversation_handoff',
    market: thread.market_slug || 'atl',
  });

  await sql`
    INSERT INTO conversation_messages (thread_id, direction, body, generated_by, delivery_status, voipms_id, error_message)
    VALUES (
      ${thread.id}, 'outbound', ${HANDOFF_MESSAGE}, 'template',
      ${sendResult.success ? 'sent' : 'failed'},
      ${sendResult.messageId ?? null},
      ${sendResult.success ? null : (sendResult.error ?? 'unknown')}
    )
  `;
  await sql`
    UPDATE conversation_threads
    SET
      flagged_for_review = TRUE,
      flag_reason = COALESCE(flag_reason, ${reason}),
      messages_sent = messages_sent + ${sendResult.success ? 1 : 0},
      last_outbound_at = CASE WHEN ${sendResult.success}::boolean THEN NOW() ELSE last_outbound_at END,
      updated_at = NOW()
    WHERE id = ${thread.id}
  `;
}
