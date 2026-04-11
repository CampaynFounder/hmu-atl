// Backfill rider_profiles.phone and driver_profiles.phone from Clerk for users
// that already exist in Neon but have no phone cached on their profile row.
//
// Usage (from project root):
//   npx tsx scripts/backfill-phones-from-clerk.ts
//
// Requires: CLERK_SECRET_KEY and DATABASE_URL in the environment.

import { createClerkClient } from '@clerk/backend';
import { neon } from '@neondatabase/serverless';

async function main() {
  const clerkSecret = process.env.CLERK_SECRET_KEY;
  const dbUrl = process.env.DATABASE_URL;
  if (!clerkSecret) throw new Error('CLERK_SECRET_KEY not set');
  if (!dbUrl) throw new Error('DATABASE_URL not set');

  const clerk = createClerkClient({ secretKey: clerkSecret });
  const sql = neon(dbUrl);

  const rows = await sql`
    SELECT u.id, u.clerk_id, u.profile_type,
           rp.phone AS rider_phone,
           dp.phone AS driver_phone
    FROM users u
    LEFT JOIN rider_profiles rp ON rp.user_id = u.id
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
    WHERE (rp.user_id IS NOT NULL AND rp.phone IS NULL)
       OR (dp.user_id IS NOT NULL AND dp.phone IS NULL)
  `;

  console.log(`[backfill] ${rows.length} users missing phone on profile row`);

  let updated = 0;
  let skipped = 0;
  for (const row of rows as any[]) {
    try {
      const clerkUser = await clerk.users.getUser(row.clerk_id);
      const verified = clerkUser.phoneNumbers.find((p) => p.verification?.status === 'verified');
      if (!verified) {
        skipped++;
        continue;
      }
      if (row.rider_phone === null) {
        await sql`UPDATE rider_profiles SET phone = ${verified.phoneNumber} WHERE user_id = ${row.id}`;
      }
      if (row.driver_phone === null) {
        await sql`UPDATE driver_profiles SET phone = ${verified.phoneNumber} WHERE user_id = ${row.id}`;
      }
      updated++;
    } catch (err) {
      console.warn(`[backfill] failed for ${row.clerk_id}:`, err);
      skipped++;
    }
  }

  console.log(`[backfill] done. updated=${updated} skipped=${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
