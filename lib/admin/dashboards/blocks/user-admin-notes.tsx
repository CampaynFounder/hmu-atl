// Block: user.admin_notes
//
// Admin-written notes targeting this specific user. Read-only view here;
// authoring lives in a dedicated route (Phase 1 follow-up). Pulls from
// admin_notes WHERE target_user_id = userId.
//
// Not marketAware — notes are admin-context, not market-context.

import { z } from 'zod';
import { sql } from '@/lib/db/client';
import type { BlockDefinition, BlockFetchContext } from './types';
import { BlockShell, EmptyState } from './_shell';

const configSchema = z.object({
  limit: z.number().int().min(1).max(50).default(10),
}).strict();
type Config = z.infer<typeof configSchema>;

interface NoteRow {
  id: string;
  body: string;
  author_name: string | null;
  updated_at: string;
  archived: boolean;
}

interface NotesData {
  notes: NoteRow[];
}

async function fetchAdminNotes(ctx: BlockFetchContext, config: Config): Promise<NotesData> {
  if (!ctx.userId) throw new Error('user.admin_notes requires userId');

  const rows = await sql`
    SELECT
      n.id, n.body, n.updated_at, n.archived_at,
      COALESCE(dp.display_name, rp.display_name, u.clerk_id) AS author_name
    FROM admin_notes n
    JOIN users u ON u.id = n.admin_id
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
    LEFT JOIN rider_profiles  rp ON rp.user_id = u.id
    WHERE n.target_user_id = ${ctx.userId}
    ORDER BY n.updated_at DESC
    LIMIT ${config.limit}
  `;

  return {
    notes: rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      body: (r.body as string) ?? '',
      author_name: (r.author_name as string | null) ?? null,
      updated_at: (r.updated_at as Date).toISOString(),
      archived: Boolean(r.archived_at),
    })),
  };
}

function NotesComponent({ data }: { data: NotesData }) {
  if (data.notes.length === 0) {
    return (
      <BlockShell title="Admin notes">
        <EmptyState>No notes about this user yet.</EmptyState>
      </BlockShell>
    );
  }
  return (
    <BlockShell title="Admin notes" subtitle={`${data.notes.length} most recent`}>
      <div className="space-y-3">
        {data.notes.map((n) => (
          <div
            key={n.id}
            className="text-xs"
            style={{
              opacity: n.archived ? 0.5 : 1,
            }}
          >
            <div className="flex items-baseline justify-between gap-2 mb-0.5">
              <span className="font-medium" style={{ color: 'var(--admin-text)' }}>
                {n.author_name ?? 'unknown admin'}
              </span>
              <span className="text-[10px]" style={{ color: 'var(--admin-text-muted)' }}>
                {new Date(n.updated_at).toLocaleString()}
                {n.archived && ' · archived'}
              </span>
            </div>
            <div
              className="whitespace-pre-wrap"
              style={{ color: 'var(--admin-text-muted)' }}
            >
              {n.body || <em>(empty)</em>}
            </div>
          </div>
        ))}
      </div>
    </BlockShell>
  );
}

export const userAdminNotesBlock: BlockDefinition<Config, NotesData> = {
  key: 'user.admin_notes',
  label: 'Admin notes',
  description: 'Admin-written notes targeting this specific user.',
  scope: 'user',
  marketAware: false,
  configSchema,
  defaultConfig: { limit: 10 },
  fetch: (ctx, config) => fetchAdminNotes(ctx, config),
  Component: NotesComponent,
};
