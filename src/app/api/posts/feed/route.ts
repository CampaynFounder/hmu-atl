import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { HmuPost, PostType } from "../../../../../lib/db/types";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(60, "1 m"),
  prefix: "rl:posts:feed",
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { success } = await ratelimit.limit(userId);
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { searchParams } = req.nextUrl;
  const area = searchParams.get("area");
  const typeParam = searchParams.get("type") as PostType | null;
  const priceMaxParam = searchParams.get("price_max");

  const priceMax = priceMaxParam !== null ? Number(priceMaxParam) : null;
  if (priceMax !== null && isNaN(priceMax)) {
    return NextResponse.json({ error: "Invalid price_max" }, { status: 400 });
  }
  if (typeParam && typeParam !== "driver_offering" && typeParam !== "rider_requesting") {
    return NextResponse.json(
      { error: "type must be driver_offering or rider_requesting" },
      { status: 400 },
    );
  }

  const sql = neon(process.env.DATABASE_URL!);

  const userRows = await sql`
    SELECT id, profile_type FROM users WHERE clerk_id = ${userId} LIMIT 1
  `;
  if (!userRows.length) {
    return NextResponse.json({ error: "User not found" }, { status: 403 });
  }
  const profileType: string = userRows[0].profile_type as string;

  // Default: show the opposite post type to the caller's role
  let feedType: PostType | null = typeParam;
  if (!feedType) {
    if (profileType === "rider") feedType = "driver_offering";
    else if (profileType === "driver") feedType = "rider_requesting";
    // profile_type === "both" gets all posts
  }

  const now = new Date().toISOString();
  const conditions: string[] = ["status = 'active'", `expires_at > '${now}'`];
  if (feedType) conditions.push(`post_type = '${feedType}'`);
  if (area) conditions.push(`areas @> '${JSON.stringify([area])}'::jsonb`);
  if (priceMax !== null) conditions.push(`price <= ${priceMax}`);

  const where = conditions.join(" AND ");
  const rows = await sql(`SELECT * FROM hmu_posts WHERE ${where} ORDER BY created_at DESC`);

  const posts = rows as HmuPost[];
  return NextResponse.json({ posts, total: posts.length });
}
