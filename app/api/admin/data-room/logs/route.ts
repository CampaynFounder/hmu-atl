import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const logs = await sql`
      SELECT
        l.id,
        c.full_name,
        c.email,
        d.name AS document_name,
        l.action,
        l.accessed_at
      FROM data_room_access_logs l
      LEFT JOIN data_room_consents c ON l.consent_id = c.id
      LEFT JOIN data_room_documents d ON l.document_id = d.id
      ORDER BY l.accessed_at DESC
      LIMIT 200
    `;

    return NextResponse.json({ logs });
  } catch (error) {
    console.error('Admin data room logs error:', error);
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
  }
}
