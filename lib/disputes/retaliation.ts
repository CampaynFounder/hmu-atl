import sql from '../db/client';

/**
 * Retaliation detector — called after every rating insert.
 *
 * Checks if the rater recently received a rating from the rated user
 * within the same ride window (within 24 hours). If both parties rated
 * each other negatively (kinda_creepy or weirdo) in quick succession,
 * flags the pair for admin review.
 */
export async function detectRetaliation(
  rideId: string,
  raterUserId: string,
  ratedUserId: string,
  ratingType: string
): Promise<void> {
  // Only check negative ratings
  if (ratingType !== 'kinda_creepy' && ratingType !== 'weirdo') return;

  // Check if rated user also gave a negative rating to rater in the last 24h
  const rows = await sql`
    SELECT id, rating_type FROM ratings
    WHERE ride_id     = ${rideId}
      AND rater_id    = ${ratedUserId}
      AND rated_id    = ${raterUserId}
      AND rating_type IN ('kinda_creepy', 'weirdo')
      AND created_at  > NOW() - INTERVAL '24 hours'
    LIMIT 1
  `.catch(() => []);

  if (!rows.length) return;

  // Mutual negative ratings on same ride → possible retaliation
  await sql`
    INSERT INTO admin_flags (user_id, reason, metadata, created_at)
    VALUES
      (${raterUserId},
       'possible_retaliation',
       ${JSON.stringify({ ride_id: rideId, counterpart_id: ratedUserId, rating_type: ratingType })},
       NOW()),
      (${ratedUserId},
       'possible_retaliation',
       ${JSON.stringify({ ride_id: rideId, counterpart_id: raterUserId, rating_type: rows[0].rating_type })},
       NOW())
    ON CONFLICT DO NOTHING
  `.catch(() => null);
}
