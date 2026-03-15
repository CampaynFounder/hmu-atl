import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { adminRatelimit } from '@/lib/admin/ratelimit';
import sql from '@/lib/admin/db';
import type { Dispute, Ride } from '@/lib/db/types';

export interface DisputeWithHistory extends Dispute {
  ride: Ride;
  raised_by_name: string;
  raised_by_phone: string;
  driver_name: string;
  rider_name: string;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { success } = await adminRatelimit.limit(auth.userId);
  if (!success) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const rows = await sql<DisputeWithHistory[]>`
    SELECT
      d.*,
      row_to_json(r)          AS ride,
      ru.full_name            AS raised_by_name,
      ru.phone_number         AS raised_by_phone,
      du.full_name            AS driver_name,
      rider_u.full_name       AS rider_name
    FROM disputes d
    JOIN rides r              ON r.id  = d.ride_id
    JOIN users ru             ON ru.id = d.raised_by_user_id
    JOIN users du             ON du.id = r.driver_id
    JOIN users rider_u        ON rider_u.id = r.rider_id
    WHERE d.status IN ('open', 'under_review', 'escalated')
    ORDER BY
      CASE d.priority
        WHEN 'urgent' THEN 1
        WHEN 'high'   THEN 2
        WHEN 'medium' THEN 3
        ELSE               4
      END,
      d.created_at ASC
  `;

  return NextResponse.json({ disputes: rows });
}
