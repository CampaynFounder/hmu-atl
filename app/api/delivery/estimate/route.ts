// GET /api/delivery/estimate
// Returns cost breakdown for a delivery request before hold is placed.
// No auth required — used to show customer the breakdown before they commit.

import { NextRequest, NextResponse } from 'next/server';
import { calculateDistance } from '@/lib/geo/distance';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PLATFORM_CUT_RATE = 0.15;
const BASE_DELIVERY_FEE_CENTS = 800;       // $8 base
const PER_MILE_CENTS = 75;                 // $0.75/mile
const AUTH_BUFFER_RATE = 0.15;             // 15% buffer on merchant spend

const EstimateSchema = z.object({
  merchantLat: z.number().min(-90).max(90),
  merchantLng: z.number().min(-180).max(180),
  customerLat: z.number().min(-90).max(90),
  customerLng: z.number().min(-180).max(180),
  estimatedMerchantSpendCents: z.number().int().min(0),
});

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const parsed = EstimateSchema.safeParse({
      merchantLat: parseFloat(url.searchParams.get('merchantLat') ?? ''),
      merchantLng: parseFloat(url.searchParams.get('merchantLng') ?? ''),
      customerLat: parseFloat(url.searchParams.get('customerLat') ?? ''),
      customerLng: parseFloat(url.searchParams.get('customerLng') ?? ''),
      estimatedMerchantSpendCents: parseInt(url.searchParams.get('estimatedMerchantSpendCents') ?? '0', 10),
    });

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid parameters', details: parsed.error.flatten() }, { status: 400 });
    }

    const { merchantLat, merchantLng, customerLat, customerLng, estimatedMerchantSpendCents } = parsed.data;

    const distanceMiles = calculateDistance(
      { latitude: merchantLat, longitude: merchantLng },
      { latitude: customerLat, longitude: customerLng },
    );

    const deliveryFeeCents = BASE_DELIVERY_FEE_CENTS + Math.round(distanceMiles * PER_MILE_CENTS);
    const platformFeeCents = Math.round(deliveryFeeCents * PLATFORM_CUT_RATE);
    const authBufferCents = Math.round(estimatedMerchantSpendCents * AUTH_BUFFER_RATE);
    const totalHoldCents =
      estimatedMerchantSpendCents + deliveryFeeCents + platformFeeCents + authBufferCents;

    // Courier-facing payout breakdown
    const courierEarnCents = deliveryFeeCents - platformFeeCents;
    const courierAdvanceCents = estimatedMerchantSpendCents;
    const courierGuaranteedCents = courierEarnCents + courierAdvanceCents;

    return NextResponse.json({
      estimatedMerchantSpend: estimatedMerchantSpendCents / 100,
      deliveryFee: deliveryFeeCents / 100,
      platformFee: platformFeeCents / 100,
      authBuffer: authBufferCents / 100,
      totalHold: totalHoldCents / 100,
      courierEarn: courierEarnCents / 100,
      courierAdvance: courierAdvanceCents / 100,
      courierGuaranteed: courierGuaranteedCents / 100,
      distanceMiles: Math.round(distanceMiles * 10) / 10,
    });
  } catch (err) {
    console.error('[delivery/estimate]', err);
    return NextResponse.json({ error: 'Failed to calculate estimate' }, { status: 500 });
  }
}
