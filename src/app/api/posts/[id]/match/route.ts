import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { notify_ride_matched } from "../../../../../../lib/notifications/triggers";
import { leaveAreaPresence } from "../../../../../../lib/ably/presence";
import type { HmuPost, HmuPostStatus, RideStatus } from "../../../../../../lib/db/types";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(20, "1 m"),
  prefix: "rl:posts:match",
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { success } = await ratelimit.limit(userId);
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { id: postId } = await params;
  const sql = neon(process.env.DATABASE_URL!);

  const callerRows = await sql`
    SELECT id, profile_type FROM users WHERE clerk_id = ${userId} LIMIT 1
  `;
  if (!callerRows.length) {
    return NextResponse.json({ error: "User not found" }, { status: 403 });
  }
  const callerId: string = callerRows[0].id as string;
  const callerProfile: string = callerRows[0].profile_type as string;

  const postRows = await sql`SELECT * FROM hmu_posts WHERE id = ${postId} LIMIT 1`;
  if (!postRows.length) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }
  const post = postRows[0] as HmuPost;

  if (post.status !== "active") {
    return NextResponse.json({ error: "Post is no longer active" }, { status: 409 });
  }
  if (new Date(post.expires_at) <= new Date()) {
    return NextResponse.json({ error: "Post has expired" }, { status: 409 });
  }
  if (post.user_id === callerId) {
    return NextResponse.json({ error: "Cannot match your own post" }, { status: 400 });
  }

  let driverId: string;
  let riderId: string;

  if (post.post_type === "rider_requesting") {
    // Driver taps HMU on a rider post
    if (callerProfile !== "driver" && callerProfile !== "both") {
      return NextResponse.json({ error: "Only drivers can match rider posts" }, { status: 403 });
    }
    driverId = callerId;
    riderId = post.user_id;
  } else {
    // Rider taps HMU on a driver post
    if (callerProfile !== "rider" && callerProfile !== "both") {
      return NextResponse.json({ error: "Only riders can match driver posts" }, { status: 403 });
    }
    riderId = callerId;
    driverId = post.user_id;
  }

  const matchedStatus: HmuPostStatus = "matched";
  const rideStatus: RideStatus = "matched";

  await sql`UPDATE hmu_posts SET status = ${matchedStatus} WHERE id = ${postId}`;

  const rideRows = await sql`
    INSERT INTO rides (driver_id, rider_id, status, pickup, dropoff, amount, driver_confirmed_end)
    VALUES (
      ${driverId},
      ${riderId},
      ${rideStatus},
      ${'{}'},
      ${'{}'},
      ${post.price},
      ${false}
    )
    RETURNING *
  `;

  const ride = rideRows[0];

  await notify_ride_matched(ride.id as string);
  await leaveAreaPresence(post.areas as string[], postId, post.user_id);

  return NextResponse.json({ ride, post_id: postId }, { status: 200 });
}
