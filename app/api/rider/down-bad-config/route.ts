// GET /api/rider/down-bad-config
// Returns Down Bad feature config + rider disclaimer text for the creation form.
// Auth required — no sense loading this for non-riders.

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getPlatformConfig } from '@/lib/platform-config/get';

interface DownBadConfig {
  enabled: boolean;
  fee_flat_cents: number;
  fee_pct: number;
  cash_floor_cents: number;
  cash_ceiling_cents: number;
  sum_extra_max_chars: number;
  require_min_rides: number;
  require_min_chill_score: number;
}

interface DownBadDisclaimer {
  rider_text: string;
  driver_text: string;
}

const CONFIG_DEFAULTS: DownBadConfig = {
  enabled: false,
  fee_flat_cents: 50,
  fee_pct: 0,
  cash_floor_cents: 500,
  cash_ceiling_cents: 3000,
  sum_extra_max_chars: 120,
  require_min_rides: 0,
  require_min_chill_score: 0,
};

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [config, disclaimer] = await Promise.all([
    getPlatformConfig('down_bad.config', CONFIG_DEFAULTS as unknown as Record<string, unknown>),
    getPlatformConfig('down_bad.disclaimer', { rider_text: '', driver_text: '' } as Record<string, unknown>),
  ]);
  const cfg = config as unknown as DownBadConfig;
  const disc = disclaimer as unknown as DownBadDisclaimer;

  return NextResponse.json({
    enabled: cfg.enabled,
    cashFloorCents: cfg.cash_floor_cents,
    cashCeilingCents: cfg.cash_ceiling_cents,
    sumExtraMaxChars: cfg.sum_extra_max_chars,
    requireMinRides: cfg.require_min_rides,
    requireMinChillScore: cfg.require_min_chill_score,
    disclaimerText: disc.rider_text,
  });
}
