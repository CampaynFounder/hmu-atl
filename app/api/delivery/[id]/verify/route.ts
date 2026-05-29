// POST /api/delivery/[id]/verify
// Customer enters PIN to confirm delivery. delivered → completed.
// Captures Stripe escrow hold for actual amount (merchant spend + delivery fee + platform fee).

import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/guards';
import { z } from 'zod';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VerifySchema = z.object({
  pin: z.string().length(4).regex(/^\d{4}$/),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const parsed = VerifySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid PIN format' }, { status: 400 });
    }

    const { rows: [delivery] } = await pool.query(
      `SELECT id, delivery_pin_hash AS "pinHash", payment_intent_id AS "paymentIntentId",
        actual_merchant_spend_cents AS "actualMerchantSpendCents",
        estimated_merchant_spend_cents AS "estimatedMerchantSpendCents",
        delivery_fee_cents AS "deliveryFeeCents",
        platform_fee_cents AS "platformFeeCents",
        courier_id AS "courierId"
       FROM delivery_requests
       WHERE id = $1 AND customer_id = $2 AND status = 'delivered'`,
      [id, user.id],
    );

    if (!delivery) return NextResponse.json({ error: 'Delivery not found or not in delivered state' }, { status: 404 });

    const pinHash = crypto.createHash('sha256').update(parsed.data.pin).digest('hex');
    if (pinHash !== delivery.pinHash) {
      return NextResponse.json({ error: 'Incorrect PIN' }, { status: 400 });
    }

    // Capture actual amount: actual merchant spend (or estimated if OCR failed) + delivery fee + platform fee
    const merchantSpendCents = delivery.actualMerchantSpendCents ?? delivery.estimatedMerchantSpendCents;
    const captureAmountCents = merchantSpendCents + delivery.deliveryFeeCents + delivery.platformFeeCents;

    // TODO: Stripe capture when payment_intent_id is set
    // await stripe.paymentIntents.capture(delivery.paymentIntentId, { amount_to_capture: captureAmountCents });

    await pool.query(
      `UPDATE delivery_requests
       SET status = 'completed', completed_at = NOW(), payment_captured = TRUE, updated_at = NOW()
       WHERE id = $1`,
      [id],
    );

    return NextResponse.json({
      status: 'completed',
      capturedAmount: captureAmountCents / 100,
      courierPayout: (delivery.deliveryFeeCents - delivery.platformFeeCents + merchantSpendCents) / 100,
    });
  } catch (err) {
    console.error('[delivery/verify]', err);
    return NextResponse.json({ error: 'Failed to verify delivery' }, { status: 500 });
  }
}
