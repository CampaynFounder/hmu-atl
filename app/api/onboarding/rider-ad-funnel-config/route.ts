// GET /api/onboarding/rider-ad-funnel-config — public read.
// Mirrors /api/onboarding/driver-express-config. Drives client-side rendering
// of the ad-funnel rider flow; no sensitive values.

import { NextResponse } from 'next/server';
import { getRiderAdFunnelConfig } from '@/lib/onboarding/rider-ad-funnel-config';

export const runtime = 'nodejs';

export async function GET() {
  const config = await getRiderAdFunnelConfig();
  return NextResponse.json({ config });
}
