// GET /api/onboarding/driver-express-config — public read of the express
// onboarding config. Public because the values drive UI rendering on the
// landing + onboarding screens; nothing here is sensitive.

import { NextResponse } from 'next/server';
import { getDriverExpressConfig } from '@/lib/onboarding/config';

export const runtime = 'nodejs';

export async function GET() {
  const config = await getDriverExpressConfig();
  return NextResponse.json({ config });
}
