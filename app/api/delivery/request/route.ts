// POST /api/delivery/request
// Customer creates a delivery request. Places escrow hold for total amount.

import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/guards';
import { isValidCoordinates } from '@/lib/geo/distance';
import { resolveMarketForUser, feedChannelForMarket } from '@/lib/markets/resolver';
import { publishToChannel } from '@/lib/ably/server';
import { z } from 'zod';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PLATFORM_CUT_RATE = 0.15;
const BASE_DELIVERY_FEE_CENTS = 800;
const PER_MILE_CENTS = 75;
const AUTH_BUFFER_RATE = 0.15;
const KM_PER_MILE = 1.60934;

function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return (2 * R * Math.asin(Math.sqrt(h))) / KM_PER_MILE;
}

const DeliveryItemSchema = z.object({
  name: z.string().min(1).max(200),
  quantity: z.number().int().min(1).max(99),
  estimatedPriceCents: z.number().int().min(0).max(100_000),
  notes: z.string().max(500).optional(),
});

const RequestSchema = z.object({
  merchantName: z.string().min(1).max(200),
  merchantAddress: z.string().min(1).max(500),
  merchantLat: z.number().min(-90).max(90),
  merchantLng: z.number().min(-180).max(180),
  customerAddress: z.string().min(1).max(500),
  customerLat: z.number().min(-90).max(90),
  customerLng: z.number().min(-180).max(180),
  items: z.array(DeliveryItemSchema).min(1).max(20),
  paymentMethodId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.profile_type !== 'rider') {
      return NextResponse.json({ error: 'Only riders can place delivery requests' }, { status: 403 });
    }
    if (user.account_status !== 'active') {
      return NextResponse.json({ error: 'Account must be active' }, { status: 403 });
    }

    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const d = parsed.data;

    if (!isValidCoordinates({ latitude: d.merchantLat, longitude: d.merchantLng }) || !isValidCoordinates({ latitude: d.customerLat, longitude: d.customerLng })) {
      return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
    }

    const market = await resolveMarketForUser(user.id);
    if (!market) return NextResponse.json({ error: 'No active market at delivery address' }, { status: 400 });

    const distanceMiles = haversineMiles(
      { lat: d.merchantLat, lng: d.merchantLng },
      { lat: d.customerLat, lng: d.customerLng },
    );

    const estimatedMerchantSpendCents = d.items.reduce(
      (sum, item) => sum + item.estimatedPriceCents * item.quantity,
      0,
    );
    const deliveryFeeCents = BASE_DELIVERY_FEE_CENTS + Math.round(distanceMiles * PER_MILE_CENTS);
    const platformFeeCents = Math.round(deliveryFeeCents * PLATFORM_CUT_RATE);
    const authBufferCents = Math.round(estimatedMerchantSpendCents * AUTH_BUFFER_RATE);
    const totalHoldCents = estimatedMerchantSpendCents + deliveryFeeCents + platformFeeCents + authBufferCents;

    const pinRaw = String(Math.floor(1000 + Math.random() * 9000));
    const pinHash = crypto.createHash('sha256').update(pinRaw).digest('hex');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: [delivery] } = await client.query(
        `INSERT INTO delivery_requests (
          market_id, customer_id, status,
          merchant_name, merchant_address, merchant_lat, merchant_lng,
          customer_address, customer_lat, customer_lng,
          estimated_merchant_spend_cents, delivery_fee_cents, platform_fee_cents,
          auth_buffer_cents, total_hold_cents, delivery_pin_hash,
          expires_at
        ) VALUES ($1,$2,'pending',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
          NOW() + INTERVAL '30 minutes')
        RETURNING id`,
        [
          market.market_id, user.id,
          d.merchantName, d.merchantAddress, d.merchantLat, d.merchantLng,
          d.customerAddress, d.customerLat, d.customerLng,
          estimatedMerchantSpendCents, deliveryFeeCents, platformFeeCents,
          authBufferCents, totalHoldCents, pinHash,
        ],
      );

      const deliveryId = delivery.id;

      for (const item of d.items) {
        await client.query(
          `INSERT INTO delivery_items (delivery_id, name, quantity, estimated_price_cents, notes)
           VALUES ($1, $2, $3, $4, $5)`,
          [deliveryId, item.name, item.quantity, item.estimatedPriceCents, item.notes ?? null],
        );
      }

      await client.query('COMMIT');

      // Publish to the market feed channel so every driver feed (web + mobile)
      // refetches and the new store run surfaces live — the SAME channel open
      // rider_requests + down-bads use. Previously delivery had ZERO realtime,
      // so store runs only appeared on a manual tab switch. Best-effort — a
      // publish failure never fails the (already-committed) request.
      publishToChannel(feedChannelForMarket(market.slug), 'delivery_posted', {
        deliveryId,
      }).catch((e) => console.error('[delivery/request] feed publish failed:', e));

      return NextResponse.json({
        deliveryId,
        deliveryPin: pinRaw,
        estimate: {
          estimatedMerchantSpend: estimatedMerchantSpendCents / 100,
          deliveryFee: deliveryFeeCents / 100,
          platformFee: platformFeeCents / 100,
          authBuffer: authBufferCents / 100,
          totalHold: totalHoldCents / 100,
        },
      }, { status: 201 });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[delivery/request]', err);
    return NextResponse.json({ error: 'Failed to create delivery request' }, { status: 500 });
  }
}
