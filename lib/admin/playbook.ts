// Response Playbook query helpers.
// Schema: lib/db/migrations/response-playbook.sql

import { sql } from '@/lib/db/client';

export type PlaybookAudience = 'driver' | 'rider' | 'any';

export interface PlaybookEntry {
  id: string;
  title: string;
  question_text: string;
  answer_body: string;
  audience: PlaybookAudience;
  is_active: boolean;
  priority: number;
  usage_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlaybookFilters {
  audience?: PlaybookAudience | 'all';
  status?: 'active' | 'inactive' | 'all';
  search?: string;
}

export async function listPlaybook(filters: PlaybookFilters = {}): Promise<PlaybookEntry[]> {
  const audience = filters.audience ?? 'all';
  const status = filters.status ?? 'all';
  const q = (filters.search ?? '').trim();
  const pattern = q ? `%${q}%` : '';

  const audFilter = audience === 'all' ? null : audience;
  const statusFilter =
    status === 'active' ? true : status === 'inactive' ? false : null;

  const rows = await sql`
    SELECT id, title, question_text, answer_body, audience, is_active, priority,
           usage_count, created_by, created_at, updated_at
    FROM response_playbook
    WHERE (${audFilter}::text IS NULL OR audience = ${audFilter})
      AND (${statusFilter}::boolean IS NULL OR is_active = ${statusFilter})
      AND (
        ${q} = ''
        OR title ILIKE ${pattern}
        OR question_text ILIKE ${pattern}
        OR answer_body ILIKE ${pattern}
      )
    ORDER BY is_active DESC, priority DESC, updated_at DESC
  `;
  return rows.map(toEntry);
}

// Audience-aware lookup used by /admin/messages picker. When the recipient is
// a known driver (or rider), surface entries tagged for that audience plus the
// 'any' bucket. Always filtered to active only.
export async function listPlaybookForAudience(
  audience: PlaybookAudience,
): Promise<PlaybookEntry[]> {
  const rows = await sql`
    SELECT id, title, question_text, answer_body, audience, is_active, priority,
           usage_count, created_by, created_at, updated_at
    FROM response_playbook
    WHERE is_active = TRUE
      AND audience IN (${audience}, 'any')
    ORDER BY priority DESC, updated_at DESC
  `;
  return rows.map(toEntry);
}

export async function getPlaybook(id: string): Promise<PlaybookEntry | null> {
  const rows = await sql`
    SELECT id, title, question_text, answer_body, audience, is_active, priority,
           usage_count, created_by, created_at, updated_at
    FROM response_playbook
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows[0] ? toEntry(rows[0]) : null;
}

export interface CreatePlaybookInput {
  title: string;
  question_text: string;
  answer_body: string;
  audience: PlaybookAudience;
  priority?: number;
  is_active?: boolean;
  created_by: string | null;
}

export async function createPlaybook(input: CreatePlaybookInput): Promise<PlaybookEntry> {
  const rows = await sql`
    INSERT INTO response_playbook
      (title, question_text, answer_body, audience, priority, is_active, created_by)
    VALUES
      (${input.title}, ${input.question_text}, ${input.answer_body},
       ${input.audience}, ${input.priority ?? 0}, ${input.is_active ?? true},
       ${input.created_by})
    RETURNING id, title, question_text, answer_body, audience, is_active, priority,
              usage_count, created_by, created_at, updated_at
  `;
  return toEntry(rows[0]);
}

export interface UpdatePlaybookInput {
  title?: string;
  question_text?: string;
  answer_body?: string;
  audience?: PlaybookAudience;
  priority?: number;
  is_active?: boolean;
}

export async function updatePlaybook(
  id: string,
  input: UpdatePlaybookInput,
): Promise<PlaybookEntry | null> {
  // Coalesce undefined fields back to existing column values so the caller can
  // PATCH any subset without clobbering the rest.
  const rows = await sql`
    UPDATE response_playbook SET
      title         = COALESCE(${input.title ?? null}, title),
      question_text = COALESCE(${input.question_text ?? null}, question_text),
      answer_body   = COALESCE(${input.answer_body ?? null}, answer_body),
      audience      = COALESCE(${input.audience ?? null}, audience),
      priority      = COALESCE(${input.priority ?? null}, priority),
      is_active     = COALESCE(${input.is_active ?? null}::boolean, is_active),
      updated_at    = NOW()
    WHERE id = ${id}
    RETURNING id, title, question_text, answer_body, audience, is_active, priority,
              usage_count, created_by, created_at, updated_at
  `;
  return rows[0] ? toEntry(rows[0]) : null;
}

export async function archivePlaybook(id: string): Promise<void> {
  await sql`
    UPDATE response_playbook
    SET is_active = FALSE, updated_at = NOW()
    WHERE id = ${id}
  `;
}

export interface RecordSendInput {
  playbook_id: string;
  admin_id: string;
  to_phone: string;
  recipient_id: string | null;
  chunk_count: number;
  was_edited: boolean;
}

export async function recordPlaybookSend(input: RecordSendInput): Promise<void> {
  await sql`
    INSERT INTO response_playbook_sends
      (playbook_id, admin_id, to_phone, recipient_id, chunk_count, was_edited)
    VALUES
      (${input.playbook_id}, ${input.admin_id}, ${input.to_phone},
       ${input.recipient_id}, ${input.chunk_count}, ${input.was_edited})
  `;
  await sql`
    UPDATE response_playbook
    SET usage_count = usage_count + 1
    WHERE id = ${input.playbook_id}
  `;
}

function toEntry(row: Record<string, unknown>): PlaybookEntry {
  return {
    id: row.id as string,
    title: row.title as string,
    question_text: row.question_text as string,
    answer_body: row.answer_body as string,
    audience: row.audience as PlaybookAudience,
    is_active: row.is_active as boolean,
    priority: row.priority as number,
    usage_count: row.usage_count as number,
    created_by: (row.created_by as string) ?? null,
    created_at: (row.created_at as { toString(): string }).toString(),
    updated_at: (row.updated_at as { toString(): string }).toString(),
  };
}
