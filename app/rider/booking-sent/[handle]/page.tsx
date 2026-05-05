import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import BookingSentClient from './booking-sent-client';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ postId?: string }>;
}

// Confirmation screen the rider lands on after a /rider/browse booking has
// been submitted (either directly by auth-callback or after express
// onboarding). Shows the same 15-min acceptance countdown the drawer uses
// when authed, and auto-redirects to /ride/[id] when the driver accepts.
export default async function BookingSentPage({ params, searchParams }: Props) {
  const [{ handle }, { postId }] = await Promise.all([params, searchParams]);
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect(`/sign-in?type=rider&returnTo=/rider/browse`);

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) redirect('/onboarding?type=rider');
  const userId = (userRows[0] as { id: string }).id;

  // Pull the driver display name from driver_profiles. Fall back to handle if
  // the driver row vanished between book + render (rare).
  const driverRows = await sql`
    SELECT first_name, vehicle_info FROM driver_profiles WHERE handle = ${handle} LIMIT 1
  `;
  const driverDisplayName = (driverRows[0]?.first_name as string | null) || handle;

  // Look up the booking post if a postId was passed. The page is still useful
  // without it (e.g. user refreshed and we lost the query), so this is best-
  // effort rather than required.
  let postExpiresAt: string | null = null;
  let postPrice: number | null = null;
  let postStatus: string | null = null;
  let postDestination: string | null = null;
  if (postId && /^[0-9a-f-]{36}$/i.test(postId)) {
    const postRows = await sql`
      SELECT booking_expires_at, price, status, time_window
      FROM hmu_posts
      WHERE id = ${postId} AND user_id = ${userId}
      LIMIT 1
    `;
    const row = postRows[0] as
      | { booking_expires_at: string | null; price: number; status: string; time_window: Record<string, unknown> | null }
      | undefined;
    if (row) {
      postExpiresAt = row.booking_expires_at;
      postPrice = Number(row.price);
      postStatus = row.status;
      const tw = row.time_window || {};
      postDestination = (tw.destination as string) || null;
    }
  }

  // If the post is already matched, send the rider straight to the ride page
  // — they took longer than the driver did to accept.
  if (postStatus === 'matched' && postId) {
    const rideRows = await sql`
      SELECT id FROM rides WHERE hmu_post_id = ${postId} LIMIT 1
    `;
    const rideId = rideRows[0]?.id as string | undefined;
    if (rideId) redirect(`/ride/${rideId}`);
  }

  return (
    <BookingSentClient
      handle={handle}
      driverDisplayName={driverDisplayName}
      userId={userId}
      postId={postId || null}
      expiresAt={postExpiresAt}
      price={postPrice}
      destination={postDestination}
      initialStatus={postStatus}
    />
  );
}
