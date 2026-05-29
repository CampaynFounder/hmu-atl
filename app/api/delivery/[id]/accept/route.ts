// POST /api/delivery/[id]/accept
// Courier accepts a delivery opportunity. Transitions pending → courier_accepted.

import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.profile_type !== 'driver') {
      return NextResponse.json({ error: 'Only couriers can accept deliveries' }, { status: 403 });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `UPDATE delivery_requests
         SET status = 'courier_accepted', courier_id = $1, accepted_at = NOW(), updated_at = NOW()
         WHERE id = $2 AND status = 'pending' AND expires_at > NOW()
         RETURNING id, customer_id AS "customerId",
           estimated_merchant_spend_cents AS "estimatedMerchantSpendCents",
           delivery_fee_cents AS "deliveryFeeCents",
           platform_fee_cents AS "platformFeeCents",
           merchant_name AS "merchantName",
           merchant_address AS "merchantAddress",
           merchant_lat AS "merchantLat",
           merchant_lng AS "merchantLng",
           customer_address AS "customerAddress"`,
        [user.id, id],
      );

      if (!rows[0]) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Request no longer available' }, { status: 409 });
      }

      await client.query('COMMIT');

      const row = rows[0];
      const courierEarn = (row.deliveryFeeCents - row.platformFeeCents) / 100;
      const courierAdvance = row.estimatedMerchantSpendCents / 100;

      return NextResponse.json({
        deliveryId: row.id,
        status: 'courier_accepted',
        merchantName: row.merchantName,
        merchantAddress: row.merchantAddress,
        merchantLat: row.merchantLat,
        merchantLng: row.merchantLng,
        customerAddress: row.customerAddress,
        payout: {
          courierEarn,
          courierAdvance,
          courierGuaranteed: courierEarn + courierAdvance,
        },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[delivery/accept]', err);
    return NextResponse.json({ error: 'Failed to accept delivery' }, { status: 500 });
  }
}
