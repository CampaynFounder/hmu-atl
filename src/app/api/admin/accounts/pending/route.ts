import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { adminRatelimit } from '@/lib/admin/ratelimit';
import sql from '@/lib/admin/db';
import type { User, DriverProfile, VehicleInformation } from '@/lib/db/types';

export interface PendingAccount {
  user: User;
  driver_profile: DriverProfile;
  vehicle: VehicleInformation | null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { success } = await adminRatelimit.limit(auth.userId);
  if (!success) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const rows = await sql`
    SELECT
      row_to_json(u)   AS user,
      row_to_json(dp)  AS driver_profile,
      row_to_json(vi)  AS vehicle
    FROM driver_profiles dp
    JOIN users u        ON u.id = dp.user_id
    LEFT JOIN vehicle_information vi
      ON vi.driver_id = dp.id AND vi.is_active = true
    WHERE dp.background_check_status = 'pending'
      AND u.is_active = true
    ORDER BY dp.created_at ASC
  `;

  return NextResponse.json({ accounts: rows });
}
