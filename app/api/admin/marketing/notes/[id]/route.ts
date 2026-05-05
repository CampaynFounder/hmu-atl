// /api/admin/marketing/notes/[id]
//   PATCH  → update the body, or restore from archive (clear archived_at).
//            Caller may only edit their own notes — even super admins get a
//            403 here so audit trust is preserved across roles.
//   DELETE → soft-archive (set archived_at). Same ownership rule.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

interface NoteRow {
  id: string;
  admin_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

const NOT_FOUND = NextResponse.json({ error: 'Note not found' }, { status: 404 });

async function loadOwn(noteId: string, adminId: string): Promise<NoteRow | null> {
  // Scoped to scratchpad notes only (target_user_id IS NULL). User-targeted
  // notes get their own routes in Phase 1 when the user.admin_notes dashboard
  // block ships, so the marketing endpoints never touch them.
  const rows = (await sql`
    SELECT id, admin_id, body, created_at, updated_at, archived_at
    FROM admin_notes
    WHERE id = ${noteId} AND admin_id = ${adminId} AND target_user_id IS NULL
    LIMIT 1
  `) as NoteRow[];
  return rows[0] ?? null;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { id } = await ctx.params;
  const existing = await loadOwn(id, admin.id);
  if (!existing) return NOT_FOUND;

  let body: { body?: unknown; restore?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Restore from archive — explicit flag, not coupled to body edit.
  if (body.restore === true) {
    const restored = (await sql`
      UPDATE admin_notes
      SET archived_at = NULL, updated_at = NOW()
      WHERE id = ${id} AND admin_id = ${admin.id}
      RETURNING id, admin_id, body, created_at, updated_at, archived_at
    `) as NoteRow[];
    return NextResponse.json({ note: restored[0] });
  }

  if (typeof body.body !== 'string') {
    return NextResponse.json({ error: 'body must be a string' }, { status: 400 });
  }

  // Cap at 50k chars — generous for a scratchpad, prevents abuse / accidental
  // paste of an entire spreadsheet that would blow up the trigram index.
  const trimmed = body.body.slice(0, 50_000);

  const updated = (await sql`
    UPDATE admin_notes
    SET body = ${trimmed}, updated_at = NOW()
    WHERE id = ${id} AND admin_id = ${admin.id}
    RETURNING id, admin_id, body, created_at, updated_at, archived_at
  `) as NoteRow[];
  return NextResponse.json({ note: updated[0] });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { id } = await ctx.params;
  const existing = await loadOwn(id, admin.id);
  if (!existing) return NOT_FOUND;

  const archived = (await sql`
    UPDATE admin_notes
    SET archived_at = NOW()
    WHERE id = ${id} AND admin_id = ${admin.id} AND archived_at IS NULL
    RETURNING id, admin_id, body, created_at, updated_at, archived_at
  `) as NoteRow[];
  return NextResponse.json({ note: archived[0] ?? existing });
}
