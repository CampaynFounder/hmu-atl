import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getDriverEnrollment, getOfferProgress } from '@/lib/db/enrollment-offers';

export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const userId = rows[0].id as string;
    const enrollment = await getDriverEnrollment(userId);

    if (!enrollment) {
      return NextResponse.json({ enrolled: false });
    }

    const progress = getOfferProgress(enrollment);

    return NextResponse.json({
      enrolled: true,
      status: enrollment.status,
      ...progress,
    });
  } catch (error) {
    console.error('Enrollment fetch error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
