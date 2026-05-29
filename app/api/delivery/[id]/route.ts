// GET /api/delivery/[id]
// Returns full delivery detail for customer or assigned courier.

import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { rows } = await pool.query(
      `SELECT
        dr.id, dr.status,
        dr.merchant_name AS "merchantName", dr.merchant_address AS "merchantAddress",
        dr.merchant_lat AS "merchantLat", dr.merchant_lng AS "merchantLng",
        dr.customer_address AS "customerAddress",
        dr.customer_lat AS "customerLat", dr.customer_lng AS "customerLng",
        dr.estimated_merchant_spend_cents AS "estimatedMerchantSpendCents",
        dr.delivery_fee_cents AS "deliveryFeeCents",
        dr.platform_fee_cents AS "platformFeeCents",
        dr.auth_buffer_cents AS "authBufferCents",
        dr.total_hold_cents AS "totalHoldCents",
        dr.actual_merchant_spend_cents AS "actualMerchantSpendCents",
        dr.customer_id AS "customerId",
        dr.courier_id AS "courierId",
        dr.created_at AS "createdAt",
        dr.accepted_at AS "acceptedAt",
        dr.at_merchant_at AS "atMerchantAt",
        dr.receipt_uploaded_at AS "receiptUploadedAt",
        dr.en_route_at AS "enRouteAt",
        dr.delivered_at AS "deliveredAt",
        dr.completed_at AS "completedAt",
        -- Courier profile (if assigned)
        dp.first_name AS "courierFirstName",
        dp.handle AS "courierHandle",
        dp.thumbnail_url AS "courierAvatarUrl",
        -- Latest receipt
        rec.receipt_url AS "receiptUrl",
        rec.ocr_total_cents AS "receiptTotalCents",
        -- Latest courier GPS
        (SELECT lat FROM delivery_locations
          WHERE delivery_id = dr.id AND actor_id = dr.courier_id
          ORDER BY recorded_at DESC LIMIT 1) AS "courierLat",
        (SELECT lng FROM delivery_locations
          WHERE delivery_id = dr.id AND actor_id = dr.courier_id
          ORDER BY recorded_at DESC LIMIT 1) AS "courierLng"
      FROM delivery_requests dr
      LEFT JOIN driver_profiles dp ON dp.user_id = dr.courier_id
      LEFT JOIN LATERAL (
        SELECT receipt_url, ocr_total_cents
        FROM delivery_receipts
        WHERE delivery_id = dr.id
        ORDER BY created_at DESC LIMIT 1
      ) rec ON TRUE
      WHERE dr.id = $1
        AND (dr.customer_id = $2 OR dr.courier_id = $2)`,
      [id, user.id],
    );

    if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const row = rows[0];

    const { rows: items } = await pool.query(
      `SELECT id, name, quantity,
        estimated_price_cents AS "estimatedPriceCents",
        actual_price_cents AS "actualPriceCents",
        notes, photo_url AS "photoUrl"
       FROM delivery_items WHERE delivery_id = $1 ORDER BY created_at`,
      [id],
    );

    const isCustomer = row.customerId === user.id;
    const courierEarnCents = row.deliveryFeeCents - row.platformFeeCents;
    const courierAdvanceCents = row.estimatedMerchantSpendCents;

    return NextResponse.json({
      id: row.id,
      status: row.status,
      merchantName: row.merchantName,
      merchantAddress: row.merchantAddress,
      merchantLat: row.merchantLat,
      merchantLng: row.merchantLng,
      customerAddress: row.customerAddress,
      customerLat: row.customerLat,
      customerLng: row.customerLng,
      items: items.map((i: any) => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        estimatedPrice: i.estimatedPriceCents / 100,
        actualPrice: i.actualPriceCents ? i.actualPriceCents / 100 : null,
        notes: i.notes,
        photoUrl: i.photoUrl,
      })),
      estimate: {
        estimatedMerchantSpend: row.estimatedMerchantSpendCents / 100,
        deliveryFee: row.deliveryFeeCents / 100,
        platformFee: row.platformFeeCents / 100,
        authBuffer: row.authBufferCents / 100,
        totalHold: row.totalHoldCents / 100,
        courierEarn: courierEarnCents / 100,
        courierAdvance: courierAdvanceCents / 100,
        courierGuaranteed: (courierEarnCents + courierAdvanceCents) / 100,
      },
      // PIN only exposed to customer once delivered
      ...(isCustomer && row.status === 'delivered' ? { deliveryPin: null } : {}),
      receiptUrl: row.receiptUrl ?? null,
      receiptTotal: row.receiptTotalCents ? row.receiptTotalCents / 100 : null,
      courierFirstName: row.courierFirstName ?? null,
      courierHandle: row.courierHandle ?? null,
      courierAvatarUrl: row.courierAvatarUrl ?? null,
      courierLat: row.courierLat ?? null,
      courierLng: row.courierLng ?? null,
      createdAt: row.createdAt,
      acceptedAt: row.acceptedAt ?? null,
      completedAt: row.completedAt ?? null,
    });
  } catch (err) {
    console.error('[delivery/[id]]', err);
    return NextResponse.json({ error: 'Failed to load delivery' }, { status: 500 });
  }
}
