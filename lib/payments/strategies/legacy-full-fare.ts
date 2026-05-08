// LegacyFullFareStrategy — wraps the existing capture-at-Start-Ride math 1:1.
// All numbers produced here MUST match what escrow.ts produces today, so that
// flipping escrow.ts to delegate via the resolver in a later phase is a pure
// refactor with zero observable change.

import { calculateFullBreakdown } from '../fee-calculator';
import { calculateDepositAmount, calculateCancelSplit, getHoldPolicy } from '../hold-policy';
import type {
  PricingStrategy,
  HoldInput,
  HoldDecision,
  CaptureInput,
  CaptureDecision,
  NoShowInput,
  NoShowDecision,
  CancelInput,
  CancelDecision,
} from './types';

export class LegacyFullFareStrategy implements PricingStrategy {
  readonly modeKey = 'legacy_full_fare';
  readonly displayName = 'Legacy full-fare';
  readonly allowsCashOnly = true;

  async calculateHold(input: HoldInput): Promise<HoldDecision> {
    const policy = await getHoldPolicy(input.driverTier);
    const deposit = calculateDepositAmount(input.agreedPrice, input.addOnReserve, policy);
    // Legacy mode authorizes the FULL ride amount + add-on reserve so we can
    // capture in full at Start Ride. visible_deposit is purely a UI affordance.
    const totalHold = input.agreedPrice + input.addOnReserve;
    return {
      authorizeAmountCents: Math.round(totalHold * 100),
      visibleDeposit: deposit.visibleDeposit,
      ridePrice: input.agreedPrice,
      addOnReserve: input.addOnReserve,
      holdMode: deposit.holdMode,
    };
  }

  async calculateCapture(input: CaptureInput): Promise<CaptureDecision> {
    const totalRideAmount = input.agreedPrice + input.addOnTotal;

    const breakdown = calculateFullBreakdown(
      totalRideAmount,
      input.driverTier,
      input.driverPayoutMethod,
      input.cumulativeDailyEarnings,
      input.dailyFeePaid,
      input.weeklyFeePaid,
    );

    const platformFee = breakdown.platformFee;
    const actualFee = input.inFreeWindow ? 0 : platformFee;
    const waivedFee = input.inFreeWindow ? platformFee : 0;

    const driverReceives = input.inFreeWindow
      ? Math.round(breakdown.netAfterStripe * 100) / 100
      : breakdown.driverReceives;
    const platformReceives = input.inFreeWindow
      ? Math.round(breakdown.stripeFee * 100) / 100
      : breakdown.platformReceives;

    return {
      captureAmountCents: Math.round(totalRideAmount * 100),
      applicationFeeCents: Math.round(actualFee * 100),
      driverReceives,
      platformReceives,
      stripeFee: breakdown.stripeFee,
      platformFee,
      waivedFee,
      dailyCapHit: !input.inFreeWindow && breakdown.dailyCapHit,
      weeklyCapHit: breakdown.weeklyCapHit,
      tierLabel: breakdown.tierLabel,
    };
  }

  async calculateNoShow(input: NoShowInput): Promise<NoShowDecision> {
    // Legacy split (matches escrow.partialCaptureNoShow):
    //   25% → driver 25% of base, platform 5% of base, rider refunded 70%
    //   50% → driver 50% of base, platform 10% of base, rider refunded 40%
    // Add-ons are 100% refunded on no-show.
    const platformPercent = input.noShowPercent === 25 ? 5 : 10;
    const driverAmount = Math.round(input.baseFare * (input.noShowPercent / 100) * 100) / 100;
    const platformAmount = Math.round(input.baseFare * (platformPercent / 100) * 100) / 100;
    const captureTotal = driverAmount + platformAmount;
    const riderRefunded = input.baseFare - captureTotal;

    return {
      captureAmountCents: Math.round(captureTotal * 100),
      applicationFeeCents: Math.round(platformAmount * 100),
      driverAmount,
      platformAmount,
      riderRefunded,
      addOnRefunded: input.addOnReserve,
    };
  }

  async calculateCancel(input: CancelInput): Promise<CancelDecision> {
    const policy = await getHoldPolicy(input.driverTier);
    const split = calculateCancelSplit(input.visibleDeposit, input.phase, policy);
    const captureTotal = split.driverReceives + split.platformReceives;

    return {
      captureAmountCents: Math.round(captureTotal * 100),
      applicationFeeCents: Math.round(split.platformReceives * 100),
      driverAmount: split.driverReceives,
      platformAmount: split.platformReceives,
      riderRefunded: split.riderRefunded,
    };
  }
}

export const legacyFullFareStrategy = new LegacyFullFareStrategy();
