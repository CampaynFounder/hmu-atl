// Read-only thread + message queries for the Phase 1 admin viewer.
// Mutations (create thread, append message) land in Phase 2 when we start sending.

import { sql } from '@/lib/db/client';

export type ThreadStatus = 'pending' | 'active' | 'dormant' | 'opted_out' | 'closed' | 'manual';
export type MessageDirection = 'inbound' | 'outbound';
export type MessageGeneratedBy = 'template' | 'claude' | 'human';

export interface ConversationThread {
  id: string;
  user_id: string;
  persona_id: string;
  status: ThreadStatus;
  phone: string;
  market_slug: string | null;
  messages_sent: number;
  messages_received: number;
  last_outbound_at: Date | null;
  last_inbound_at: Date | null;
  vision_delivered_at: Date | null;
  opted_out_at: Date | null;
  flagged_for_review: boolean;
  flag_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ConversationMessage {
  id: string;
  thread_id: string;
  direction: MessageDirection;
  body: string;
  generated_by: MessageGeneratedBy | null;
  voipms_id: string | null;
  delivery_status: string | null;
  error_message: string | null;
  sent_at: Date;
}

export interface ThreadWithContext extends ConversationThread {
  persona_slug: string;
  persona_display_name: string;
  user_profile_type: string | null;
  user_gender: string | null;
}

export interface ThreadListOptions {
  status?: ThreadStatus;
  limit?: number;
  offset?: number;
}

export async function listThreads(opts: ThreadListOptions = {}): Promise<{ threads: ThreadWithContext[]; total: number }> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;

  const threads = (opts.status
    ? await sql`
        SELECT t.*, p.slug AS persona_slug, p.display_name AS persona_display_name,
          u.profile_type AS user_profile_type,
          COALESCE(dp.gender, rp.gender) AS user_gender
        FROM conversation_threads t
        JOIN conversation_personas p ON p.id = t.persona_id
        JOIN users u ON u.id = t.user_id
        LEFT JOIN driver_profiles dp ON dp.user_id = u.id
        LEFT JOIN rider_profiles rp ON rp.user_id = u.id
        WHERE t.status = ${opts.status}
        ORDER BY t.updated_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    : await sql`
        SELECT t.*, p.slug AS persona_slug, p.display_name AS persona_display_name,
          u.profile_type AS user_profile_type,
          COALESCE(dp.gender, rp.gender) AS user_gender
        FROM conversation_threads t
        JOIN conversation_personas p ON p.id = t.persona_id
        JOIN users u ON u.id = t.user_id
        LEFT JOIN driver_profiles dp ON dp.user_id = u.id
        LEFT JOIN rider_profiles rp ON rp.user_id = u.id
        ORDER BY t.updated_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `) as ThreadWithContext[];

  const totalRows = opts.status
    ? await sql`SELECT COUNT(*)::int AS n FROM conversation_threads WHERE status = ${opts.status}`
    : await sql`SELECT COUNT(*)::int AS n FROM conversation_threads`;
  const total = (totalRows[0] as { n: number } | undefined)?.n ?? 0;

  return { threads, total };
}

export async function getThread(id: string): Promise<ThreadWithContext | null> {
  const rows = await sql`
    SELECT t.*, p.slug AS persona_slug, p.display_name AS persona_display_name,
      u.profile_type AS user_profile_type,
      COALESCE(dp.gender, rp.gender) AS user_gender
    FROM conversation_threads t
    JOIN conversation_personas p ON p.id = t.persona_id
    JOIN users u ON u.id = t.user_id
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
    LEFT JOIN rider_profiles rp ON rp.user_id = u.id
    WHERE t.id = ${id}
    LIMIT 1
  `;
  return (rows[0] as ThreadWithContext) ?? null;
}

export async function listMessages(threadId: string, limit = 200): Promise<ConversationMessage[]> {
  return (await sql`
    SELECT * FROM conversation_messages
    WHERE thread_id = ${threadId}
    ORDER BY sent_at ASC
    LIMIT ${Math.min(limit, 500)}
  `) as ConversationMessage[];
}

export interface ThreadStats {
  total: number;
  active: number;
  dormant: number;
  opted_out: number;
  reply_rate_percent: number;
}

export async function getThreadStats(): Promise<ThreadStats> {
  const rows = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'active')::int AS active,
      COUNT(*) FILTER (WHERE status = 'dormant')::int AS dormant,
      COUNT(*) FILTER (WHERE status = 'opted_out')::int AS opted_out,
      COUNT(*) FILTER (WHERE messages_received > 0)::int AS with_replies,
      COUNT(*) FILTER (WHERE messages_sent > 0)::int AS with_outbound
    FROM conversation_threads
  `;
  const r = rows[0] as { total: number; active: number; dormant: number; opted_out: number; with_replies: number; with_outbound: number };
  return {
    total: r.total,
    active: r.active,
    dormant: r.dormant,
    opted_out: r.opted_out,
    reply_rate_percent: r.with_outbound ? Math.round((r.with_replies / r.with_outbound) * 100) : 0,
  };
}
