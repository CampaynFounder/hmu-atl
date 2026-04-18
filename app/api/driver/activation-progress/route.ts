import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getActivationProgress } from '@/lib/driver/activation';

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  const user = rows[0] as { id: string } | undefined;
  if (!user) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const progress = await getActivationProgress(user.id);
  return NextResponse.json(progress);
}
