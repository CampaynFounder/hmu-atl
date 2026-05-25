// DEPRECATED: This endpoint redirected to Stripe Checkout (hosted page).
// Violates the in-app-only policy per CLAUDE.md STRIPE INTEGRATION section.
// Use InlinePaymentForm component instead (components/payments/inline-payment-form.tsx).
// Callers: app/rider/settings/rider-settings-client.tsx already uses InlinePaymentForm.
// This file is kept only to prevent runtime errors if old code references it.

import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error: 'This endpoint is deprecated. Use /api/rider/payment-methods/setup-intent instead (via InlinePaymentForm component).',
      redirectTo: '/rider/settings?tab=payment',
    },
    { status: 410 } // 410 Gone
  );
}
