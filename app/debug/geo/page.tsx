import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import GeoDebugClient from './geo-debug-client';

export const metadata = { title: 'Geo Debug' };
export const dynamic = 'force-dynamic';

// Intentionally NOT gated to signed-in users. The page only exposes the
// caller's own data (their own clerk_id / driver_profiles row), and the most
// important diagnostics are client-side (permission state, getCurrentPosition).
// Keeping it open means we can still diagnose Clerk handshake failures on
// iOS Safari without being blocked by them.
export default async function GeoDebugPage() {
  let clerkId: string | null = null;
  try {
    const a = await auth();
    clerkId = a.userId ?? null;
  } catch {
    // Clerk handshake itself can hang/throw on iOS Safari with ITP — swallow
    // and render the diagnostic anyway. The client-side info is what we need.
    clerkId = null;
  }

  let user:
    | { id: string; profile_type: string; location_updated_at: string | null; current_lat: string | null; current_lng: string | null; location_accuracy_m: number | null }
    | undefined;
  if (clerkId) {
    try {
      const rows = await sql`
        SELECT u.id, u.profile_type, dp.location_updated_at, dp.current_lat, dp.current_lng, dp.location_accuracy_m
        FROM users u
        LEFT JOIN driver_profiles dp ON dp.user_id = u.id
        WHERE u.clerk_id = ${clerkId}
        LIMIT 1
      `;
      user = rows[0] as typeof user;
    } catch {
      user = undefined;
    }
  }

  return (
    <GeoDebugClient
      clerkId={clerkId ?? '(not signed in)'}
      userId={user?.id ?? null}
      profileType={user?.profile_type ?? null}
      serverLocationUpdatedAt={user?.location_updated_at ?? null}
      serverLat={user?.current_lat ?? null}
      serverLng={user?.current_lng ?? null}
      serverAccuracy={user?.location_accuracy_m ?? null}
    />
  );
}
