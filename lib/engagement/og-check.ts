import sql from '../db/client';

/**
 * Called on every ride completion for the rider.
 * If rider has >= 10 completed rides and zero disputes, upgrade og_status = true
 * and send an OG upgrade notification.
 */
export async function checkAndUpgradeOgStatus(riderDbId: string): Promise<void> {
  const rows = await sql`
    SELECT
      rp.id,
      rp.og_status,
      rp.total_rides_taken,
      (
        SELECT COUNT(*) FROM disputes d
        JOIN rides r ON r.id = d.ride_id
        WHERE r.rider_id = ${riderDbId}
          AND d.raised_by_user_id = ${riderDbId}
      ) AS dispute_count
    FROM rider_profiles rp
    WHERE rp.user_id = ${riderDbId}
    LIMIT 1
  `.catch(() => []);

  if (!rows.length) return;

  const profile = rows[0] as {
    id: string;
    og_status: boolean;
    total_rides_taken: number;
    dispute_count: number | string;
  };

  // Already OG — nothing to do
  if (profile.og_status) return;

  const disputeCount = Number(profile.dispute_count ?? 0);
  const completedRides = profile.total_rides_taken;

  if (completedRides >= 10 && disputeCount === 0) {
    // Upgrade OG status
    await sql`
      UPDATE rider_profiles
      SET og_status = true,
          updated_at = NOW()
      WHERE user_id = ${riderDbId}
    `;

    // Trigger OG notification
    await sql`
      INSERT INTO notifications
        (user_id, notification_type, title, message, priority, is_read, created_at)
      VALUES
        (${riderDbId}, 'system_alert', 'You''re an OG!',
         'Congrats — you''ve unlocked OG status. You now get to see driver comments.',
         'high', false, NOW())
    `.catch(() => null);
  }
}
