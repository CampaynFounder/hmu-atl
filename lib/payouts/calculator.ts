import type { Tier } from '../db/types';

export interface PayoutCalculation {
  gross: number;
  fee: number;
  net: number;
}

const FREE_FEE_RATE = 0.25;
const HMU_FIRST_FEE_RATE = 0.15;

/**
 * Calculate gross, fee, and net for a payout.
 * Free tier:      fee = amount * 0.25
 * HMU First tier: fee = amount * 0.15
 */
export function calculateFee(amount: number, tier: Tier): PayoutCalculation {
  const rate = tier === 'hmu_first' ? HMU_FIRST_FEE_RATE : FREE_FEE_RATE;
  const fee = Math.round(amount * rate * 100) / 100;
  return { gross: amount, fee, net: Math.round((amount - fee) * 100) / 100 };
}

/**
 * Returns how much a driver saves by being on HMU First vs Free tier.
 * Powers the "Switch and keep $X more" UI copy.
 */
export function getHMUFirstSavings(amount: number): number {
  const freeFee = amount * FREE_FEE_RATE;
  const hmuFee = amount * HMU_FIRST_FEE_RATE;
  return Math.round((freeFee - hmuFee) * 100) / 100;
}
