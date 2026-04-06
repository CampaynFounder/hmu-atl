import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const consents = await sql`
      SELECT id, full_name, email, phone, company, title,
             consented_at, nda_version
      FROM data_room_consents
      WHERE revoked_at IS NULL
      ORDER BY consented_at DESC
    `;

    return NextResponse.json({ consents });
  } catch (error) {
    console.error('Admin data room consents error:', error);
    return NextResponse.json({ error: 'Failed to fetch consents' }, { status: 500 });
  }
}
