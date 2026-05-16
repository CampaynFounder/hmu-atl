// Minimal rider profile update endpoint. Scoped to fields the rider
// onboarding flows need (handle, ride_types, home_area_slug); broaden as
// new flows ship rather than upfront — keeps the surface area honest.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { clerkClient } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { updateRiderProfile } from '@/lib/db/profiles';

const SLUG_RE = /^[a-z0-9_]{1,32}$/;
const HANDLE_RE = /^[a-z0-9_-]+$/;
const MAX_RIDE_TYPES = 24;
const MAX_HOME_AREA_LEN = 64;

export async function PATCH(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  // Build a partial patch — anything `undefined` is ignored downstream.
  const patch: { handle?: string; ride_types?: string[]; home_area_slug?: string | null } = {};

  if (typeof body.handle === 'string') {
    const normalized = body.handle.trim().toLowerCase().replace(/\s+/g, '');
    if (normalized.length < 2 || !HANDLE_RE.test(normalized)) {
      return NextResponse.json({ error: 'Invalid handle' }, { status: 400 });
    }
    patch.handle = normalized;
  }

  if (Array.isArray(body.ride_types)) {
    const cleaned = Array.from(new Set(
      body.ride_types
        .map((s: unknown) => typeof s === 'string' ? s.toLowerCase() : '')
        .filter((s: string) => s.length > 0 && SLUG_RE.test(s))
    )).slice(0, MAX_RIDE_TYPES) as string[];
    patch.ride_types = cleaned;
  }

  if (body.home_area_slug !== undefined) {
    if (body.home_area_slug === null || body.home_area_slug === '') {
      patch.home_area_slug = null;
    } else if (typeof body.home_area_slug === 'string' && body.home_area_slug.length <= MAX_HOME_AREA_LEN) {
      patch.home_area_slug = body.home_area_slug.trim().toLowerCase();
    } else {
      return NextResponse.json({ error: 'Invalid home_area_slug' }, { status: 400 });
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const userRows = await sql`
    SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `;
  if (userRows.length === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const userId = userRows[0].id as string;

  // Blast funnel signups reach this endpoint before the full onboarding flow
  // runs, so rider_profiles may not exist yet. Upsert a minimal row using
  // Clerk name data so updateRiderProfile never throws "not found".
  try {
    const existing = await sql`SELECT id FROM rider_profiles WHERE user_id = ${userId} LIMIT 1`;
    if (!existing.length) {
      const clerk = await clerkClient();
      const clerkUser = await clerk.users.getUser(clerkId);
      const firstName = clerkUser.firstName || 'Rider';
      const lastName = clerkUser.lastName || '';
      await sql`
        INSERT INTO rider_profiles (user_id, first_name, last_name, safety_preferences)
        VALUES (${userId}, ${firstName}, ${lastName}, '{}')
        ON CONFLICT (user_id) DO NOTHING
      `;
    }
  } catch {
    // Non-fatal — updateRiderProfile will throw its own error if the row
    // still doesn't exist after this, handled below.
  }

  try {
    const updated = await updateRiderProfile(userId, patch);
    return NextResponse.json({
      ok: true,
      handle: updated.handle,
      ride_types: updated.ride_types,
      home_area_slug: updated.home_area_slug,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (/duplicate key|unique/i.test(msg)) {
      return NextResponse.json({ error: 'Handle already taken' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Could not update' }, { status: 500 });
  }
}
