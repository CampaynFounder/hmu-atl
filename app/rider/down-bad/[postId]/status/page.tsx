import { redirect, notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import DownBadStatusClient from './down-bad-status-client';

export const dynamic = 'force-dynamic';

export default async function DownBadStatusPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent(`/rider/down-bad/${postId}/status`)}`);
  }

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) redirect('/');
  const riderId = (userRows[0] as { id: string }).id;

  const postRows = await sql`
    SELECT id, user_id, status FROM hmu_posts
    WHERE id = ${postId} AND post_type = 'down_bad'
    LIMIT 1
  `;
  if (!postRows.length) notFound();
  const post = postRows[0] as { id: string; user_id: string; status: string };
  if (post.user_id !== riderId) notFound();

  return <DownBadStatusClient postId={postId} userId={riderId} />;
}
