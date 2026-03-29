// GET /api/admin/messages/unread — Unread inbound message count
import { NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  try {
    const rows = await sql`SELECT COUNT(*) as count FROM sms_inbound WHERE read = false`;
    return NextResponse.json({ unread: Number(rows[0]?.count ?? 0) });
  } catch {
    return NextResponse.json({ unread: 0 });
  }
}
