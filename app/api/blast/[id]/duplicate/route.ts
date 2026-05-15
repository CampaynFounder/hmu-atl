// POST /api/blast/[id]/duplicate — return a prefilled BlastDraft from a prior
// blast so the rider can edit before re-sending. Per contract §3 D-15 + §8.
//
// No new hmu_posts row is inserted here — that happens when the rider hits
// /api/blast on the new draft. We just hydrate the form. duplicated_from_id
// will be stamped on the resulting blast by Stream A's submit flow when it
// includes it in the BlastCreateInput.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import type { BlastDraft } from '@/lib/blast/types';

export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: sourceBlastId } = await params;

  const userRows = await sql`SELECT id, gender, gender_preference FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const user = userRows[0] as {
    id: string;
    gender: string | null;
    gender_preference: { preferred?: string[]; strict?: boolean } | null;
  };
  const riderId = user.id;

  const blastRows = await sql`
    SELECT id, user_id,
           pickup_lat, pickup_lng, pickup_address,
           dropoff_lat, dropoff_lng, dropoff_address,
           trip_type, scheduled_for, storage_requested,
           driver_preference, price
      FROM hmu_posts
     WHERE id = ${sourceBlastId} AND post_type = 'blast'
     LIMIT 1
  `;
  if (!blastRows.length) {
    return NextResponse.json({ error: 'Blast not found' }, { status: 404 });
  }
  const post = blastRows[0] as Record<string, unknown>;
  if (post.user_id !== riderId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Map legacy 'male' | 'female' | 'any' driver_preference to v3 GenderPreference.
  // 'any' → empty preferred + strict:false (matches the user's saved profile pref
  // if available, else open).
  const legacyPref = (post.driver_preference as string) ?? 'any';
  const driverPreference = (() => {
    if (legacyPref === 'male') return { preferred: ['man' as const], strict: false };
    if (legacyPref === 'female') return { preferred: ['woman' as const], strict: false };
    // Pull saved profile preference if present.
    const saved = user.gender_preference;
    if (saved && Array.isArray(saved.preferred)) {
      // Cast through the GenderOption union — values from the DB should already
      // be 'man' | 'woman' | 'nonbinary'.
      return {
        preferred: saved.preferred as Array<'man' | 'woman' | 'nonbinary'>,
        strict: Boolean(saved.strict),
      };
    }
    return { preferred: [] as Array<'man' | 'woman' | 'nonbinary'>, strict: false };
  })();

  const draft: BlastDraft = {
    pickup: {
      lat: Number(post.pickup_lat),
      lng: Number(post.pickup_lng),
      address: (post.pickup_address as string) ?? '',
    },
    dropoff: {
      lat: Number(post.dropoff_lat),
      lng: Number(post.dropoff_lng),
      address: (post.dropoff_address as string) ?? '',
    },
    tripType: (post.trip_type as 'one_way' | 'round_trip') ?? 'one_way',
    // Re-sending a blast clears the schedule — new request happens "now".
    scheduledFor: null,
    storage: Boolean(post.storage_requested),
    priceDollars: Number(post.price),
    riderGender: (user.gender as 'man' | 'woman' | 'nonbinary' | null) ?? null,
    driverPreference,
    draftCreatedAt: Date.now(),
  };

  return NextResponse.json({ draft, sourceBlastId });
}
