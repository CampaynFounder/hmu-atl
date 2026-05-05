// Admin notes targeting this user. Read-only; authoring is a separate UI
// (Phase 1 follow-up).

import type { FieldDefinition } from './types';
import { FieldList, fmtDateTime } from './renderers';

export const notesFields: FieldDefinition[] = [
  {
    key: 'collection.admin_notes',
    label: 'Admin notes',
    category: 'Notes',
    description: 'Notes admins have written about this user (target_user_id = userId).',
    applies_to: ['any'],
    render: 'list',
    source: { kind: 'collection', fetch: async (ctx) => {
      const { sql } = await import('@/lib/db/client');
      const rows = await sql`
        SELECT n.id, n.body, n.updated_at, n.archived_at,
               COALESCE(dp.display_name, rp.display_name, u.clerk_id) AS author_name
        FROM admin_notes n
        JOIN users u ON u.id = n.admin_id
        LEFT JOIN driver_profiles dp ON dp.user_id = u.id
        LEFT JOIN rider_profiles rp ON rp.user_id = u.id
        WHERE n.target_user_id = ${ctx.userId}
        ORDER BY n.updated_at DESC LIMIT 10`;
      return rows.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        body: (r.body as string) ?? '',
        author_name: (r.author_name as string | null) ?? 'unknown admin',
        updated_at: (r.updated_at as Date).toISOString(),
        archived: Boolean(r.archived_at),
      }));
    } },
    Render: ({ value }) => {
      const items = (value as { id: string; body: string; author_name: string; updated_at: string; archived: boolean }[]) ?? [];
      return (
        <FieldList
          label="Admin notes"
          items={items}
          emptyText="No notes about this user."
          renderRow={(n) => (
            <div className="text-xs" style={{ opacity: n.archived ? 0.5 : 1 }}>
              <div className="flex items-baseline justify-between gap-2 mb-0.5">
                <span className="font-medium" style={{ color: 'var(--admin-text)' }}>{n.author_name}</span>
                <span className="text-[10px]" style={{ color: 'var(--admin-text-muted)' }}>
                  {fmtDateTime(n.updated_at)}{n.archived && ' · archived'}
                </span>
              </div>
              <div className="whitespace-pre-wrap" style={{ color: 'var(--admin-text-muted)' }}>
                {n.body || <em>(empty)</em>}
              </div>
            </div>
          )}
        />
      );
    },
  },
];
