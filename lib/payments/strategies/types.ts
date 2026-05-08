// PricingStrategy interface — encapsulates the four payment-touching decisions
// that vary between pricing modes. The Stripe API calls themselves stay in
// escrow.ts; strategies only decide AMOUNTS.
//
// Phase A wires up the legacy_full_fare implementation (zero behavior change).
// Phase B adds DepositOnlyStrategy.

export type ModeKey = 'legacy_full_fare' | 'deposit_only' | string;

export interface PricingStrategy {
  modeKey: ModeKey;
  displayName: string;

  /**
   * Whether this strategy permits the legacy "full cash, no Stripe" path.
   * legacy_full_fare = true (cash-only drivers can opt out of Stripe entirely).
   * deposit_only = false (every ride must authorize a digital deposit; the
   * remainder is collected as cash on arrival, but Stripe is never bypassed).
   */
  readonly allowsCashOnly: boolean;

  /** Decide what Stripe authorizes at Pull Up + what shows to the rider. */
  calculateHold(input: HoldInput): Promise<HoldDecision>;

  /** Decide capture + application_fee at Start Ride. */
  calculateCapture(input: CaptureInput): Promise<CaptureDecision>;

  /** Decide capture + application_fee on no-show. */
  calculateNoShow(input: NoShowInput): Promise<NoShowDecision>;

  /** Decide capture + application_fee on voluntary post-OTW cancel. */
  calculateCancel(input: CancelInput): Promise<CancelDecision>;
}

// ── Hold (Pull Up) ──

export interface HoldInput {
  driverId: string;
  riderId: string;
  driverTier: 'free' | 'hmu_first';
  agreedPrice: number;     // total ride fare in dollars
  addOnReserve: number;    // add-on reserve buffer in dollars
  /**
   * Deposit-only mode: caller-selected deposit amount in dollars. Per the
   * locked launch flow, the DRIVER selects this (defaulting to their
   * driver_profiles.deposit_floor); the strategy clamps to admin bounds.
   * Ignored by legacy_full_fare.
   */
  selectedDeposit?: number;
}

export interface HoldDecision {
  /** What Stripe authorizes on the rider's PM (cents). */
  authorizeAmountCents: number;
  /** Deposit shown to rider in UI (dollars). */
  visibleDeposit: number;
  ridePrice: number;
  addOnReserve: number;
  /** Tag for telemetry / ledger context. */
  holdMode: string;
}

// ── Capture (Start Ride) ──

export interface CaptureInput {
  driverId: string;
  rideId: string;
  /** Base fare from rides.final_agreed_price (dollars). Used by legacy_full_fare. */
  agreedPrice: number;
  /** Confirmed add-ons at capture time (dollars). Used by legacy_full_fare. */
  addOnTotal: number;
  /** Deposit set at hold time (rides.visible_deposit). Used by deposit_only. */
  visibleDeposit: number;
  driverTier: 'free' | 'hmu_first';
  driverPayoutMethod: string;
  cumulativeDailyEarnings: number;
  dailyFeePaid: number;
  weeklyFeePaid: number;
  /** Driver is in launch-offer free window — fee waived. */
  inFreeWindow: boolean;
}

export interface CaptureDecision {
  captureAmountCents: number;
  applicationFeeCents: number;
  /** Pre-rounded display values (dollars). */
  driverReceives: number;
  platformReceives: number;
  stripeFee: number;
  /** Platform fee BEFORE waiver. */
  platformFee: number;
  /** Amount waived this ride (0 unless inFreeWindow). */
  waivedFee: number;
  dailyCapHit: boolean;
  weeklyCapHit: boolean;
  tierLabel: string;
}

// ── No-show ──

export interface NoShowInput {
  driverId: string;
  rideId: string;
  /** Base fare (dollars). Used by legacy_full_fare. */
  baseFare: number;
  /** Deposit set at hold time (rides.visible_deposit). Used by deposit_only. */
  visibleDeposit: number;
  addOnReserve: number;
  /** 25 | 50 in legacy mode; 100 in deposit_only mode. */
  noShowPercent: number;
}

export interface NoShowDecision {
  captureAmountCents: number;
  applicationFeeCents: number;
  driverAmount: number;
  platformAmount: number;
  riderRefunded: number;
  addOnRefunded: number;
}

// ── Voluntary cancel (post-OTW) ──

export interface CancelInput {
  driverId: string;
  rideId: string;
  visibleDeposit: number;
  phase: 'before_otw' | 'after_otw';
  driverTier: 'free' | 'hmu_first';
}

export interface CancelDecision {
  captureAmountCents: number;
  applicationFeeCents: number;
  driverAmount: number;
  platformAmount: number;
  riderRefunded: number;
}
