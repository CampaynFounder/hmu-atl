import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getOrCreateStripeCustomer, createSetupIntent } from '@/lib/stripe/rider-payments';

export async function POST() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const userId = (userRows[0] as { id: string }).id;

  // Get email from Clerk
  const { clerkClient } = await import('@clerk/nextjs/server');
  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(clerkId);
  const email = clerkUser.primaryEmailAddress?.emailAddress || '';

  const customerId = await getOrCreateStripeCustomer({ id: userId, email, clerkId });
  const clientSecret = await createSetupIntent(customerId);

  return NextResponse.json({ clientSecret, customerId });
}
