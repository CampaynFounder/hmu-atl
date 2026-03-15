import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { adminRatelimit } from '@/lib/admin/ratelimit';
import sql from '@/lib/admin/db';
import type { Ride, DriverProfile } from '@/lib/db/types';

export interface LiveRide extends Ride {
  driver_latitude: number | null;
  driver_longitude: number | null;
  driver_name: string;
  driver_phone: string;
  rider_name: string;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { success } = await adminRatelimit.limit(auth.userId);
  if (!success) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const rows = await sql<LiveRide[]>`
    SELECT
      r.*,
      dp.current_latitude   AS driver_latitude,
      dp.current_longitude  AS driver_longitude,
      du.full_name          AS driver_name,
      du.phone_number       AS driver_phone,
      ru.full_name          AS rider_name
    FROM rides r
    JOIN driver_profiles dp ON dp.user_id = r.driver_id
    JOIN users du            ON du.id      = r.driver_id
    JOIN users ru            ON ru.id      = r.rider_id
    WHERE r.status IN ('accepted', 'driver_arrived', 'in_progress')
    ORDER BY r.created_at DESC
  `;

  return NextResponse.json({ rides: rows });
}
