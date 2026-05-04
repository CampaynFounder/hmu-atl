// /api/admin/marketing/notes
//   GET  → return the caller's current (latest non-archived) note. Creates an
//          empty one if none exists so the frontend always has a stable id to
//          autosave against. Pass ?view=super to get every admin's active
//          notes grouped by admin name (super admins only).
//   POST → create a new empty note for the caller. Used by Clear: archive the
//          current one (separate DELETE call), then create a fresh one.

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

interface NoteWithAdmin extends NoteRow {
  admin_name: string;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const view = new URL(req.url).searchParams.get('view');

  // Super-admin "all admins" view: every admin's active notes, grouped by
  // admin id with display name resolved from driver/rider profile.
  if (view === 'super') {
    if (!admin.is_super) return unauthorizedResponse();

    const rows = (await sql`
      SELECT n.id, n.admin_id, n.body, n.created_at, n.updated_at, n.archived_at,
             COALESCE(dp.display_name, rp.display_name, u.clerk_id) AS admin_name
      FROM admin_notes n
      JOIN users u ON u.id = n.admin_id
      LEFT JOIN driver_profiles dp ON dp.user_id = u.id
      LEFT JOIN rider_profiles rp ON rp.user_id = u.id
      WHERE n.archived_at IS NULL
      ORDER BY admin_name ASC, n.updated_at DESC
    `) as NoteWithAdmin[];

    // Group server-side so the client just renders. Each group sorted by
    // updated_at desc already; head is the "current" one for that admin.
    const groups = new Map<string, { adminId: string; adminName: string; notes: NoteRow[] }>();
    for (const row of rows) {
      const key = row.admin_id;
      const existing = groups.get(key);
      const note: NoteRow = {
        id: row.id,
        admin_id: row.admin_id,
        body: row.body,
        created_at: row.created_at,
        updated_at: row.updated_at,
        archived_at: row.archived_at,
      };
      if (existing) existing.notes.push(note);
      else groups.set(key, { adminId: row.admin_id, adminName: row.admin_name, notes: [note] });
    }
    return NextResponse.json({ groups: Array.from(groups.values()) });
  }

  // Self view — return current (latest non-archived) note, creating one if
  // the caller has none. This guarantees the frontend always has an id to
  // autosave against, no first-write race.
  const rows = (await sql`
    SELECT id, admin_id, body, created_at, updated_at, archived_at
    FROM admin_notes
    WHERE admin_id = ${admin.id} AND archived_at IS NULL
    ORDER BY updated_at DESC
    LIMIT 1
  `) as NoteRow[];

  if (rows.length > 0) {
    return NextResponse.json({ note: rows[0] });
  }

  const created = (await sql`
    INSERT INTO admin_notes (admin_id, body)
    VALUES (${admin.id}, '')
    RETURNING id, admin_id, body, created_at, updated_at, archived_at
  `) as NoteRow[];
  return NextResponse.json({ note: created[0] });
}

export async function POST() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const created = (await sql`
    INSERT INTO admin_notes (admin_id, body)
    VALUES (${admin.id}, '')
    RETURNING id, admin_id, body, created_at, updated_at, archived_at
  `) as NoteRow[];
  return NextResponse.json({ note: created[0] });
}
