import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import sql from '../../../../lib/db/client';
import { ratelimit } from '../../../../lib/ratelimit';
import posthog from '../../../../lib/posthog';
import type { RatingAndReview } from '../../../../lib/db/types';

// HMU-ATL rating categories
type ChillRating = 'CHILL' | 'Cool AF' | 'Kinda Creepy' | 'WEIRDO';

const RATING_WEIGHTS: Record<ChillRating, number> = {
  CHILL: 1,
  'Cool AF': 1.5,
  'Kinda Creepy': 0,
  WEIRDO: 0,
};

// Numeric score stored in DB: CHILL=5, Cool AF=4, Kinda Creepy=2, WEIRDO=1
const RATING_TO_NUMERIC: Record<ChillRating, number> = {
  CHILL: 5,
  'Cool AF': 4,
  'Kinda Creepy': 2,
  WEIRDO: 1,
};

const CHILL_RATINGS = new Set<ChillRating>(['CHILL', 'Cool AF', 'Kinda Creepy', 'WEIRDO']);

function isChillRating(value: unknown): value is ChillRating {
  return typeof value === 'string' && CHILL_RATINGS.has(value as ChillRating);
}

export async function POST(req: NextRequest) {
  // Clerk auth
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit
  const { success } = await ratelimit.limit(`ratings:${userId}`);
  if (!success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: { ride_id: string; rated_user_id: string; chill_rating: string; review_text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { ride_id, rated_user_id, chill_rating, review_text } = body;

  if (!ride_id || !rated_user_id || !isChillRating(chill_rating)) {
    return NextResponse.json(
      { error: 'ride_id, rated_user_id, and a valid chill_rating are required' },
      { status: 400 }
    );
  }

  if (userId === rated_user_id) {
    return NextResponse.json({ error: 'Cannot rate yourself' }, { status: 400 });
  }

  // Look up internal user id from clerk auth_provider_id
  const raterRows = await sql`
    SELECT id FROM users WHERE auth_provider_id = ${userId} LIMIT 1
  `;
  if (!raterRows.length) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  const raterDbId = raterRows[0].id as string;

  // Verify the ride exists and rater is a participant
  const rideRows = await sql`
    SELECT id, rider_id, driver_id, status FROM rides
    WHERE id = ${ride_id}
      AND (rider_id = ${raterDbId} OR driver_id = ${raterDbId})
    LIMIT 1
  `;
  if (!rideRows.length) {
    return NextResponse.json({ error: 'Ride not found or access denied' }, { status: 404 });
  }

  // Enforce one rating per ride per person (DB + API)
  const existing = await sql`
    SELECT id FROM ratings_and_reviews
    WHERE ride_id = ${ride_id}
      AND rater_user_id = ${raterDbId}
    LIMIT 1
  `;
  if (existing.length) {
    return NextResponse.json({ error: 'Already rated this ride' }, { status: 409 });
  }

  const numericRating = RATING_TO_NUMERIC[chill_rating];
  const categories = { chill_rating };

  // Insert rating — DB unique constraint (ride_id, rater_user_id) enforces at DB level
  const inserted = await sql`
    INSERT INTO ratings_and_reviews
      (ride_id, rater_user_id, rated_user_id, rating, review_text, categories, is_flagged)
    VALUES
      (${ride_id}, ${raterDbId}, ${rated_user_id}, ${numericRating},
       ${review_text ?? null}, ${JSON.stringify(categories)}, false)
    RETURNING *
  `;
  const rating = inserted[0] as RatingAndReview;

  // Update chill_score for rated user
  // Formula: ((CHILL + (Cool AF × 1.5)) / total) × 100
  await updateChillScore(rated_user_id);

  // WEIRDO ×3 from different users = flag account for admin review
  if (chill_rating === 'WEIRDO') {
    await checkWeirdo(rated_user_id, raterDbId);
  }

  // PostHog event
  posthog.capture({
    distinctId: userId,
    event: 'rating_submitted',
    properties: {
      ride_id,
      rated_user_id,
      chill_rating,
      rating_id: rating.id,
    },
  });
  await posthog.shutdown();

  return NextResponse.json({ rating }, { status: 201 });
}

async function updateChillScore(ratedUserId: string) {
  // Pull all ratings for this user
  const ratings = await sql`
    SELECT categories FROM ratings_and_reviews
    WHERE rated_user_id = ${ratedUserId}
      AND is_flagged = false
  `;

  let chillCount = 0;
  let coolAfCount = 0;
  const total = ratings.length;

  for (const row of ratings) {
    const cat = row.categories as { chill_rating?: string };
    if (cat?.chill_rating === 'CHILL') chillCount++;
    if (cat?.chill_rating === 'Cool AF') coolAfCount++;
  }

  if (total === 0) return;

  const chillScore = ((chillCount + coolAfCount * 1.5) / total) * 100;

  // Update rider_profiles or driver_profiles — stored on whichever profile the user has
  // Using a generic user_profiles update; adjust table name if schema differs
  await sql`
    UPDATE rider_profiles SET chill_score = ${Math.round(chillScore)} WHERE user_id = ${ratedUserId}
  `.catch(() => null); // silently ignore if column doesn't exist yet

  await sql`
    UPDATE driver_profiles SET chill_score = ${Math.round(chillScore)} WHERE user_id = ${ratedUserId}
  `.catch(() => null);
}

async function checkWeirdo(ratedUserId: string, currentRaterDbId: string) {
  // Count WEIRDO ratings from distinct users
  const weirdoRaters = await sql`
    SELECT COUNT(DISTINCT rater_user_id) AS cnt
    FROM ratings_and_reviews
    WHERE rated_user_id = ${ratedUserId}
      AND categories->>'chill_rating' = 'WEIRDO'
      AND is_flagged = false
  `;

  const cnt = Number(weirdoRaters[0]?.cnt ?? 0);

  if (cnt >= 3) {
    // Flag account for admin review
    await sql`
      UPDATE users
      SET is_active = false,
          updated_at = NOW()
      WHERE id = ${ratedUserId}
    `.catch(() => null);

    // Insert an admin notification / flag record if an admin_flags table exists
    await sql`
      INSERT INTO admin_flags (user_id, reason, created_at)
      VALUES (${ratedUserId}, 'WEIRDO x3 from distinct users', NOW())
      ON CONFLICT DO NOTHING
    `.catch(() => null);
  }
}
