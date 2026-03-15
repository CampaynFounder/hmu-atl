import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { HmuPost, PostType, HmuPostStatus } from "../../../../../lib/db/types";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  prefix: "rl:posts:rider",
});

interface RiderPostBody {
  areas: string[];
  price: number;
  time_window: {
    start?: string;
    end?: string;
    description?: string;
  };
}

function deriveExpiresAt(tw: RiderPostBody["time_window"]): Date {
  if (tw.end) {
    const end = new Date(tw.end);
    if (!isNaN(end.getTime())) return end;
  }
  const fallback = new Date();
  fallback.setHours(fallback.getHours() + 2);
  return fallback;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { success } = await ratelimit.limit(userId);
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: Partial<RiderPostBody>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { areas, price, time_window } = body;

  if (!Array.isArray(areas) || areas.length === 0) {
    return NextResponse.json({ error: "areas must be a non-empty array" }, { status: 400 });
  }
  if (typeof price !== "number" || price < 0) {
    return NextResponse.json({ error: "price must be a non-negative number" }, { status: 400 });
  }
  if (!time_window || typeof time_window !== "object") {
    return NextResponse.json({ error: "time_window is required" }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${userId} LIMIT 1`;
  if (!userRows.length) {
    return NextResponse.json({ error: "User not found" }, { status: 403 });
  }
  const internalUserId: string = userRows[0].id as string;

  const expiresAt = deriveExpiresAt(time_window);
  const postType: PostType = "rider_requesting";
  const status: HmuPostStatus = "active";

  const rows = await sql`
    INSERT INTO hmu_posts (user_id, post_type, areas, price, time_window, status, expires_at)
    VALUES (
      ${internalUserId},
      ${postType},
      ${JSON.stringify(areas)},
      ${price},
      ${JSON.stringify(time_window)},
      ${status},
      ${expiresAt.toISOString()}
    )
    RETURNING *
  `;

  const post = rows[0] as HmuPost;

  return NextResponse.json({ post }, { status: 201 });
}
