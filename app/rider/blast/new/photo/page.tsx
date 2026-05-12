// /rider/blast/new/photo — hard gate before deposit. Spec §3.4b.

import { isFeatureEnabled } from '@/lib/feature-flags';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import BlastPhotoClient from './blast-photo-client';

export const dynamic = 'force-dynamic';

export default async function BlastPhotoPage() {
  if (!(await isFeatureEnabled('blast_booking'))) notFound();
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in?redirect_url=/rider/blast/new/photo');

  const rows = await sql`
    SELECT rp.avatar_url FROM users u
    LEFT JOIN rider_profiles rp ON rp.user_id = u.id
    WHERE u.clerk_id = ${clerkId} LIMIT 1
  `;
  const hasPhoto = !!(rows[0] as { avatar_url: string | null } | undefined)?.avatar_url;
  if (hasPhoto) {
    // Already done — bounce back to the form so they can finish sending.
    redirect('/rider/blast/new');
  }

  return <BlastPhotoClient />;
}
