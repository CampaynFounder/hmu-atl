// Payment Escrow System
// Handles payment authorization, hold, and settlement for rides

import { createPaymentIntent } from '@/lib/stripe/client';

export interface EscrowParams {
  rideId: string;
  riderId: string;
  driverId: string;
  stripeCustomerId: string;
  stripeConnectAccountId: string;
  baseFare: number;
  distance: number;
  estimatedDuration: number;
}

export interface EscrowResult {
  paymentIntentId: string;
  clientSecret: string;
  amount: number;
  applicationFee: number;
}

/**
 * Calculate fare based on distance and time
 * Atlanta pricing: $2 base + $1.50/mile + $0.30/minute
 */
export function calculateFare(params: {
  distanceMiles: number;
  estimatedMinutes: number;
}): {
  baseFare: number;
  distanceFee: number;
  timeFee: number;
  total: number;
} {
  const BASE_FEE = 200; // $2.00 in cents
  const PER_MILE_FEE = 150; // $1.50 in cents
  const PER_MINUTE_FEE = 30; // $0.30 in cents

  const distanceFee = Math.round(params.distanceMiles * PER_MILE_FEE);
  const timeFee = Math.round(params.estimatedMinutes * PER_MINUTE_FEE);
  const total = BASE_FEE + distanceFee + timeFee;

  return {
    baseFare: BASE_FEE,
    distanceFee,
    timeFee,
    total,
  };
}

/**
 * Calculate platform fee (15% of total fare)
 */
export function calculatePlatformFee(totalFare: number): number {
  return Math.round(totalFare * 0.15);
}

/**
 * Create payment escrow when ride is requested
 * Authorizes payment but doesn't capture until ride completes
 */
export async function createEscrow(
  params: EscrowParams
): Promise<EscrowResult> {
  // Calculate total amount
  const amount = params.baseFare;
  const applicationFee = calculatePlatformFee(amount);

  // Create Payment Intent with escrow hold
  const paymentIntent = await createPaymentIntent({
    amount,
    customerId: params.stripeCustomerId,
    driverId: params.stripeConnectAccountId,
    applicationFeeAmount: applicationFee,
    metadata: {
      ride_id: params.rideId,
      rider_id: params.riderId,
      driver_id: params.driverId,
      distance: params.distance.toString(),
      estimated_duration: params.estimatedDuration.toString(),
    },
  });

  return {
    paymentIntentId: paymentIntent.id,
    clientSecret: paymentIntent.clientSecret,
    amount,
    applicationFee,
  };
}

/**
 * Validate payment can be processed
 */
export function validatePayment(params: {
  amount: number;
  customerId: string;
  connectAccountId: string;
}): void {
  // Minimum fare: $5.00
  if (params.amount < 500) {
    throw new Error('Fare must be at least $5.00');
  }

  // Maximum fare: $200.00 (prevent fraud)
  if (params.amount > 20000) {
    throw new Error('Fare cannot exceed $200.00');
  }

  if (!params.customerId || !params.customerId.startsWith('cus_')) {
    throw new Error('Invalid Stripe customer ID');
  }

  if (
    !params.connectAccountId ||
    !params.connectAccountId.startsWith('acct_')
  ) {
    throw new Error('Invalid Stripe Connect account ID');
  }
}

/**
 * Calculate refund amount based on cancellation timing
 */
export function calculateRefund(params: {
  originalAmount: number;
  cancellationFee: number;
}): {
  refundAmount: number;
  cancellationFee: number;
} {
  const refundAmount = params.originalAmount - params.cancellationFee;

  return {
    refundAmount: Math.max(0, refundAmount),
    cancellationFee: params.cancellationFee,
  };
}

/**
 * Format amount in cents to dollars for display
 */
export function formatCurrency(amountCents: number): string {
  return `$${(amountCents / 100).toFixed(2)}`;
}

/**
 * Security: Validate all payment parameters before processing
 */
export function validateEscrowParams(params: EscrowParams): void {
  if (!params.rideId || typeof params.rideId !== 'string') {
    throw new Error('Invalid ride ID');
  }

  if (!params.riderId || typeof params.riderId !== 'string') {
    throw new Error('Invalid rider ID');
  }

  if (!params.driverId || typeof params.driverId !== 'string') {
    throw new Error('Invalid driver ID');
  }

  validatePayment({
    amount: params.baseFare,
    customerId: params.stripeCustomerId,
    connectAccountId: params.stripeConnectAccountId,
  });

  if (params.distance <= 0 || params.distance > 100) {
    throw new Error('Invalid distance (must be between 0 and 100 miles)');
  }

  if (params.estimatedDuration <= 0 || params.estimatedDuration > 300) {
    throw new Error('Invalid duration (must be between 0 and 300 minutes)');
  }
}
