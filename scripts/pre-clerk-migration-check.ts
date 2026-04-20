/**
 * Pre-flight check before moving Clerk custom domain to the root
 * (clerk.atl.hmucashride.com → clerk.hmucashride.com).
 *
 * The Clerk domain change invalidates existing session cookies (they're scoped
 * to .atl.hmucashride.com and can't be read from the new root domain). Users
 * sign in again once; their accounts/data are preserved.
 *
 * This script guarantees no active rides are in flight at cutover so no one
 * gets logged out mid-ride. Exit code 0 = safe to proceed; 1 = rides in flight.
 *
 * Usage:
 *   npx tsx scripts/pre-clerk-migration-check.ts
 */

import { neon } from '@neondatabase/serverless';

const ACTIVE_STATUSES = ['matched', 'otw', 'here', 'active'];

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const sql = neon(dbUrl);

  const rows = await sql`
    SELECT status, COUNT(*)::int as count
    FROM rides
    WHERE status = ANY(${ACTIVE_STATUSES}::text[])
    GROUP BY status
    ORDER BY count DESC
  `;

  if (rows.length === 0) {
    console.log('✅ Zero active rides — safe to proceed with Clerk root-domain migration.');
    process.exit(0);
  }

  console.error('❌ Active rides detected — migration would interrupt them:');
  for (const row of rows) {
    console.error(`  - ${row.status}: ${row.count}`);
  }
  console.error('');
  console.error('Wait for these rides to complete, then re-run this check.');
  console.error('Status details: otw = en route to pickup, here = at pickup, active = in progress.');
  process.exit(1);
}

main().catch((err) => {
  console.error('Pre-flight check failed:', err);
  process.exit(1);
});
