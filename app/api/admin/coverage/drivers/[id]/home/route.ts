import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin } from '@/lib/admin/helpers';
import { sendSms } from '@/lib/sms/textbee';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = params.id;
  const body = await req.json() as Record<string, unknown>;
  const { lat, lng, label, sendText = false, market = 'atl' } = body;

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return NextResponse.json({ error: 'lat and lng must be numbers' }, { status: 400 });
  }
  if (lat < 24 || lat > 50 || lng < -130 || lng > -65) {
    return NextResponse.json({ error: 'Coordinates outside CONUS range' }, { status: 400 });
  }

  const rows = await sql`
    UPDATE driver_profiles
    SET
      home_lat        = ${lat as number},
      home_lng        = ${lng as number},
      home_label      = ${(label as string | null) ?? null},
      home_updated_at = NOW()
    WHERE user_id = ${userId}
    RETURNING id, phone, home_lat::float8 AS home_lat, home_lng::float8 AS home_lng, home_label
  `;

  if (!rows.length) {
    return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
  }

  const driver = rows[0] as Record<string, unknown>;
  let smsSent = false;

  if (sendText && driver.phone) {
    // "What area you drive in? You'll get rides around {label}. Change it: atl.hmucashride.com/driver/home fmoig @hmucashrides"
    // Max 155 chars — label truncated at 30 to stay under limit
    const homebase = ((label as string | null) ?? 'your area').slice(0, 30);
    const msg = `What area you drive in? You'll get rides around ${homebase}. Change it: atl.hmucashride.com/driver/home fmoig @hmucashrides`;
    const result = await sendSms(driver.phone as string, msg, {
      userId,
      eventType: 'admin_home_location_set',
      market: (market as string) || 'atl',
    });
    smsSent = result.success;
  }

  return NextResponse.json({
    success: true,
    homeLat: driver.home_lat,
    homeLng: driver.home_lng,
    homeLabel: driver.home_label,
    smsSent,
  });
}
