import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const documents = await sql`
      SELECT * FROM data_room_documents
      ORDER BY is_active DESC, updated_at DESC
    `;

    return NextResponse.json({ documents });
  } catch (error) {
    console.error('Admin data room documents error:', error);
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
  }
}
