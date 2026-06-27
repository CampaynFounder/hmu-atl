// GET /api/driver/hmu-first — lets the app know whether HMU First enrollment is
// open and at what price, so the driver UI can suppress upsell containers and
// show the current price. Auth-gated but returns no per-user data.

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getHmuFirstConfig } from '@/lib/hmu-first';

export const runtime = 'nodejs';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const cfg = await getHmuFirstConfig();
  return NextResponse.json(cfg);
}
