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

  /**
   * Build the post-ride breakdown shown on the ride-end page. Each strategy
   * owns its own row set + labels — the UI just renders whatever it gets.
   * Pure function over the values already on the row + per-extra rows;
   * no DB or Stripe calls.
   */
  buildBreakdownRows(input: BreakdownInput): BreakdownResult;
}

// ── Ride-end breakdown ──

export interface BreakdownExtra {
  id: string;
  name: string;
  subtotal: number;
  driverAmount: number;
  platformFee: number;
  status: string;
  chargeStatus: string | null;
}

export interface BreakdownInput {
  isCash: boolean;
  agreedPrice: number;
  visibleDeposit: number;
  addOnTotal: number;
  /** Driver's net from the deposit/main capture (rides.driver_payout_amount). */
  driverPayoutAmount: number;
  /** Platform's fee from the deposit/main capture (rides.platform_fee_amount). */
  platformFeeAmount: number;
  /** Stripe processing fee on the deposit/main capture (rides.stripe_fee_amount). */
  stripeFeeAmount: number;
  /** Sum of driver_amount across succeeded extras. */
  extrasDriverAmount: number;
  /** Sum of platform_fee across succeeded extras. */
  extrasPlatformFee: number;
  /** Sum of stripe_fee across succeeded extras. */
  extrasStripeFee: number;
  /** Per-extra detail (succeeded + failed both included). */
  extras: BreakdownExtra[];
}

export interface BreakdownRow {
  label: string;
  value: number; // dollars
  /** Visual treatment. 'total' = grand total at the bottom. */
  role: 'amount' | 'muted' | 'total';
  /**
   * Audience: 'public' rows show to riders too; 'driver_only' rows are hidden
   * on the rider side (HMU Split, Stripe Fee, etc).
   */
  audience: 'public' | 'driver_only';
}

export interface BreakdownResult {
  modeKey: ModeKey;
  isCash: boolean;
  /** Driver's total income (headline number above the rows). */
  youEarned: number;
  /** Grand total — must equal the sum of every row except `youEarned`. */
  total: number;
  rows: BreakdownRow[];
  extras: BreakdownExtra[];
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
